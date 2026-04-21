import { GoogleGenAI, Type } from '@google/genai';
import type { Part, FunctionDeclaration, Schema } from '@google/genai';
import type { LLMProvider, StreamChunk, StreamChatParams, MessageContentBlock, ChatMessage } from '../llm-provider';

function toGeminiContent(content: string | MessageContentBlock[], messages: ChatMessage[]): Part[] {
  if (typeof content === 'string') return [{ text: content }];
  return content.map(block => {
    switch (block.type) {
      case 'text':
        return { text: block.text };
      case 'image':
        return {
          inlineData: { mimeType: block.media_type, data: block.data },
        };
      case 'tool_use': {
        const part: Part = { functionCall: { id: block.id, name: block.name, args: block.input } };
        // Any explicitly given thought_signature MUST be returned exactly as received on the first functionCall part
        if (block.thought_signature) {
           part.thoughtSignature = block.thought_signature;
        }
        return part;
      }
      case 'tool_result': {
        let toolName = 'tool';
        for (const m of messages) {
          if (Array.isArray(m.content)) {
            const match = m.content.find(b => b.type === 'tool_use' && b.id === block.tool_use_id);
            if (match && match.type === 'tool_use') {
              toolName = match.name;
              break;
            }
          }
        }
        return { functionResponse: { id: block.tool_use_id, name: toolName, response: { content: block.content } } };
      }
    }
  });
}

function convertSchemaTypes(schema: unknown): Schema {
  if (!schema || typeof schema !== 'object') return schema as Schema;
  const result: Record<string, unknown> = { ...schema as Record<string, unknown> };

  if (typeof result.type === 'string') {
    const typeStr = result.type.toUpperCase();
    if (Object.values(Type).includes(typeStr as Type)) {
      result.type = typeStr as Type;
    }
  }

  if (result.properties && typeof result.properties === 'object') {
    const newProps: Record<string, Schema> = {};
    for (const [key, value] of Object.entries(result.properties as Record<string, unknown>)) {
      newProps[key] = convertSchemaTypes(value);
    }
    result.properties = newProps;
  }

  if (result.items) {
    result.items = convertSchemaTypes(result.items);
  }

  return result as Schema;
}

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini';
  readonly name = 'Google Gemini';

  private client: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set');
    this.client = new GoogleGenAI({ apiKey });
  }

  async *streamChat({ systemPrompt, messages, model, tools }: StreamChatParams): AsyncGenerator<StreamChunk> {
    try {
      const formattedMessages = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: toGeminiContent(m.content, messages)
      }));

      const config: Record<string, unknown> = {
        systemInstruction: systemPrompt,
      };

      if (tools && tools.length > 0) {
        const mappedTools: FunctionDeclaration[] = tools.map(t => {
          const convertedSchema = convertSchemaTypes(t.input_schema);
          return {
            name: t.name,
            description: t.description,
            parameters: {
              ...convertedSchema,
              type: Type.OBJECT
            } as Schema,
          };
        });
        config.tools = [{ functionDeclarations: mappedTools }];
      }

      const stream = await this.client.models.generateContentStream({
        model: model,
        contents: formattedMessages,
        config: config
      });

      for await (const chunk of stream) {
        if (chunk.candidates && chunk.candidates.length > 0 && chunk.candidates[0].content?.parts) {
          for (const part of chunk.candidates[0].content.parts) {
            if (part.functionCall) {
              const call = part.functionCall;
              yield {
                type: 'tool_use',
                toolUse: {
                  id: call.id || `gen_${Math.random().toString(36).substring(2)}`,
                  name: call.name || '',
                  input: call.args || {},
                  thought_signature: part.thoughtSignature
                }
              };
            }
            if (part.text) {
              yield { type: 'text', text: part.text };
            }
          }
        } else {
          // Fallback just in case parts are not structured that way but convenience properties are available
          if (chunk.functionCalls && chunk.functionCalls.length > 0) {
            for (const call of chunk.functionCalls) {
              yield {
                type: 'tool_use',
                toolUse: {
                  id: call.id || `gen_${Math.random().toString(36).substring(2)}`,
                  name: call.name || '',
                  input: call.args || {},
                }
              };
            }
          }
          if (chunk.text) {
            yield { type: 'text', text: chunk.text };
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
    try {
      const response = await this.client.models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: [
          { role: 'user', parts: [{ text: `以下のメッセージに対して、5〜10文字程度の短い会話タイトルを日本語で生成してください。タイトルのみを返してください。\n\n${firstMessage}` }] }
        ],
        config: {
          maxOutputTokens: 30,
        }
      });

      return response.text?.trim() ?? firstMessage.slice(0, 30);
    } catch {
      return firstMessage.slice(0, 30);
    }
  }
}
