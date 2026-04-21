# MCP（Model Context Protocol）対応 設計書

## 1. 概要・目的

### 背景

現在の general-chat-interface は、LLMプロバイダーごとに個別の実装（Anthropic・Gemini・Bedrock）を持ち、ツールは `tool-registry.ts` に静的に登録する方式をとっている。

この構成では以下の課題がある。

| 課題 | 詳細 |
|------|------|
| ツール追加の難しさ | 新しいツールを追加するたびにサーバー側コードを変更・デプロイが必要 |
| ツールの再利用不可 | 異なるアプリ間でツール実装を共有する手段がない |
| 外部連携の煩雑さ | データベース・ファイルシステム・外部APIとの連携を個別実装している |
| プロバイダー依存 | ツール定義がプロバイダーのスキーマ形式に依存している |

### MCP対応の目的

MCP（Model Context Protocol）への対応により、以下を実現する。

1. **外部MCPサーバーへの接続**: ローカルおよびリモートのMCPサーバーをUIから設定・管理できるようにする
2. **ツールの動的拡張**: MCPサーバーが提供するツールを、コード変更なしにLLMへ公開する
3. **リソースのコンテキスト注入**: MCPサーバーが公開するファイル・DBデータをシステムプロンプトやメッセージのコンテキストとして利用する
4. **標準化されたプロトコル**: プロバイダーに依存しないツール定義を実現し、将来の拡張性を高める

### 対象ユーザー

- **エンジニア**: 独自MCPサーバーを開発・接続してチャットで活用したいユーザー
- **ビジネスユーザー**: 公開MCPサーバー（GitHub・Slack・DB等）を接続して業務に活用したいユーザー

### 設計方針

1. **既存アーキテクチャの最大活用**: LLMProvider インターフェース・ToolRegistry・SSEストリーミング構成を維持する
2. **段階的実装**: フェーズ1（MCPクライアント基盤）→ フェーズ2（ツール統合）→ フェーズ3（リソース統合）→ フェーズ4（UI完成）の順に進める
3. **接続方式の両対応**: `stdio`（ローカルプロセス起動）と `SSE`（HTTPエンドポイント）の両トランスポートをサポートする
4. **安全性の確保**: MCPサーバーの接続情報（コマンド・URL・APIキー等）はサーバーサイドのみで管理し、ブラウザに露出しない
5. **ツール名の衝突回避**: MCPサーバーIDをプレフィックスとして付与し（例: `github__create_issue`）、複数サーバーのツールが共存できるようにする

---

## 2. MCPプロトコル解説

### 概要

MCP（Model Context Protocol）は Anthropic が策定したオープンプロトコルで、LLMアプリケーションと外部データソース・ツール間の通信を標準化する。USB-C がデバイスと周辺機器を統一的に接続するように、MCP は LLM と外部コンテキストプロバイダーを統一的につなぐ。

### 登場人物

```
┌────────────────────────────────────────────────────────────────┐
│  MCP Host（本アプリ: general-chat-interface）                   │
│                                                                │
│  ┌─────────────┐    MCP Protocol    ┌──────────────────────┐  │
│  │ MCP Client  │◄──────────────────►│   MCP Server A       │  │
│  │ (接続管理)   │                    │  (GitHub, DB, etc.)  │  │
│  └─────────────┘                    └──────────────────────┘  │
│         │           MCP Protocol    ┌──────────────────────┐  │
│         └──────────────────────────►│   MCP Server B       │  │
│                                    │  (Filesystem, etc.)  │  │
│                                    └──────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

| 役割 | 説明 |
|------|------|
| **MCP Host** | MCPクライアントを起動・管理するアプリケーション（本アプリ） |
| **MCP Client** | MCPサーバーへの接続を確立し、プロトコルを処理するコンポーネント |
| **MCP Server** | ツール・リソース・プロンプトを提供する外部プロセスまたはHTTPサービス |

### MCPサーバーが提供する3つの機能

| 機能 | 説明 | 例 |
|------|------|-----|
| **Tools** | LLMが呼び出せる関数（副作用あり） | `create_issue`, `query_db`, `send_slack` |
| **Resources** | LLMが読み取れるデータ（副作用なし） | ファイル内容、DB行データ、APIレスポンス |
| **Prompts** | 再利用可能なプロンプトテンプレート | コードレビュー用テンプレート等 |

### トランスポート方式

MCP は以下の2つのトランスポートをサポートする。

#### stdio トランスポート（ローカル）

```
general-chat-interface (Next.js process)
    │
    │  stdin/stdout (JSON-RPC 2.0)
    ▼
mcp-server-github (Node.js child process)
```

- ローカルプロセスを `child_process.spawn()` で起動
- 標準入出力で JSON-RPC 2.0 メッセージを交換
- セキュリティが高い（ネットワーク不要）
- 例: `npx @modelcontextprotocol/server-github`

#### SSE トランスポート（リモート）

```
general-chat-interface (Next.js process)
    │
    │  HTTP POST (リクエスト)
    │  GET + SSE (レスポンスストリーム)
    ▼
https://mcp.example.com/sse
```

- HTTP エンドポイントへ接続
- POST でコマンド送信、GET の SSE でイベント受信
- リモートサーバーや SaaS への接続に使用

### メッセージフォーマット（JSON-RPC 2.0）

```json
// リクエスト（Host → Server）
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "create_issue",
    "arguments": { "title": "Bug fix", "body": "..." }
  }
}

// レスポンス（Server → Host）
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "Issue #42 created" }]
  }
}
```

---

## 3. アーキテクチャ概要

### 全体構成

MCP対応後のアーキテクチャを以下に示す。既存の LLMProvider インターフェースと ToolRegistry を維持しつつ、MCPレイヤーを追加する。

```
Browser (React App)
    │
    │  useChat / useMcpServers (hooks)
    │   └─ fetch('/api/chat', { provider, messages, mcpServerIds, ... })
    │   └─ fetch('/api/mcp/servers', ...)
    ▼
Next.js API Route (app/api/chat/route.ts)
    │
    │  MCPツールをToolRegistryに動的登録
    ▼
McpManager (src/lib/mcp/mcp-manager.ts)  ← 【新規】
    │
    ├── McpClient A (src/lib/mcp/mcp-client.ts)  ← 【新規】
    │       │  stdio or SSE
    │       ▼
    │   MCP Server A (GitHub)
    │
    └── McpClient B
            │  stdio or SSE
            ▼
        MCP Server B (Filesystem)

getProvider(providerId)  ← 既存
    │
    ▼
LLMProvider (tools に MCP ツールを含む)
    │
    ├── AnthropicProvider  ← 既存
    ├── GeminiProvider     ← 既存
    └── BedrockProvider    ← 既存
```

### 既存コンポーネントとの対応関係

| 既存コンポーネント | MCP対応での変化 |
|-------------------|----------------|
| `src/lib/tool-registry.ts` | MCPツールを動的に登録する機能を追加 |
| `src/lib/llm-provider.ts` | 変更なし（インターフェースはそのまま） |
| `app/api/chat/route.ts` | リクエスト時に McpManager からツール一覧を取得して注入 |
| `src/lib/db.ts` | `mcp_servers` テーブルを追加 |
| `src/stores/chatStore.ts` | 変更なし |
| `src/components/settings/` | MCPサーバー管理UIを追加 |

### 新規追加コンポーネント

| ファイル | 役割 |
|---------|------|
| `src/lib/mcp/mcp-client.ts` | 単一MCPサーバーへの接続・通信 |
| `src/lib/mcp/mcp-manager.ts` | 複数MCPクライアントのライフサイクル管理 |
| `src/lib/mcp/stdio-transport.ts` | stdioトランスポート実装 |
| `src/lib/mcp/sse-transport.ts` | SSEトランスポート実装 |
| `src/types/mcp.ts` | MCP関連型定義 |
| `app/api/mcp/servers/route.ts` | MCPサーバーCRUD API |
| `app/api/mcp/servers/[id]/tools/route.ts` | ツール一覧取得API |
| `app/api/mcp/servers/[id]/resources/route.ts` | リソース一覧・取得API |
| `app/api/mcp/servers/[id]/status/route.ts` | 接続状態確認API |
| `src/components/mcp/McpServerPanel.tsx` | サーバー管理UIパネル |
| `src/components/mcp/McpToolBadge.tsx` | ツール呼び出し表示バッジ |

---

## 4. MCPサーバー接続管理

### 4.1 接続設定モデル

MCPサーバーの接続情報は以下の型で表現する。

```typescript
// src/types/mcp.ts

export type McpTransport = 'stdio' | 'sse';

export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;

  // stdio の場合
  command?: string;        // 例: "npx"
  args?: string[];         // 例: ["@modelcontextprotocol/server-github"]
  env?: Record<string, string>;  // 例: { GITHUB_TOKEN: "ghp_..." }

  // SSE の場合
  url?: string;            // 例: "https://mcp.example.com/sse"
  headers?: Record<string, string>;  // 認証ヘッダー等

  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface McpServerStatus {
  id: string;
  status: McpConnectionStatus;
  error?: string;
  toolCount: number;
  resourceCount: number;
  connectedAt?: Date;
}

export interface McpTool {
  serverId: string;
  name: string;            // MCPサーバー側の名前（例: "create_issue"）
  qualifiedName: string;   // プレフィックス付き名前（例: "github__create_issue"）
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResource {
  serverId: string;
  uri: string;             // 例: "file:///project/README.md"
  name: string;
  description?: string;
  mimeType?: string;
}
```

### 4.2 McpClient（単一サーバー接続）

1つの MCP サーバーへの接続を管理するクラス。

```typescript
// src/lib/mcp/mcp-client.ts

export class McpClient {
  private config: McpServerConfig;
  private transport: McpTransport;
  private requestId = 0;

  constructor(config: McpServerConfig) { ... }

  // 接続確立・初期化ハンドシェイク
  async connect(): Promise<void>

  // ツール一覧取得（tools/list）
  async listTools(): Promise<McpTool[]>

  // ツール実行（tools/call）
  async callTool(name: string, args: Record<string, unknown>): Promise<string>

  // リソース一覧取得（resources/list）
  async listResources(): Promise<McpResource[]>

  // リソース内容取得（resources/read）
  async readResource(uri: string): Promise<string>

  // 接続切断
  async disconnect(): Promise<void>
}
```

#### 接続シーケンス（初期化）

```
McpClient          MCP Server
    │                   │
    │── initialize ────►│  { protocolVersion, capabilities, clientInfo }
    │◄─ initialize ─────│  { protocolVersion, capabilities, serverInfo }
    │                   │
    │── initialized ───►│  (通知: 初期化完了)
    │                   │
    │── tools/list ─────►│
    │◄─ { tools: [...] }─│
    │                   │
    │  接続完了          │
```

### 4.3 McpManager（複数サーバー管理）

アプリケーション全体で1インスタンスのシングルトン。MCPサーバーのライフサイクルを管理する。

```typescript
// src/lib/mcp/mcp-manager.ts

class McpManager {
  private clients = new Map<string, McpClient>();

  // サーバー設定を読み込み、enabled なものを接続
  async initialize(configs: McpServerConfig[]): Promise<void>

  // 特定サーバーへ接続
  async connect(config: McpServerConfig): Promise<void>

  // 特定サーバーを切断
  async disconnect(serverId: string): Promise<void>

  // 全サーバーのツール一覧を結合して返す
  async getAllTools(): Promise<McpTool[]>

  // 特定ツールを実行（qualifiedName から serverId を解決）
  async callTool(qualifiedName: string, args: Record<string, unknown>): Promise<string>

  // 全サーバーの接続状態を返す
  getStatuses(): McpServerStatus[]
}

export const mcpManager = new McpManager();  // シングルトン
```

### 4.4 エラーハンドリング方針

| エラー種別 | 挙動 |
|-----------|------|
| 接続失敗（プロセス起動エラー等） | status を `error` に更新。他サーバーへの影響なし |
| ツール実行タイムアウト（30秒） | エラー結果を返す。会話の継続は可能 |
| サーバープロセスの異常終了 | 自動再接続を3回まで試みる（指数バックオフ） |
| SSE接続切断 | 30秒後に再接続を試みる |

---

## 5. ツール統合設計

### 5.1 既存 ToolRegistry との統合

既存の `tool-registry.ts` は静的にツールを登録する設計になっている。MCPツールはリクエスト時に動的に取得するため、**リクエストスコープのツールリスト**として LLMProvider に渡す方式を採用する。

```
既存の静的ツール（tool-registry.ts に登録済み）
    +
MCPツール（リクエスト時に McpManager から取得）
    │
    ▼
LLMProvider.streamChat({ tools: [...静的ツール, ...MCPツール] })
```

この設計により、`tool-registry.ts` の変更は最小限に抑えられる。

### 5.2 ツール名の衝突回避

複数の MCP サーバーが同名ツールを持つ場合を考慮し、**`{serverId}__{toolName}`** 形式のqualified nameを使用する。

```
MCPサーバー ID: "github"
MCPツール名: "create_issue"
→ qualifiedName: "github__create_issue"

MCPサーバー ID: "jira"
MCPツール名: "create_issue"
→ qualifiedName: "jira__create_issue"
```

LLM へ渡すツール定義では `name` に qualifiedName を使用する。ツール実行時は McpManager が `__` で分割してサーバーを特定する。

### 5.3 チャットAPIでのツール注入フロー

```typescript
// app/api/chat/route.ts（変更箇所）

export async function POST(request: Request) {
  const { messages, provider, model, mcpServerIds, ... } = await request.json();

  // 1. 静的ツールを取得
  const staticTools = getRegisteredTools();

  // 2. MCPツールを動的取得（指定されたサーバーのみ）
  const mcpTools = mcpServerIds?.length
    ? await mcpManager.getToolsForServers(mcpServerIds)
    : [];

  // 3. ToolDefinition 形式に変換
  const allTools: ToolDefinition[] = [
    ...staticTools,
    ...mcpTools.map(t => ({
      name: t.qualifiedName,
      description: `[MCP: ${t.serverId}] ${t.description}`,
      input_schema: t.inputSchema,
    })),
  ];

  // 4. LLMProvider へ渡す
  const llmProvider = getProvider(provider);
  const stream = llmProvider.streamChat({ messages, tools: allTools, ... });

  // 5. tool_use チャンク受信時
  for await (const chunk of stream) {
    if (chunk.type === 'tool_use') {
      const result = chunk.toolUse.name.includes('__')
        ? await mcpManager.callTool(chunk.toolUse.name, chunk.toolUse.input)
        : await executeTool(chunk.toolUse.name, chunk.toolUse.input);
      // tool_result を会話に追加して続行
    }
  }
}
```

### 5.4 フロントエンドでのツール選択

ユーザーは会話ごとに「使用するMCPサーバー」を選択できる。選択情報は `/api/chat` のリクエストボディに含める。

```typescript
// Settings に追加する型（src/types/index.ts）
interface Settings {
  // 既存フィールド...
  enabledMcpServerIds: string[];  // 有効化するMCPサーバーのID一覧
}
```

### 5.5 ツール実行結果の表示

MCPツールの実行はチャット画面で視覚的に確認できるようにする。既存の tool_use 表示を拡張し、MCPサーバー名を表示するバッジを付与する。

```
┌─────────────────────────────────────────┐
│ 🔧 github__create_issue を実行中...      │
│   [MCP: github]                         │
│   title: "Fix login bug"                │
│   body: "..."                           │
└─────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────┐
│ ✅ Issue #42 が作成されました             │
└─────────────────────────────────────────┘
```

---

## 6. リソース統合設計

### 6.1 リソースの活用方法

MCPリソースは「LLMが読み取るべきコンテキスト」を表す。本アプリでは以下の2つの使い方をサポートする。

| 活用方法 | 説明 |
|---------|------|
| **手動コンテキスト注入** | ユーザーが特定リソースを選択し、メッセージのコンテキストとして添付する |
| **自動コンテキスト注入** | サーバー接続時に全リソースをシステムプロンプトの末尾に自動追加する（オプション） |

### 6.2 手動コンテキスト注入フロー

```
1. ユーザーがチャット入力エリアの「+」ボタンをクリック
2. リソース選択モーダルが開く
3. 接続中のMCPサーバー一覧とリソース一覧を表示
4. ユーザーが1つ以上のリソースを選択
5. 選択されたリソースをメッセージと一緒に送信

送信されるメッセージ構造:
{
  role: 'user',
  content: [
    { type: 'text', text: 'このファイルを見てください' },
    { type: 'text', text: '<resource uri="file:///README.md">\n# README\n...\n</resource>' }
  ]
}
```

### 6.3 リソース購読（サブスクリプション）

MCPサーバーがリソースの変更通知（`resources/subscribe`）をサポートする場合、ファイル変更等をリアルタイムに検知できる。初期実装は手動更新とし、フェーズ4以降でサブスクリプション対応を追加する。

| フェーズ | 実装方式 |
|---------|---------|
| フェーズ3（初期） | ユーザーが手動でリソース一覧を更新 |
| フェーズ4（拡張） | `resources/subscribe` で変更通知を受け取り自動更新 |

### 6.4 リソース表示UI

選択されたリソースはメッセージ入力エリアの上部にチップ形式で表示する。

```
┌──────────────────────────────────────────────────────┐
│ 添付リソース:                                          │
│  [📄 README.md ×]  [🗄️ users テーブル ×]             │
├──────────────────────────────────────────────────────┤
│ このREADMEとusersテーブルを参考に...                   │
│                                              [送信]   │
└──────────────────────────────────────────────────────┘
```

---

## 7. データベーススキーマ

### 7.1 追加テーブル

既存の `src/lib/db.ts` に以下のテーブルを追加する。

#### `mcp_servers` テーブル

MCPサーバーの接続設定を永続化する。

```sql
CREATE TABLE IF NOT EXISTS mcp_servers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  transport   TEXT NOT NULL CHECK (transport IN ('stdio', 'sse')),

  -- stdio 用
  command     TEXT,
  args_json   TEXT,   -- JSON配列: ["npx", "@modelcontextprotocol/server-github"]
  env_json    TEXT,   -- JSON オブジェクト: { "GITHUB_TOKEN": "ghp_..." }

  -- SSE 用
  url         TEXT,
  headers_json TEXT,  -- JSON オブジェクト: { "Authorization": "Bearer ..." }

  enabled     INTEGER NOT NULL DEFAULT 1,  -- 0 or 1
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**設計上の注意:**
- `env_json` と `headers_json` は APIキー等の秘密情報を含むため、フロントエンドAPIのレスポンスではマスキングする
- `args_json` は配列を JSON 文字列として保存し、取り出し時にパースする

### 7.2 接続状態の管理

接続状態（connected / disconnected / error）は**インメモリ**で管理し、データベースには保存しない。

理由:
- 接続状態はアプリ起動のたびにリセットされるため、永続化しても意味がない
- 状態の更新が頻繁で DB の書き込みオーバーヘッドを避けたい

```typescript
// McpManager 内のインメモリ状態（データベース不要）
private statuses = new Map<string, McpConnectionStatus>();
```

### 7.3 既存 DB ヘルパーとの統合

`src/lib/db.ts` に以下のクエリヘルパーを追加する。

```typescript
export function createMcpServer(config: Omit<McpServerConfig, 'createdAt' | 'updatedAt'>): McpServerConfig

export function getMcpServers(): McpServerConfig[]

export function getMcpServerById(id: string): McpServerConfig | null

export function updateMcpServer(id: string, updates: Partial<McpServerConfig>): void

export function deleteMcpServer(id: string): void
```

### 7.4 マイグレーション戦略

本アプリは `better-sqlite3` を使用しており、アプリ起動時に `CREATE TABLE IF NOT EXISTS` で初期化する方式を採用している。新テーブルも同様の方式で追加する（ダウンタイムなし）。

```typescript
// src/lib/db.ts の initializeDatabase() に追記
db.exec(`
  CREATE TABLE IF NOT EXISTS mcp_servers (
    ...
  );
`);
```

---

## 8. APIルート設計

### 8.1 エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/mcp/servers` | 登録済みMCPサーバー一覧を取得 |
| `POST` | `/api/mcp/servers` | MCPサーバーを新規登録 |
| `GET` | `/api/mcp/servers/[id]` | 特定サーバーの設定を取得 |
| `PUT` | `/api/mcp/servers/[id]` | サーバー設定を更新 |
| `DELETE` | `/api/mcp/servers/[id]` | サーバーを削除（接続も切断） |
| `GET` | `/api/mcp/servers/[id]/status` | 接続状態とツール数を取得 |
| `POST` | `/api/mcp/servers/[id]/connect` | サーバーへ接続を開始 |
| `POST` | `/api/mcp/servers/[id]/disconnect` | サーバーから切断 |
| `GET` | `/api/mcp/servers/[id]/tools` | ツール一覧を取得 |
| `GET` | `/api/mcp/servers/[id]/resources` | リソース一覧を取得 |
| `GET` | `/api/mcp/servers/[id]/resources/read` | リソース内容を取得（`?uri=...`） |

### 8.2 リクエスト・レスポンス仕様

#### `POST /api/mcp/servers`（サーバー登録）

```typescript
// Request Body
{
  name: string;
  transport: 'stdio' | 'sse';
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;  // default: true
}

// Response 201
{
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  enabled: boolean;
  createdAt: string;
  // env/headers はレスポンスに含めない（秘密情報）
}
```

#### `GET /api/mcp/servers`（一覧取得）

```typescript
// Response 200
{
  servers: Array<{
    id: string;
    name: string;
    transport: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    url?: string;
    enabled: boolean;
    // env/headers はマスクして返す: { GITHUB_TOKEN: "ghp_***" }
    env?: Record<string, string>;
    headers?: Record<string, string>;
    status: McpConnectionStatus;
    toolCount: number;
    resourceCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

#### `GET /api/mcp/servers/[id]/tools`（ツール一覧）

```typescript
// Response 200
{
  tools: Array<{
    name: string;           // MCP側の名前
    qualifiedName: string;  // プレフィックス付き名前
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
}
```

#### `GET /api/mcp/servers/[id]/resources/read`（リソース内容取得）

```typescript
// Query: ?uri=file:///project/README.md

// Response 200
{
  uri: string;
  content: string;
  mimeType: string;
}
```

### 8.3 既存チャットAPI（`/api/chat`）の変更

リクエストボディに `mcpServerIds` を追加する。

```typescript
// 変更前
{
  messages: ChatMessage[];
  provider: string;
  model: string;
  systemPrompt?: string;
}

// 変更後（追加のみ、後方互換あり）
{
  messages: ChatMessage[];
  provider: string;
  model: string;
  systemPrompt?: string;
  mcpServerIds?: string[];  // 追加: 使用するMCPサーバーのID一覧
}
```

### 8.4 認証・認可

全 `/api/mcp/*` エンドポイントは既存の NextAuth セッション認証を適用する。未認証リクエストは `401 Unauthorized` を返す。

---

## 9. UIコンポーネント設計

### 9.1 画面構成の変更点

既存の設定モーダル（`src/components/settings/`）に「MCPサーバー」タブを追加し、サーバー管理の起点とする。チャット画面のヘッダー・入力エリアには最小限の変更を加える。

```
既存: [一般設定タブ] [プロバイダータブ]
変更: [一般設定タブ] [プロバイダータブ] [MCPサーバータブ] ← 追加
```

### 9.2 MCPサーバー管理パネル（`McpServerPanel.tsx`）

設定モーダルの「MCPサーバー」タブで表示するコンポーネント。

```
┌─────────────────────────────────────────────────────┐
│ MCP サーバー                          [+ サーバー追加] │
├─────────────────────────────────────────────────────┤
│ ● GitHub MCP              [stdio] [connected]        │
│   npx @modelcontextprotocol/server-github            │
│   ツール: 12個  リソース: 0個          [編集] [削除]  │
├─────────────────────────────────────────────────────┤
│ ○ Filesystem MCP          [stdio] [disconnected]     │
│   npx @modelcontextprotocol/server-filesystem        │
│   ツール: 8個   リソース: 5個          [編集] [削除]  │
├─────────────────────────────────────────────────────┤
│ ● Slack MCP               [sse]   [error]            │
│   https://mcp.example.com/slack                      │
│   ⚠ 接続エラー: timeout                [編集] [削除]  │
└─────────────────────────────────────────────────────┘
```

**状態バッジの色分け:**
- `connected` → 緑
- `connecting` → 黄（点滅）
- `disconnected` → グレー
- `error` → 赤

### 9.3 サーバー追加・編集フォーム（`McpServerForm.tsx`）

モーダル内に表示されるフォーム。トランスポート選択で表示フィールドを動的に切り替える。

```
┌───────────────────────────────────────────┐
│ MCPサーバーを追加                           │
├───────────────────────────────────────────┤
│ 名前 *                                     │
│ [GitHub MCP                             ] │
│                                           │
│ トランスポート *                             │
│ (●) stdio  ( ) SSE                        │
│                                           │
│ ── stdio 設定 ─────────────────────────── │
│ コマンド *                                  │
│ [npx                                    ] │
│                                           │
│ 引数（1行1つ）                              │
│ [@modelcontextprotocol/server-github    ] │
│                                           │
│ 環境変数（KEY=VALUE 形式、1行1つ）           │
│ [GITHUB_TOKEN=ghp_...                   ] │
│                                           │
│ ── ─────────────────────────────────────  │
│              [キャンセル]  [接続テスト]  [保存] │
└───────────────────────────────────────────┘
```

### 9.4 チャット画面のMCPサーバー選択

チャット入力エリアのツールバーに「MCPサーバー」ボタンを追加する。クリックでドロップダウンが開き、会話で使用するサーバーをトグルできる。

```
┌──────────────────────────────────────────────────────┐
│ メッセージを入力...                                    │
│                                                      │
│ [📎 添付] [🔧 MCP ▼] [🌐 Web検索]          [送信 ↵] │
└──────────────────────────────────────────────────────┘

[🔧 MCP ▼] クリック時:
┌──────────────────────────┐
│ MCPサーバー               │
├──────────────────────────┤
│ ☑ GitHub MCP (12ツール)  │
│ ☐ Filesystem MCP        │
│ ─────────────────────── │
│ ⚙ サーバーを管理...       │
└──────────────────────────┘
```

### 9.5 ツール実行インジケーター（`McpToolBadge.tsx`）

既存のツール実行表示を拡張し、MCPツールであることを示すバッジを表示する。

```typescript
// McpToolBadge.tsx の props
interface McpToolBadgeProps {
  toolName: string;     // "github__create_issue"
  serverId: string;     // "github"
  serverName: string;   // "GitHub MCP"
  status: 'running' | 'success' | 'error';
  input?: Record<string, unknown>;
  output?: string;
}
```

### 9.6 状態管理（Zustand）

新たに `mcpStore.ts` を追加し、MCPサーバー一覧と接続状態をクライアント側で管理する。

```typescript
// src/stores/mcpStore.ts

interface McpStore {
  servers: McpServerConfig[];
  statuses: Record<string, McpServerStatus>;
  selectedServerIds: string[];  // 現在の会話で有効なサーバー

  fetchServers: () => Promise<void>;
  addServer: (config: Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateServer: (id: string, updates: Partial<McpServerConfig>) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  toggleServer: (id: string) => void;
  fetchStatus: (id: string) => Promise<void>;
}
```

---

## 10. シーケンス図

### 10.1 MCPサーバー接続フロー（アプリ起動時）

```
Browser          Next.js Server         McpManager         MCP Server
   │                   │                    │                   │
   │  GET /api/mcp/    │                    │                   │
   │  servers          │                    │                   │
   │──────────────────►│                    │                   │
   │                   │  getMcpServers()   │                   │
   │                   │  (DB読み取り)       │                   │
   │                   │                   │                   │
   │                   │  initialize()      │                   │
   │                   │───────────────────►│                   │
   │                   │                   │  spawn / connect   │
   │                   │                   │───────────────────►│
   │                   │                   │  initialize RPC    │
   │                   │                   │◄──────────────────►│
   │                   │                   │  tools/list        │
   │                   │                   │◄──────────────────►│
   │                   │                   │  status: connected │
   │◄──────────────────│  servers + status │                   │
```

### 10.2 MCPツールを使ったチャットフロー

```
Browser          /api/chat           McpManager      LLMProvider     MCP Server
   │                 │                   │                │               │
   │  POST /api/chat │                   │                │               │
   │  { messages,    │                   │                │               │
   │    mcpServerIds }│                  │                │               │
   │────────────────►│                   │                │               │
   │                 │  getAllTools()     │                │               │
   │                 │──────────────────►│                │               │
   │                 │  [MCPツール一覧]   │                │               │
   │                 │◄──────────────────│                │               │
   │                 │                   │                │               │
   │                 │  streamChat(       │                │               │
   │                 │   messages,        │                │               │
   │                 │   tools=[静的+MCP])│                │               │
   │                 │────────────────────────────────────►│               │
   │                 │                   │                │  API call      │
   │◄────────────────│  text chunk       │                │               │
   │◄────────────────│  text chunk       │                │               │
   │◄────────────────│  tool_use chunk   │                │               │
   │                 │  (github__create_ │                │               │
   │                 │   issue)          │                │               │
   │                 │                   │                │               │
   │                 │  callTool(        │                │               │
   │                 │  "github__        │                │               │
   │                 │   create_issue")  │                │               │
   │                 │──────────────────►│                │               │
   │                 │                   │  tools/call    │               │
   │                 │                   │────────────────────────────────►│
   │                 │                   │  result        │               │
   │                 │                   │◄────────────────────────────────│
   │                 │  tool_result      │                │               │
   │                 │◄──────────────────│                │               │
   │                 │                   │                │               │
   │                 │  streamChat(      │                │               │
   │                 │   + tool_result)  │                │               │
   │                 │────────────────────────────────────►│               │
   │◄────────────────│  final text chunk │                │               │
   │◄────────────────│  done             │                │               │
```

### 10.3 リソース添付フロー

```
Browser                    /api/mcp/...         McpManager       MCP Server
   │                            │                   │                │
   │  GET /api/mcp/servers/     │                   │                │
   │  [id]/resources            │                   │                │
   │───────────────────────────►│                   │                │
   │                            │  listResources()  │                │
   │                            │──────────────────►│                │
   │                            │                   │  resources/list│
   │                            │                   │───────────────►│
   │                            │                   │  [uri, name...]│
   │                            │                   │◄───────────────│
   │  [リソース一覧]              │                   │                │
   │◄───────────────────────────│                   │                │
   │                            │                   │                │
   │ （ユーザーがリソースを選択）  │                   │                │
   │                            │                   │                │
   │  GET /api/mcp/servers/     │                   │                │
   │  [id]/resources/read       │                   │                │
   │  ?uri=file:///README.md    │                   │                │
   │───────────────────────────►│                   │                │
   │                            │  readResource()   │                │
   │                            │──────────────────►│                │
   │                            │                   │ resources/read │
   │                            │                   │───────────────►│
   │                            │                   │  { content }   │
   │                            │                   │◄───────────────│
   │  { content: "# README..." }│                   │                │
   │◄───────────────────────────│                   │                │
   │                            │                   │                │
   │ （リソース内容をメッセージに  │                   │                │
   │   添付して POST /api/chat） │                   │                │
```

---

## 11. 実装フェーズ計画

### フェーズ1: MCPクライアント基盤（推定: 2〜3日）

**目標:** MCPサーバーへの接続・ツール一覧取得・ツール実行が動作する状態

| タスク | ファイル |
|-------|---------|
| MCP型定義の作成 | `src/types/mcp.ts` |
| stdioトランスポート実装 | `src/lib/mcp/stdio-transport.ts` |
| SSEトランスポート実装 | `src/lib/mcp/sse-transport.ts` |
| McpClient 実装 | `src/lib/mcp/mcp-client.ts` |
| McpManager（シングルトン）実装 | `src/lib/mcp/mcp-manager.ts` |
| DBスキーマ追加（mcp_servers）| `src/lib/db.ts` |
| DBヘルパー関数追加 | `src/lib/db.ts` |

**完了条件:** Node.js スクリプトから MCP サーバーに接続し、ツールを実行できること

---

### フェーズ2: ツール統合（推定: 2〜3日）

**目標:** チャット画面から MCP ツールを呼び出せる状態

| タスク | ファイル |
|-------|---------|
| MCPサーバー管理API実装 | `app/api/mcp/servers/route.ts` など |
| `/api/chat` に mcpServerIds 対応を追加 | `app/api/chat/route.ts` |
| MCPツールのToolDefinition変換ロジック | `src/lib/mcp/mcp-manager.ts` |
| ツール実行ルーティング（MCP vs 静的） | `app/api/chat/route.ts` |

**完了条件:** GitHub MCPサーバーを接続し、「issueを作成して」というメッセージで実際にIssueが作成されること

---

### フェーズ3: リソース統合（推定: 2日）

**目標:** MCPリソースをメッセージのコンテキストとして添付できる状態

| タスク | ファイル |
|-------|---------|
| リソース一覧・取得APIの実装 | `app/api/mcp/servers/[id]/resources/route.ts` |
| リソース選択UIモーダル | `src/components/mcp/McpResourcePicker.tsx` |
| メッセージへのリソース添付ロジック | `src/hooks/useChat.ts` |

**完了条件:** Filesystem MCPでローカルファイルを選択し、メッセージのコンテキストとして送れること

---

### フェーズ4: UI完成（推定: 2〜3日）

**目標:** 一般ユーザーが使いやすいUIが整った状態

| タスク | ファイル |
|-------|---------|
| MCPサーバー管理パネル | `src/components/mcp/McpServerPanel.tsx` |
| サーバー追加・編集フォーム | `src/components/mcp/McpServerForm.tsx` |
| 設定モーダルにMCPタブ追加 | `src/components/settings/SettingsModal.tsx` |
| MCPツール実行バッジ | `src/components/mcp/McpToolBadge.tsx` |
| チャット入力エリアのMCPサーバー選択 | `src/components/chat/InputArea.tsx` |
| mcpStore（Zustand）実装 | `src/stores/mcpStore.ts` |
| 接続状態のポーリング | `src/hooks/useMcpStatus.ts` |

**完了条件:** UIのみを使ってMCPサーバーの追加・接続・ツール使用・リソース添付が一通り完結すること

---

### 対応MCPサーバーの例（動作確認済み想定）

| サーバー | パッケージ | トランスポート | 主なツール |
|---------|-----------|--------------|-----------|
| GitHub | `@modelcontextprotocol/server-github` | stdio | issue/PR管理 |
| Filesystem | `@modelcontextprotocol/server-filesystem` | stdio | ファイル読み書き |
| SQLite | `@modelcontextprotocol/server-sqlite` | stdio | DBクエリ |
| Slack | `@modelcontextprotocol/server-slack` | stdio | メッセージ送信 |
| Brave Search | `@modelcontextprotocol/server-brave-search` | stdio | Web検索 |

---

### 技術的リスクと対策

| リスク | 対策 |
|-------|------|
| stdioプロセスがゾンビプロセス化する | `McpManager.disconnect()` でプロセスを明示的に kill し、プロセス終了イベントを監視する |
| Next.js の Serverless 環境では stdio が使えない | stdio は Node.js サーバーモードのみ対応とし、Vercel Edge Runtime には SSEのみ対応とするドキュメントを整備する |
| 大量リソースによるコンテキスト超過 | リソース添付時にトークン数を概算し、超過する場合は警告を表示する |
| MCPサーバーの仕様差異 | 公式 SDK（`@modelcontextprotocol/sdk`）を使用することで実装差異を吸収する |

---

*作成日: 2026-04-19*
