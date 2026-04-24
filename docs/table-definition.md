# テーブル定義書 (Table Definitions)

このドキュメントでは、システムで使用されている主要なデータ構造（テーブル・ストアの概念モデル）を定義します。各定義は `src/types` 以下の TypeScript インターフェースに基づいています。

## 1. コアデータ (src/types/index.ts)

### Artifact
成果物（コードブロックなどのアーティファクト）の情報を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| filename | string | ファイル名 |
| language | string | プログラミング言語やファイル種別 |
| kind | ArtifactKind | 成果物の種類 ('code' \| 'html' \| 'svg' \| 'markdown') |
| content | string | 成果物の内容 |
| isExpanded | boolean | UI上で展開表示されているかどうか |

### ImageAttachment
メッセージに添付される画像データを管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| data | string | base64エンコードされた画像データ（data URLプレフィックスなし） |
| mediaType | string | 画像のMIMEタイプ ('image/jpeg' \| 'image/png' \| 'image/gif' \| 'image/webp') |
| name | string | 画像のファイル名または名前 |

### Message
チャットの個々のメッセージを管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| role | string | 送信者の役割 ('user' \| 'assistant') |
| content | string | メッセージのテキスト内容 |
| images | ImageAttachment[] | 添付画像の配列（オプショナル） |
| artifacts | Artifact[] | メッセージに含まれる成果物の配列 |
| timestamp | Date | メッセージの作成日時 |

### Conversation
チャットの会話（スレッド）全体を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| title | string | 会話のタイトル |
| messages | Message[] | 会話に含まれるメッセージの配列 |
| createdAt | Date | 作成日時 |
| updatedAt | Date | 更新日時 |
| scenarioId | string | 関連するシナリオのID（オプショナル） |
| requestMessage | string | リクエストメッセージ（オプショナル） |
| requestSender | string | リクエスト送信者（オプショナル） |
| requestCreatedAt | Date | リクエスト作成日時（オプショナル） |

### Notification
ユーザーへの通知メッセージを管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| userUsername | string | 通知を受け取るユーザーのユーザー名 |
| senderUsername | string | 通知を送信したユーザーのユーザー名 |
| message | string | 通知の内容 |
| artifactId | string | 関連する成果物のID（オプショナル） |
| sourceConvId | string | 関連する会話のID（オプショナル） |
| isRead | boolean | 既読フラグ |
| createdAt | Date | 作成日時 |

### Settings
ユーザーの設定情報を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| systemPrompt | string | システムプロンプト |
| model | string | 使用するモデル |
| provider | string | 使用するLLMプロバイダーID。未設定時は 'anthropic' にフォールバック |
| theme | string | UIテーマ ('light' \| 'dark') |

## 2. シナリオデータ (src/types/scenario.ts)

### ScenarioOption
シナリオ内の選択肢を定義します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| label | string | 選択肢の表示ラベル |
| next | string \| null | 次のノードのキー (終了の場合は null) |

### ScenarioNode
シナリオの各ステップ（ノード）を定義します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| message | string | ノードで表示するメッセージ |
| options | ScenarioOption[] | ユーザーに提示する選択肢の配列 |
| terminal | boolean | 終端ノードかどうか（オプショナル） |

### Scenario
シナリオ全体の定義を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| name | string | シナリオ名 |
| description | string | シナリオの説明 |
| start | string | 開始ノードのキー |
| nodes | Record<string, ScenarioNode> | ノードキーをキー、ノード定義を値とするマップ |

## 3. タスクデータ (src/types/task.ts)

### HumanParticipant / LlmParticipant
タスクに参加するユーザー（Human）またはAIエージェント（LLM）の情報を管理します。

**HumanParticipant**
| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| taskId | string | 参加しているタスクのID |
| participantType | string | 参加者タイプ ('human') |
| username | string | ユーザー名 |
| displayName | string | 表示名 |
| canTerminate | boolean | タスクを終了できる権限があるかどうか |
| joinedAt | Date | 参加日時 |

**LlmParticipant**
| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| taskId | string | 参加しているタスクのID |
| participantType | string | 参加者タイプ ('llm') |
| agentName | string | エージェント名 |
| agentRole | string | エージェントの役割 |
| provider | string | 使用するLLMプロバイダー |
| model | string | 使用するモデル |
| mcpServerIds | string[] | 使用するMCPサーバーIDの配列 |
| canTerminate | false | タスク終了権限の有無（常に false） |
| joinedAt | Date | 参加日時 |

### TaskMessage
タスク内のメッセージを管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| taskId | string | 関連するタスクのID |
| senderType | MessageSenderType | 送信者の種類 ('human' \| 'llm' \| 'system') |
| senderName | string | 送信者の名前 |
| toName | string \| null | 宛先の名前（ブロードキャストの場合は null） |
| content | string | メッセージ内容 |
| images | ImageAttachment[] | 添付画像の配列（オプショナル） |
| timestamp | Date | メッセージ送信日時 |
| sortOrder | number | 表示順序 |

### Task
タスク（複数人・エージェントが参加する目標指向の対話）全体の情報を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| title | string | タスクのタイトル |
| purpose | string | タスクの目的 |
| completionCondition | string | 完了条件 |
| status | TaskStatus | タスクの状態 ('draft' \| 'active' \| 'completed' \| 'cancelled') |
| createdBy | string | 作成者のユーザー名 |
| systemPrompt | string | システムプロンプト |
| createdAt | Date | 作成日時 |
| updatedAt | Date | 更新日時 |
| participants | TaskParticipant[] | 参加者の配列 (HumanParticipant \| LlmParticipant) |
| messages | TaskMessage[] | メッセージの配列 |

## 4. タスクテンプレート (src/types/taskTemplate.ts)

### HumanTemplateParticipant / LlmTemplateParticipant
タスクテンプレートに含まれる参加者の初期設定を管理します。

**HumanTemplateParticipant**
| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| templateId | string | 親テンプレートのID |
| participantType | string | 参加者タイプ ('human') |
| username | string | ユーザー名 |
| displayName | string | 表示名 |
| canTerminate | boolean | 終了権限 |

**LlmTemplateParticipant**
| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| templateId | string | 親テンプレートのID |
| participantType | string | 参加者タイプ ('llm') |
| agentName | string | エージェント名 |
| agentRole | string | エージェントの役割 |
| provider | string | プロバイダー |
| model | string | モデル |
| mcpServerIds | string[] | MCPサーバーIDリスト |
| canTerminate | false | 終了権限 |

### TaskTemplate
再利用可能なタスクの雛形を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| name | string | テンプレート名 |
| description | string | テンプレートの説明 |
| title | string | 生成されるタスクのタイトル |
| purpose | string | 生成されるタスクの目的 |
| completionCondition | string | 生成されるタスクの完了条件 |
| createdBy | string | 作成者 |
| createdAt | Date | 作成日時 |
| updatedAt | Date | 更新日時 |
| participants | TaskTemplateParticipant[] | テンプレート参加者の配列 |

## 5. MCP (Model Context Protocol) (src/types/mcp.ts)

### McpServerConfig
MCPサーバーの設定情報を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | 一意の識別子 |
| name | string | サーバー名 |
| transport | string | 通信方式 ('stdio' \| 'sse') |
| command | string | 実行コマンド (stdio用, オプショナル) |
| args | string[] | コマンド引数 (stdio用, オプショナル) |
| env | Record<string, string> | 環境変数 (stdio用, オプショナル) |
| url | string | 接続先URL (sse用, オプショナル) |
| headers | Record<string, string> | リクエストヘッダー (sse用, オプショナル) |
| enabled | boolean | 有効・無効フラグ |
| createdAt | string | 作成日時 |
| updatedAt | string | 更新日時 |

### McpServerStatus
MCPサーバーの現在の接続状態を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| id | string | サーバーの識別子 |
| status | string | 接続状態 ('disconnected' \| 'connecting' \| 'connected' \| 'error') |
| error | string | エラーメッセージ（オプショナル） |
| toolCount | number | 利用可能なツールの数 |
| resourceCount | number | 利用可能なリソースの数 |
| connectedAt | string | 接続日時（オプショナル） |

### McpTool
MCPサーバーが提供するツールの定義を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| serverId | string | 提供元サーバーのID |
| serverName | string | 提供元サーバーの名前 |
| name | string | ツール名 |
| qualifiedName | string | 修飾されたツール名 |
| description | string | ツールの説明 |
| inputSchema | Record<string, unknown> | ツールの入力スキーマ |

### McpResource
MCPサーバーが提供するリソースの定義を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| serverId | string | 提供元サーバーのID |
| uri | string | リソースのURI |
| name | string | リソース名 |
| description | string | リソースの説明（オプショナル） |
| mimeType | string | MIMEタイプ（オプショナル） |

## 6. 認証・ユーザー (src/types/auth.ts)

### UserDefinition / UsersConfig
システムに登録されるユーザーの静的定義を管理します（設定ファイル等の用途）。

**UserDefinition**
| カラム名 | 型 | 説明 |
| --- | --- | --- |
| username | string | ユーザー名 |
| password | string | パスワード |
| displayName | string | 表示名（オプショナル） |

**UsersConfig**
| カラム名 | 型 | 説明 |
| --- | --- | --- |
| users | UserDefinition[] | ユーザー定義の配列 |

### AuthUser
認証されたユーザーの情報を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| username | string | ユーザー名 |
| displayName | string | 表示名 |
| email | string | メールアドレス（オプショナル） |

### AuthState
認証状態全体（ストアのステート）を管理します。

| カラム名 | 型 | 説明 |
| --- | --- | --- |
| user | AuthUser \| null | 認証済みユーザー情報（未ログイン時は null） |
| sessionToken | string \| null | セッショントークン |
| isAuthenticated | boolean | 認証されているかどうか |
| authMode | string \| null | 認証モード ('demo' \| 'google' \| 'entra' \| null) |
