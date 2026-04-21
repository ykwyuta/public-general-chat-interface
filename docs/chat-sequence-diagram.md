# Chat Request Sequence Diagram

チャット開始からLLMへのリクエスト、Tool呼び出し、結果返却までの処理フロー（実装レベル）

```mermaid
sequenceDiagram
    actor User
    participant InputArea as InputArea<br/>(components/chat/InputArea.tsx)
    participant useChat as useChat<br/>(hooks/useChat.ts)
    participant chatStore as chatStore<br/>(stores/chatStore.ts)
    participant ToolRegistry as ToolRegistry<br/>(lib/tool-registry.ts)
    participant ChatRoute as /api/chat<br/>(app/api/chat/route.ts)
    participant Provider as LLMProvider<br/>(lib/providers/*.ts)
    participant API as External API<br/>(Anthropic / Gemini / Bedrock)
    participant DB as SQLite DB<br/>(lib/db.ts via /api/conversations)

    User->>InputArea: テキスト入力 / Enter or 送信ボタン
    InputArea->>useChat: handleSubmit() → sendMessage(text, conversationId, images?)

    %% ユーザーメッセージの保存
    useChat->>chatStore: addMessage(userMessage {id, role:'user', content})
    useChat->>DB: POST /api/conversations/{id}/messages<br/>(ユーザーメッセージを永続化)
    useChat->>chatStore: addMessage(emptyAssistantMessage {role:'assistant', content:''})
    useChat->>chatStore: setStreaming(true, assistantMessageId)

    %% リクエスト準備
    useChat->>chatStore: getMessages() → 会話履歴を取得
    useChat->>ToolRegistry: getTools() → ToolDefinition[]
    Note over useChat: MessageContentBlock[] に変換<br/>(text / image base64 / tool_use / tool_result)

    %% ===== ツール呼び出しを含むループ開始 =====
    loop continueLoop (Tool呼び出しがある限り繰り返す)

        useChat->>ChatRoute: POST /api/chat<br/>{ messages, model, provider, systemPrompt, tools? }

        ChatRoute->>ChatRoute: getProvider(providerId) → LLMProvider
        ChatRoute->>Provider: provider.streamChat(params)

        Provider->>API: API Request<br/>{ model, system, stream:true, messages, tools? }

        %% API からのストリーミング
        API-->>Provider: SSE stream 開始
        loop SSE イベント処理
            API-->>Provider: content / delta / tool_use / stop events
        end

        Note over Provider: tool_use ブロック: input JSON を蓄積しパース<br/>pendingToolUses[] に格納

        %% Provider → Route → Client への SSE 転送
        Provider-->>ChatRoute: yield StreamChunk<br/>{ type:'text', text } or<br/>{ type:'tool_use', toolUse:{id,name,input} } or<br/>{ type:'error', error } or<br/>{ type:'done' }

        ChatRoute-->>useChat: SSE レスポンス<br/>Content-Type: text/event-stream<br/>data: {json}\n\n

        %% クライアント側のチャンク処理
        useChat->>useChat: readSSE(response) → AsyncGenerator<StreamChunk>

        loop StreamChunk 受信
            alt type === 'text'
                useChat->>chatStore: updateMessage(id, {content: accumulatedText})
                chatStore-->>User: リアルタイム UI 更新
            else type === 'tool_use'
                useChat->>useChat: toolUses[] に追加
            else type === 'error'
                useChat->>chatStore: updateMessage(id, {error})
                useChat->>chatStore: setStreaming(false)
            end
        end

        %% ===== Tool 呼び出し処理 =====
        alt toolUses.length > 0 (Toolが呼び出された)
            useChat->>chatStore: addMessage(assistantMsg)<br/>content: [text block + tool_use blocks]

            loop 各 tool_use ブロック
                useChat->>ToolRegistry: executeTool(name, input)
                ToolRegistry->>ToolRegistry: 登録済みexecutor関数を呼び出し
                ToolRegistry-->>useChat: result: string
                useChat->>useChat: tool_result content block を生成<br/>{ type:'tool_result', tool_use_id, content }
            end

            useChat->>chatStore: addMessage(toolResultMsg)<br/>{ role:'user', content:[tool_result blocks] }

            Note over useChat: continueLoop = true<br/>アシスタントメッセージをクリアして再ループ

        else toolUses.length === 0 (ツールなし、最終応答)
            Note over useChat: continueLoop = false → ループ終了
        end

    end
    %% ===== ループ終了 =====

    %% 後処理
    useChat->>useChat: parseArtifacts(fullText)<br/>(lib/artifactParser.ts)<br/>コードブロックを Artifact[] として抽出
    useChat->>DB: POST /api/conversations/{id}/messages<br/>(アシスタントメッセージ + artifacts を永続化)

    opt 新規会話の場合
        useChat->>DB: POST /api/conversations/{id}/title<br/>(非同期: タイトル生成 → 保存)
    end

    useChat->>chatStore: setStreaming(false, null)
    chatStore-->>User: 最終メッセージ表示 / 送信ボタン有効化
```

## 主要ファイル対応表

| 処理ステップ | ファイルパス |
|---|---|
| ユーザー入力 | `src/components/chat/InputArea.tsx` |
| チャット制御ロジック | `src/hooks/useChat.ts` |
| 状態管理 (Zustand) | `src/stores/chatStore.ts` |
| ツール定義・実行 | `src/lib/tool-registry.ts` |
| API ルートハンドラ | `app/api/chat/route.ts` |
| プロバイダ選択 | `src/lib/providers/index.ts` |
| Anthropic 実装 | `src/lib/anthropic.ts` |
| Gemini 実装 | `src/lib/providers/gemini.ts` |
| Bedrock 実装 | `src/lib/providers/bedrock.ts` |
| Scripted 実装 | `src/lib/providers/scripted.ts` |
| プロバイダ共通インターフェース | `src/lib/llm-provider.ts` |
| アーティファクト抽出 | `src/lib/artifactParser.ts` |
| DB アクセス | `src/lib/db.ts` |
| 会話 API | `app/api/conversations/[id]/route.ts` |

## StreamChunk 型定義 (`src/lib/llm-provider.ts`)

```typescript
export interface StreamChunk {
  type: 'text' | 'tool_use' | 'done' | 'error';
  text?: string;
  error?: string;
  toolUse?: { id: string; name: string; input: Record<string, unknown> };
}
```
