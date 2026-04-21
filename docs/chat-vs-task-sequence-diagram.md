# 通常チャット機能とタスク機能のアーキテクチャ比較・シーケンス図

本ドキュメントでは、通常のチャット機能とタスク機能におけるエージェント（LLM）との対話フローの違いをファイル単位で比較し、Mermaid形式のシーケンス図で示します。

## 1. 通常チャット（Standard Chat）のシーケンス

通常のチャットは、「1ユーザー対1つのLLM」の同期的なRequest-Responseモデルに基づいています。クライアントが直接LLMの応答を待ち受け、状態管理やツール実行の調整をクライアント側（フロントエンド）が主体となって行います。

```mermaid
sequenceDiagram
    actor User
    participant UI as InputArea<br/>(components/chat/InputArea.tsx)
    participant Hook as useChat<br/>(hooks/useChat.ts)
    participant Store as chatStore<br/>(stores/chatStore.ts)
    participant Route as /api/chat<br/>(app/api/chat/route.ts)
    participant Provider as LLMProvider<br/>(lib/providers/*.ts)
    participant DB as SQLite DB<br/>(lib/db.ts)
    participant Tool as ToolRegistry<br/>(lib/tool-registry.ts)

    User->>UI: テキスト送信
    UI->>Hook: sendMessage(text)

    %% クライアント側の事前保存
    Hook->>Store: addMessage(userMessage)
    Hook->>DB: POST /api/conversations/{id}/messages (User)

    %% LLMへのリクエストループ
    loop continueLoop (Tool実行が続く限り)
        Hook->>Route: POST /api/chat { messages, tools }
        Route->>Provider: streamChat()

        %% ストリーミング応答
        Provider-->>Route: SSE (text / tool_use)
        Route-->>Hook: SSE Response

        loop StreamChunk 受信
            alt type === 'text'
                Hook->>Store: updateMessage() -> UI更新
            else type === 'tool_use'
                Hook->>Hook: ツール呼び出しを蓄積
            end
        end

        %% クライアントサイドでのツール実行
        opt tool_useが存在する場合
            loop 各ツール
                Hook->>Tool: executeTool()
                Tool-->>Hook: Tool Result
            end
            Hook->>Store: addMessage(toolResult)
            Note over Hook: continueLoop = true となり再リクエスト
        end
    end

    %% クライアント主導の事後処理
    Hook->>DB: POST /api/conversations/{id}/messages (Assistant + Artifacts)
```

## 2. タスク機能（Task Chat）のシーケンス

タスク機能は、複数ユーザー・複数LLMエージェントが参加する非同期・イベント駆動モデルです。クライアントはメッセージを送信するだけで、メンション解析やLLMの呼び出し、ツール実行（MCP）などの複雑な処理はすべてバックエンドで完結し、結果がSSE（Server-Sent Events）を通じて全クライアントにブロードキャストされます。

```mermaid
sequenceDiagram
    actor User
    participant Hook as useTaskStream<br/>(hooks/useTaskStream.ts)
    participant Store as taskStore<br/>(stores/taskStore.ts)
    participant MsgRoute as /api/tasks/[id]/messages<br/>(app/api/tasks/[id]/messages/route.ts)
    participant TaskDB as Task DB<br/>(lib/taskDb.ts)
    participant EventBus as taskEventBus<br/>(lib/taskEventBus.ts)
    participant StreamRoute as /api/tasks/[id]/stream<br/>(app/api/tasks/[id]/stream/route.ts)
    participant ChatRoute as /api/tasks/[id]/chat<br/>(app/api/tasks/[id]/chat/route.ts)
    participant Provider as LLMProvider<br/>(lib/providers/*.ts)
    participant MCP as MCP Manager<br/>(lib/mcp/mcp-manager.ts)

    %% クライアントからのSSE接続（常時）
    Hook->>StreamRoute: GET /api/tasks/{id}/stream (常時接続)
    StreamRoute-->>EventBus: subscribe(taskId)

    %% メッセージ送信
    User->>Store: sendMessage(text)
    Store->>MsgRoute: POST /api/tasks/{id}/messages

    MsgRoute->>MsgRoute: @メンション解析 (LLMが対象か判定)
    MsgRoute->>TaskDB: addTaskMessage (User)
    MsgRoute->>EventBus: publish(message)
    EventBus-->>StreamRoute: event
    StreamRoute-->>Hook: SSE (message) -> UI更新

    MsgRoute-->>Store: 201 Created (HTTP応答)

    %% バックエンドでの非同期LLM呼び出し
    opt @LLMメンションが含まれる場合
        MsgRoute-)ChatRoute: [非同期] POST /api/tasks/{id}/chat { agentName }

        Note over ChatRoute: サーバーサイドでリクエストループ開始
        loop continueLoop (Tool実行が続く限り)
            ChatRoute->>Provider: streamChat()

            loop StreamChunk 受信
                alt type === 'text'
                    ChatRoute->>EventBus: publish(streaming chunk)
                    EventBus-->>StreamRoute: event
                    StreamRoute-->>Hook: SSE (streaming) -> UI更新
                else type === 'tool_use'
                    ChatRoute->>ChatRoute: ツール呼び出しを蓄積
                end
            end

            %% サーバーサイドでのツール（MCP）実行
            opt tool_useが存在する場合
                loop 各ツール
                    ChatRoute->>MCP: callTool()
                    MCP-->>ChatRoute: Tool Result
                end
                Note over ChatRoute: continueLoop = true となり履歴を更新して再実行
            end
        end

        %% サーバー主導の事後処理・保存
        ChatRoute->>TaskDB: addTaskMessage (Assistant)
        ChatRoute->>EventBus: publish(stream_end & message)
        EventBus-->>StreamRoute: event
        StreamRoute-->>Hook: SSE (message) -> UI更新
    end
```

## 3. 両者のアーキテクチャの違いと分析

### 1. 通信モデルと状態管理の主体

*   **通常チャット**:
    *   **同期的なRequest-Response**: `useChat`フックが直接LLMのストリーミング応答を待ち受けます。
    *   **クライアント主導**: 途中経過のメッセージ状態（Streaming状態やTool Useの中間状態）はZustandストアで管理され、通信完了後にクライアントからDBへ保存リクエストが送られます。
*   **タスク機能**:
    *   **非同期・イベント駆動 (Pub/Sub)**: メッセージ送信(`POST /messages`)と受信(`/stream`)が分離されたCQRS的な設計です。送信APIは即座にレスポンスを返し、実際のLLM処理はバックエンドで非同期に走ります。
    *   **バックエンド主導**: LLMからの応答、中間状態、Tool実行は全てサーバー側(`POST /chat`)で完結します。結果は`taskEventBus`経由でイベントとして全クライアントに配信されます。

### 2. ツール（Tool/Function Calling）の実行場所

*   **通常チャット**:
    *   ツールはクライアントサイド（ブラウザ）上で実行されます。APIから`tool_use`ブロックを受け取ると、フロントエンドの`ToolRegistry`を通じて関数が実行され、その結果を含めて再度APIにリクエストを投げます。
*   **タスク機能**:
    *   ツールはサーバーサイドで実行されます。特にMCP（Model Context Protocol）によるファイル出力などは、バックエンドの`mcpManager`を通じて処理されます。これにより、隔離されたタスクワークスペースに対する安全なファイル操作が可能になっています。

### 3. メッセージの永続化タイミング

*   **通常チャット**:
    *   ユーザーの発言は送信時に保存され、LLMの応答はストリーミングが**完了した後**にフロントエンドから`/api/conversations/[id]/messages`へPOSTすることで初めてDBに保存されます。通信切断時にデータが失われるリスクがあります。
*   **タスク機能**:
    *   LLMの応答完了時、サーバー側の`/api/tasks/[id]/chat`ルートが**直接Task DBに書き込みます**。その後、保存された完全なメッセージがSSEで配信されるため、データの一貫性と耐障害性が高くなっています。

### 4. 参加者のスケーラビリティ

*   **通常チャット**:
    *   1対1の設計であるため、他のユーザーや複数のLLMモデルを同じスレッドに介在させることはできません。
*   **タスク機能**:
    *   サーバー側の`taskEventBus`による状態共有と、宛先解決（`@メンション解析`）により、複数人が同時に書き込み、複数のLLMエージェントが順次または並列に反応できる構造になっています。
