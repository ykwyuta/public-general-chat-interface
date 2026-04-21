import { BedrockRuntimeClient, ConverseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import type { Message, ContentBlock, Tool } from '@aws-sdk/client-bedrock-runtime';
import type { LLMProvider, StreamChunk, StreamChatParams, MessageContentBlock } from '../llm-provider';

function toBedrockContent(content: string | MessageContentBlock[]): ContentBlock[] {
  if (typeof content === 'string') return [{ text: content } as ContentBlock];

  return content.map((block): ContentBlock => {
    switch (block.type) {
      case 'text':
        return { text: block.text } as ContentBlock;
      case 'image': {
        const base64Data = block.data.replace(/^data:image\/\w+;base64,/, '');
        let format = block.media_type.split('/')[1] || 'jpeg';
        if (!['png', 'jpeg', 'gif', 'webp'].includes(format)) {
          format = 'jpeg';
        }
        return {
          image: {
            format: format as 'png' | 'jpeg' | 'gif' | 'webp',
            source: {
              bytes: Uint8Array.from(atob(base64Data), c => c.charCodeAt(0))
            }
          }
        } as ContentBlock;
      }
      case 'tool_use':
        return {
          toolUse: {
            toolUseId: block.id,
            name: block.name,
            input: block.input as any
          }
        } as ContentBlock;
      case 'tool_result':
        return {
          toolResult: {
            toolUseId: block.tool_use_id,
            content: typeof block.content === 'string' ? [{ text: block.content }] : block.content
          }
        } as ContentBlock;
      default:
        // fallback
        return { text: '' } as ContentBlock;
    }
  });
}

export class BedrockProvider implements LLMProvider {
  readonly id = 'bedrock';
  readonly name = 'AWS Bedrock';

  private client: BedrockRuntimeClient;

  constructor() {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION ?? 'us-east-1';

    this.client = new BedrockRuntimeClient({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  async *streamChat({ systemPrompt, messages, model, tools }: StreamChatParams): AsyncGenerator<StreamChunk> {
    try {
      const formattedMessages: Message[] = messages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: toBedrockContent(m.content)
      }));

      const toolConfig = tools && tools.length > 0 ? {
        tools: tools.map((t): Tool => ({
          toolSpec: {
            name: t.name,
            description: t.description,
            inputSchema: {
              json: t.input_schema as any
            }
          }
        }))
      } : undefined;

      const command = new ConverseStreamCommand({
        modelId: model,
        messages: formattedMessages,
        system: systemPrompt ? [{ text: systemPrompt }] : undefined,
        toolConfig: toolConfig,
      });

      const response = await this.client.send(command);

      let currentToolId = '';
      let currentToolName = '';
      let currentToolInputJson = '';
      const pendingToolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      if (response.stream) {
        for await (const chunk of response.stream) {
          if (chunk.contentBlockStart?.start?.toolUse) {
            const toolUse = chunk.contentBlockStart.start.toolUse;
            currentToolId = toolUse.toolUseId || '';
            currentToolName = toolUse.name || '';
            currentToolInputJson = '';
          }

          if (chunk.contentBlockDelta?.delta?.text) {
            yield { type: 'text', text: chunk.contentBlockDelta.delta.text };
          }

          if (chunk.contentBlockDelta?.delta?.toolUse) {
            currentToolInputJson += chunk.contentBlockDelta.delta.toolUse.input || '';
          }

          if (chunk.contentBlockStop) {
            if (currentToolId) {
              try {
                const input = JSON.parse(currentToolInputJson || '{}') as Record<string, unknown>;
                pendingToolUses.push({ id: currentToolId, name: currentToolName, input });
              } catch {
                // Ignore malformed JSON
              }
              currentToolId = '';
              currentToolName = '';
              currentToolInputJson = '';
            }
            // Yield tools as soon as they are fully received
            for (const tu of pendingToolUses) yield { type: 'tool_use', toolUse: tu };
            pendingToolUses.length = 0;

          }

          if (chunk.messageStop) {
            for (const tu of pendingToolUses) yield { type: 'tool_use', toolUse: tu };
            pendingToolUses.length = 0;
            break;
            break;
          }
        }
      }

      yield { type: 'done' };
    } catch (error: unknown) {
      if (error instanceof Error) {
        yield { type: 'error', error: error.message };
      } else {
        yield { type: 'error', error: String(error) };
      }
    }
  }

  async generateTitle(firstMessage: string): Promise<string> {
    return firstMessage.slice(0, 30);
  }
}
