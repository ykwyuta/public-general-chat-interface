# LLM組み込みガイド

このドキュメントでは、general-chat-interfaceに任意のLLMプロバイダーを組み込む方法を説明します。

---

## 1. アーキテクチャ概要

チャットUIとLLMの橋渡しは、Next.jsのApp Routerを利用した以下のクライアント・サーバーの層構造になっています。

```
Browser (React App)
    │  useChat (hooks/useChat.ts)
    │   └─ fetch('/api/chat', { provider, messages, ... })
    ▼
Next.js API Route (app/api/chat/route.ts)
    │
    ▼
getProvider(providerId)  ←── プロバイダーレジストリ (src/lib/providers/index.ts)
    │
    ▼
LLMProvider インターフェース (src/lib/llm-provider.ts)
    │
    ├── AnthropicProvider (src/lib/anthropic.ts)   ← デフォルト実装
    ├── GeminiProvider    (src/lib/providers/gemini.ts)
    ├── BedrockProvider   (src/lib/providers/bedrock.ts)
    └── OpenAIProvider    (独自実装例)
```

APIルート (`/api/chat`) は `LLMProvider` インターフェースのみを知っており、具体的なプロバイダーに依存しません。プロバイダーのIDを渡すだけで動的にプロバイダーを切り替え、LLMを利用できます。すべてのAPIキーはサーバーサイド（環境変数）で管理され、ブラウザに露出することはありません。

---

## 2. LLMProvider インターフェース

**`src/lib/llm-provider.ts`** に定義されています。

```typescript
export interface StreamChunk {
  type: 'text' | 'tool_use' | 'done' | 'error';
  text?: string;
  error?: string;
  toolUse?: { id: string; name: string; input: Record<string, unknown> };
}

export type MessageContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; media_type: string; data: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
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

export interface LLMProvider {
  readonly id: string;
  readonly name: string;

  streamChat(params: StreamChatParams): AsyncGenerator<StreamChunk>;
  generateTitle(firstMessage: string): Promise<string>;
}
```

---

## 3. カスタムプロバイダーの実装

### 3.1 最小実装

`LLMProvider` を実装したクラスを作成します。APIキー等の認証情報は、ブラウザから渡されるのではなく、サーバー側の環境変数から読み取ります。

```typescript
// src/lib/providers/my-provider.ts
import type { LLMProvider, StreamChunk, StreamChatParams } from '../llm-provider';

export class MyProvider implements LLMProvider {
  readonly id = 'my-provider';
  readonly name = 'My Custom LLM';
  private readonly apiKey: string;

  constructor() {
    // 環境変数からAPIキーを取得
    const key = process.env.MY_PROVIDER_API_KEY;
    if (!key) throw new Error('MY_PROVIDER_API_KEY environment variable is not set');
    this.apiKey = key;
  }

  async *streamChat({ systemPrompt, messages, model }: StreamChatParams): AsyncGenerator<StreamChunk> {
    // LLM APIを呼び出してストリーミング応答を返す
    const response = await fetch('https://your-llm-api.example.com/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      // 実際には messages の型変換 (MessageContentBlock -> 各プロバイダー独自の型) が必要になる場合があります
      body: JSON.stringify({ model, systemPrompt, messages, stream: true }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `API error ${response.status}` };
      return;
    }

    // SSEを読み取る
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
          if (data === '[DONE]') { yield { type: 'done' }; return; }

          try {
            const event = JSON.parse(data);
            const text = event.choices?.[0]?.delta?.content;
            if (text) yield { type: 'text', text };
          } catch {
            // skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }

  async generateTitle(firstMessage: string): Promise<string> {
    // 軽量なリクエストでタイトルを生成する
    // 実装が難しい場合は先頭30文字をフォールバックとして返すだけでも可
    return firstMessage.slice(0, 30);
  }
}
```

### 3.2 プロバイダーを登録する

`src/lib/providers/index.ts` の `getProvider` 関数を修正し、新しく作成したプロバイダーを返せるようにします。

```typescript
// src/lib/providers/index.ts
import type { LLMProvider } from '../llm-provider';
import { AnthropicProvider } from '../anthropic';
import { MyProvider } from './my-provider'; // 追加

export function getProvider(providerId: string): LLMProvider {
  switch (providerId) {
    case 'my-provider':
      return new MyProvider(); // 追加
    case 'anthropic':
    default:
      return new AnthropicProvider();
  }
}
```

### 3.3 Settings でプロバイダーを選択する

Zustandストア (`Settings.provider`) に登録したIDを設定することで、UIでプロバイダーを切り替えることができます。

```typescript
import { useChatStore } from '@/stores/chatStore';

// プログラムで切り替える例
useChatStore.getState().updateSettings({
  provider: 'my-provider',
  model: 'your-model-id', // SettingsModal 等から設定
});
```

APIキーは `.env.local` などのサーバー環境変数に追加します。
```env
MY_PROVIDER_API_KEY=your-api-key
```

---

## 4. 実装例：OpenAI GPT

```typescript
// src/lib/providers/openai.ts
import type { LLMProvider, StreamChunk, StreamChatParams } from '../llm-provider';

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI GPT';
  private readonly apiKey: string;

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY environment variable is not set');
    this.apiKey = key;
  }

  async *streamChat({ systemPrompt, messages, model, maxTokens = 8192, tools }: StreamChatParams): AsyncGenerator<StreamChunk> {
    // Note: 実際の環境では `MessageContentBlock` からOpenAIのフォーマットへ変換する関数が必要です。
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({
             role: m.role,
             content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) // 単純化した例
          })),
        ],
        // tools: tools, // ツールが必要な場合は OpenAI のフォーマットに変換して渡す
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      yield { type: 'error', error: `OpenAI API error ${response.status}: ${err}` };
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
          if (data === '[DONE]') { yield { type: 'done' }; return; }

          try {
            const event = JSON.parse(data);
            const text = event.choices?.[0]?.delta?.content;
            if (text) yield { type: 'text', text };

            // ツール呼び出し（function call）が含まれている場合は `tool_use` chunk を yield します。
            const toolCalls = event.choices?.[0]?.delta?.tool_calls;
            if (toolCalls) {
              for (const call of toolCalls) {
                if (call.function) {
                  yield {
                    type: 'tool_use',
                    toolUse: {
                      id: call.id,
                      name: call.function.name,
                      input: JSON.parse(call.function.arguments || '{}')
                    }
                  }
                }
              }
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
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
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
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() ?? firstMessage.slice(0, 30);
  }
}
```

**登録例：**

```typescript
// src/lib/providers/index.ts
import { OpenAIProvider } from './openai';

export function getProvider(providerId: string): LLMProvider {
  switch (providerId) {
    case 'openai':
      return new OpenAIProvider();
    // ...
  }
}
```

---

## 5. APIキーの隠蔽とバックエンドプロキシについて

現在の Next.js App Router アーキテクチャでは、**すべての LLM 呼び出しは `app/api/chat/route.ts` というサーバーサイドのAPIルートを経由**します。

```
Browser (React App)
    │  fetch('/api/chat', { messages, model, systemPrompt })
    ▼
Next.js API Route (app/api/chat/route.ts)
    │  Authorization: Bearer <process.env.YOUR_API_KEY>
    ▼
LLM API (Anthropic / OpenAI / Gemini など)
```

このため、**ブラウザ側にAPIキーが露出することはなく、特別な「ProxyProvider」を作成する必要はありません。** 新しいLLMを追加する場合は、常にサーバーサイドで動作する `LLMProvider` を実装し、`process.env` からAPIキーを読み込むだけでセキュアに運用できます。

---

## 6. 実装例：Ollama（ローカルLLM）

[Ollama](https://ollama.com/) を使ってローカルで動くLLMを接続する例です。

```typescript
// src/lib/providers/ollama.ts
import type { LLMProvider, StreamChunk, StreamChatParams } from '../llm-provider';

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama';
  readonly name = 'Ollama (Local)';

  // 環境変数 OLLAMA_BASE_URL があれば使用、なければデフォルト
  private readonly baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  async *streamChat({ systemPrompt, messages, model }: StreamChatParams): AsyncGenerator<StreamChunk> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
          })),
        ],
      }),
    });

    if (!response.ok) {
      yield { type: 'error', error: `Ollama error ${response.status}` };
      return;
    }

    // Ollama は NDJSON (改行区切りJSON) を返す
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.message?.content) {
              yield { type: 'text', text: event.message.content };
            }
            if (event.done) {
              yield { type: 'done' };
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
    return firstMessage.slice(0, 30);
  }
}
```

**登録例：**

```typescript
// src/lib/providers/index.ts
import { OllamaProvider } from './ollama';

export function getProvider(providerId: string): LLMProvider {
  switch (providerId) {
    case 'ollama':
      return new OllamaProvider();
    // ...
  }
}
```

---

## 7. ファイル構成まとめ

```
general-chat-interface/
├── app/
│   └── api/
│       └── chat/
│           └── route.ts         # ブラウザからのリクエストを受け取り、getProviderでLLMを呼び出しSSEで返す
├── src/
│   ├── lib/
│   │   ├── llm-provider.ts      # LLMProvider インターフェース定義
│   │   ├── anthropic.ts         # AnthropicProvider
│   │   └── providers/
│   │       ├── index.ts         # getProvider (プロバイダーの切り替え)
│   │       ├── gemini.ts        # GeminiProvider
│   │       ├── bedrock.ts       # BedrockProvider
│   │       └── openai.ts        # OpenAI 実装例（要追加）
│   ├── hooks/
│   │   └── useChat.ts           # フロントエンドから fetch('/api/chat') を呼び出す
│   └── stores/
│       └── chatStore.ts         # Settings.provider で使用プロバイダーを管理
└── .env.local                   # APIキーの設定
```

---

## 8. ストリーミングが不要な場合

非ストリーミングAPIの場合でも `streamChat` として実装できます。レスポンスを受け取ったあと一括で `yield` するだけです。

```typescript
async *streamChat({ systemPrompt, messages, model }: StreamChatParams): AsyncGenerator<StreamChunk> {
  const response = await fetch('https://your-api.example.com/v1/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.MY_API_KEY}` },
    body: JSON.stringify({ model, systemPrompt, messages }), // 適宜フォーマット変換が必要
  });

  if (!response.ok) {
    yield { type: 'error', error: `API error ${response.status}` };
    return;
  }

  const data = await response.json();
  const text = data.content ?? data.choices?.[0]?.message?.content ?? '';

  // 一括で返す（ストリームなし）
  yield { type: 'text', text };
  yield { type: 'done' };
}
```

---

## 9. よくある問題

### ストリーミングの途中でエラーが出た場合

`streamChat` で `{ type: 'error', error: '...' }` を yield すると、UIにエラーメッセージが表示されます。`return` でジェネレーターを終了させてください。

### 会話タイトルを自動生成したくない

`generateTitle` で `firstMessage.slice(0, 30)` をそのまま返せば、LLM呼び出しは行われません。
