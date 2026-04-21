import type { LLMProvider, StreamChunk, ChatMessage, StreamChatParams, MessageContentBlock } from './llm-provider';

export type { StreamChunk, ChatMessage };

function toAnthropicContent(content: string | MessageContentBlock[]) {
  if (typeof content === 'string') return content;
  return content.map(block => {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
      case 'image':
        return {
          type: 'image',
          source: { type: 'base64', media_type: block.media_type, data: block.data },
        };
      case 'tool_use':
        return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
      case 'tool_result':
        return { type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content };
    }
  });
}

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic Claude';

  private readonly apiKey: string;

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    this.apiKey = key;
  }

  async *streamChat({ systemPrompt, messages, model, maxTokens = 8192, tools }: StreamChatParams): AsyncGenerator<StreamChunk> {
    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      stream: true,
      messages: messages.map(m => ({ role: m.role, content: toAnthropicContent(m.content) })),
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      yield { type: 'error', error: `API error ${response.status}: ${err}` };
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    let currentBlockType = '';
    let currentToolId = '';
    let currentToolName = '';
    let currentToolInputJson = '';
    const pendingToolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            for (const tu of pendingToolUses) yield { type: 'tool_use', toolUse: tu };
            yield { type: 'done' };
            return;
          }
          try {
            const event = JSON.parse(data);

            if (event.type === 'content_block_start') {
              currentBlockType = event.content_block?.type ?? '';
              if (currentBlockType === 'tool_use') {
                currentToolId = event.content_block.id ?? '';
                currentToolName = event.content_block.name ?? '';
                currentToolInputJson = '';
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta?.type === 'text_delta') {
                yield { type: 'text', text: event.delta.text };
              } else if (event.delta?.type === 'input_json_delta') {
                currentToolInputJson += event.delta.partial_json ?? '';
              }
            } else if (event.type === 'content_block_stop') {
              if (currentBlockType === 'tool_use') {
                try {
                  const input = JSON.parse(currentToolInputJson || '{}') as Record<string, unknown>;
                  pendingToolUses.push({ id: currentToolId, name: currentToolName, input });
                } catch {
                  // malformed tool input JSON
                }
                currentBlockType = '';
                currentToolInputJson = '';
              }
            } else if (event.type === 'message_stop') {
              for (const tu of pendingToolUses) yield { type: 'tool_use', toolUse: tu };
              yield { type: 'done' };
              return;
            } else if (event.type === 'error') {
              yield { type: 'error', error: event.error?.message ?? 'Unknown error' };
              return;
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }

  async generateTitle(firstMessage: string): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 30,
        messages: [
          {
            role: 'user',
            content: `以下のメッセージに対して、5〜10文字程度の短い会話タイトルを日本語で生成してください。タイトルのみを返してください。\n\n${firstMessage}`,
          },
        ],
      }),
    });

    if (!response.ok) return firstMessage.slice(0, 30);
    const data = await response.json() as { content?: Array<{ text?: string }> };
    return data.content?.[0]?.text?.trim() ?? firstMessage.slice(0, 30);
  }
}
