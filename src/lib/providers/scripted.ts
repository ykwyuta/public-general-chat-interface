import type { LLMProvider, StreamChunk, StreamChatParams, ChatMessage, MessageContentBlock } from '../llm-provider';

export type ScriptedStep =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool_name: string; tool_input: Record<string, unknown>; mock_result: string }
  | { type: 'error'; error: string };

export interface ScriptedTurn {
  match: string;
  steps: ScriptedStep[];
}

export interface ProviderScript {
  id: string;
  name: string;
  description: string;
  category?: 'tool' | 'ui' | 'task';
  turns: ScriptedTurn[];
}

// Server-side script registry (populated at module load time)
const scriptRegistry = new Map<string, ProviderScript>();

export function registerScript(script: ProviderScript): void {
  scriptRegistry.set(script.id, script);
}

export function getRegisteredScript(id: string): ProviderScript | undefined {
  return scriptRegistry.get(id);
}

function hasToolResultInLastMessage(messages: ChatMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== 'user') return false;
  if (typeof last.content === 'string') return false;
  return (last.content as MessageContentBlock[]).some(b => b.type === 'tool_result');
}

function extractLastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'user') continue;
    if (typeof msg.content === 'string' && msg.content.trim()) return msg.content;
    if (Array.isArray(msg.content)) {
      for (const block of msg.content as MessageContentBlock[]) {
        if (block.type === 'text' && block.text.trim()) return block.text;
      }
    }
  }
  return '';
}

async function* streamText(text: string): AsyncGenerator<StreamChunk> {
  for (const char of text) {
    yield { type: 'text', text: char };
    await new Promise(r => setTimeout(r, 15));
  }
}

export class ScriptedProvider implements LLMProvider {
  readonly id = 'scripted';
  readonly name = 'Scripted Demo';

  private findMatchingTurn(script: ProviderScript, userText: string): ScriptedTurn {
    for (const turn of script.turns) {
      if (new RegExp(turn.match).test(userText)) return turn;
    }
    return script.turns[script.turns.length - 1];
  }

  async *streamChat(params: StreamChatParams): AsyncGenerator<StreamChunk> {
    const scriptId = params.model;
    const script = scriptRegistry.get(scriptId);

    if (!script) {
      yield { type: 'error', error: `スクリプト "${scriptId}" が見つかりません。` };
      return;
    }

    const afterTool = hasToolResultInLastMessage(params.messages);
    const userText = extractLastUserText(params.messages);
    const turn = this.findMatchingTurn(script, userText);

    // Find the index of the last tool_use step to split before/after phases
    let lastToolUseIdx = -1;
    for (let i = turn.steps.length - 1; i >= 0; i--) {
      if (turn.steps[i].type === 'tool_use') { lastToolUseIdx = i; break; }
    }

    const steps = afterTool && lastToolUseIdx >= 0
      ? turn.steps.slice(lastToolUseIdx + 1)   // 2回目: ツール後のテキスト
      : lastToolUseIdx >= 0
        ? turn.steps.slice(0, lastToolUseIdx + 1) // 1回目: テキスト + ツール群
        : turn.steps;                              // ツールなし: 全ステップ

    for (const step of steps) {
      if (step.type === 'text') {
        yield* streamText(step.text);
      } else if (step.type === 'tool_use') {
        yield {
          type: 'tool_use',
          toolUse: {
            id: `scripted_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: step.tool_name,
            input: step.tool_input,
          },
        };
      } else if (step.type === 'error') {
        yield { type: 'error', error: step.error };
        return;
      }
    }

    yield { type: 'done' };
  }

  async generateTitle(firstMessage: string): Promise<string> {
    return firstMessage.slice(0, 30) || 'デモ会話';
  }
}

/** スクリプト内の全 tool_use ステップから mock_result を集めて MockExecutor を生成する */
export function createMockExecutorFromScript(script: ProviderScript): (name: string, input: Record<string, unknown>) => string {
  const results = new Map<string, string>();
  for (const turn of script.turns) {
    for (const step of turn.steps) {
      if (step.type === 'tool_use') {
        results.set(step.tool_name, step.mock_result);
      }
    }
  }
  return (name: string) => {
    const result = results.get(name) ?? `[mock] ${name} の結果`;
    if (result.startsWith('__ERROR__:')) {
      throw new Error(result.slice('__ERROR__:'.length).trim());
    }
    return result;
  };
}
