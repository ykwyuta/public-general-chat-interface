export interface StreamChunk {
  type: 'text' | 'tool_use' | 'done' | 'error';
  text?: string;
  error?: string;
  toolUse?: { id: string; name: string; input: Record<string, unknown>; thought_signature?: string };
}

export type MessageContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; media_type: string; data: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; thought_signature?: string }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | MessageContentBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface StreamChatParams {
  systemPrompt: string;
  messages: ChatMessage[];
  model: string;
  maxTokens?: number;
  tools?: ToolDefinition[];
}

/**
 * LLMプロバイダーのインターフェース。
 * このインターフェースを実装することで任意のLLMをチャットUIに接続できる。
 */
export interface LLMProvider {
  /** プロバイダーの一意識別子 (例: 'anthropic', 'openai') */
  readonly id: string;
  /** プロバイダーの表示名 */
  readonly name: string;

  /**
   * ストリーミング形式でアシスタントの返答を生成する。
   * AsyncGeneratorとしてStreamChunkを順次yieldする。
   */
  streamChat(params: StreamChatParams): AsyncGenerator<StreamChunk>;

  /**
   * 最初のユーザーメッセージから会話タイトルを生成する。
   * 失敗した場合はfirstMessageの先頭30文字を返すなどのフォールバックを推奨する。
   */
  generateTitle(firstMessage: string): Promise<string>;
}
