# ファイル出力MCP 設計書

## 1. 概要・目的

### 背景

既存の general-chat-interface では、LLMが生成したコンテンツ（レポート・コード・データ等）をサーバーサイドに保存する手段がなかった。チャット履歴はDBに保存されるが、ファイルとして取り出したいケースに対応できていない。

### 目的

ローカルMCPサーバーとして **ファイル出力・読み込み機能** を組み込み、以下を実現する。

| 目的 | 詳細 |
|------|------|
| ファイルの書き出し | LLMが生成した内容をサーバーサイドのファイルとして保存できる |
| ファイルの読み込み | 保存済みのワークスペース内ファイルをLLMおよびUIから読み込める。ワークスペース外のファイルへのアクセスは禁止する |
| セッション分離 | チャット・タスクの会話ごとに専用ワークスペースを設け、セッション間でファイルが混在しない |
| 運用設定の柔軟性 | ワークスペースのルートディレクトリをサーバー環境変数で指定でき、本番環境に合わせた配置が可能 |

### 設計方針

1. **既存MCPインフラの活用**: 既存の `McpManager` / `McpClient` 基盤をそのまま使い、追加実装は最小限にとどめる
2. **自動セットアップ**: サーバー起動時に組み込みMCPサーバーが自動登録・接続され、ユーザーが手動設定する必要はない
3. **LLMへの透過性**: `workspace_id`（セッション識別子）はサーバー側で自動注入し、LLMのツールスキーマには露出しない
4. **セキュリティ優先**: パストラバーサルを防ぐパス検証をMCPサーバー・REST API双方で実施し、ワークスペース外へのアクセスを禁止する

### スコープ外

- ワークスペースの自動クリーンアップ（TTL設定等）

---

## 2. アーキテクチャ

### 全体構成

```
Browser (React App)
    │
    ├─① sessionId（会話ID）を含むチャットリクエスト
    │   ▼
    │  app/api/chat/route.ts
    │   │  workspace_id をLLMスキーマから除去・注入
    │   ▼
    │  McpManager → McpClient "builtin-file-output"
    │   │  stdio (JSON-RPC 2.0)
    │   ▼
    │  mcp-servers/file-output.mjs
    │   ▼
    │  MCP_WORKSPACE_ROOT/{sessionId}/  ← ファイル書き込み・読み込み
    │
    └─② ファイル読み込みリクエスト（UI向け）
        ▼
       app/api/workspaces/[sessionId]/route.ts       ← ファイル一覧
       app/api/workspaces/[sessionId]/files/route.ts ← ファイル内容読み込み
        │  パストラバーサル検証
        ▼
       MCP_WORKSPACE_ROOT/{sessionId}/  ← 読み取り専用アクセス
```

### 起動時の自動セットアップ

```
Next.js サーバー起動
    │
    ▼
instrumentation.ts  register()
    │
    ▼
src/lib/mcp/builtin-servers.ts  initBuiltinMcpServers()
    │
    ├── DBに "builtin-file-output" が未登録 → createMcpServer()
    ├── スクリプトパスが変わっていれば → updateMcpServer()
    │
    ▼
McpManager.connect(config)
    │
    ▼
file-output.mjs が subprocess として起動・待機
```

### 追加・変更ファイル一覧

| ファイル | 種別 | 役割 |
|---------|------|------|
| `mcp-servers/file-output.mjs` | 新規 | 組み込みMCPサーバー本体 |
| `src/lib/mcp/builtin-servers.ts` | 新規 | 起動時の自動登録ロジック |
| `instrumentation.ts` | 新規 | Next.js スタートアップフック |
| `app/api/workspaces/[sessionId]/route.ts` | 新規 | ワークスペースのファイル一覧API |
| `app/api/workspaces/[sessionId]/files/route.ts` | 新規 | ワークスペースのファイル読み込みAPI |
| `app/api/chat/route.ts` | 変更 | sessionId受け取り・workspace_id注入 |
| `app/api/tasks/[id]/chat/route.ts` | 変更 | MCPツール対応・workspace_id注入を追加 |
| `src/hooks/useChat.ts` | 変更 | sessionId（会話ID）をリクエストに付与 |
| `next.config.ts` | 変更 | `@modelcontextprotocol/sdk` をexternalPackagesに追加 |
| `.env.local.example` | 変更 | `MCP_WORKSPACE_ROOT` の説明を追記 |

---

## 3. MCPサーバー ツール定義

サーバーID: `builtin-file-output`
スクリプト: `mcp-servers/file-output.mjs`
トランスポート: `stdio`

### ツール一覧

| ツール名 | 説明 |
|---------|------|
| `write_file` | ファイルを書き込む（上書き）。親ディレクトリは自動作成 |
| `read_file` | ファイルの内容を読み込む |
| `list_files` | ワークスペース内のファイル・ディレクトリを再帰列挙 |
| `delete_file` | ファイルまたはディレクトリ（再帰）を削除 |
| `create_directory` | ディレクトリを作成（親ディレクトリも自動作成） |
| `get_workspace_info` | ワークスペースの絶対パスとファイル一覧を返す |

### 各ツールの入出力

**`write_file`**
```
入力:
  workspace_id  string  セッションID（サーバーが自動注入）
  path          string  ワークスペース内の相対パス  例: "report.md"
  content       string  書き込むテキスト内容

出力（成功）:  "Written: {sessionId}/report.md (1234 bytes)"
出力（失敗）:  "Error: Path traversal detected: ..."
```

**`read_file`**
```
入力:
  workspace_id  string  セッションID（サーバーが自動注入）
  path          string  ワークスペース内の相対パス

出力（成功）:  ファイルの内容（テキスト）
出力（失敗）:  "Error: File not found: ..."
```

**`list_files`**
```
入力:
  workspace_id  string  セッションID（サーバーが自動注入）
  path          string  列挙するサブディレクトリ（省略時: ワークスペースルート）

出力（成功）:
  "src/
   src/main.py (512 bytes)
   report.md (2048 bytes)"

出力（空・未作成）:
  "(workspace does not exist yet — no files written)"
```

**`delete_file`**
```
入力:
  workspace_id  string  セッションID（サーバーが自動注入）
  path          string  削除対象の相対パス（ディレクトリ指定で再帰削除）

出力（成功）:  "Deleted: report.md"
出力（失敗）:  "Error: Not found: ..."
```

**`create_directory`**
```
入力:
  workspace_id  string  セッションID（サーバーが自動注入）
  path          string  作成するディレクトリの相対パス

出力（成功）:  "Directory created: src/utils"
```

**`get_workspace_info`**
```
入力:
  workspace_id  string  セッションID（サーバーが自動注入）

出力（成功）:
  "Workspace path: /var/data/workspaces/{sessionId}
   Files (3):
   report.md (2048 bytes)
   src/
   src/main.py (512 bytes)"

出力（未作成）:
  "Workspace path: /var/data/workspaces/{sessionId}
   Status: not yet created (no files written)"
```

### LLMが受け取るスキーマ

`workspace_id` はサーバー側で注入されるため、LLMへのツールスキーマからは除外される。LLMは `path` と `content` のみを指定すればよい。

```
# LLMが見るwrite_fileのスキーマ（workspace_idなし）
required: [path, content]
properties:
  path:    "ワークスペース内の相対パス"
  content: "書き込むテキスト内容"
```

---

## 4. ワークスペース設計

### ディレクトリ構造

```
{MCP_WORKSPACE_ROOT}/          ← 環境変数で指定（デフォルト: ./workspaces）
    {conversationId-1}/        ← チャットセッションのワークスペース
        report.md
        src/
            main.py
    {conversationId-2}/        ← 別セッションのワークスペース（完全分離）
        output.csv
    {taskId-1}/                ← タスクセッションのワークスペース（将来対応）
        summary.txt
```

### セッションIDとワークスペースの対応

| セッション種別 | workspace_id の値 | 発行元 |
|--------------|-----------------|-------|
| チャット（会話） | `conversations.id`（UUID） | `crypto.randomUUID()` |
| タスク | `tasks.id`（UUID） | `crypto.randomUUID()` |

UUIDは英数字とハイフンのみで構成されるため、ディレクトリ名として安全に使用できる。

### workspace_id のバリデーション

MCPサーバー（`file-output.mjs`）はツール呼び出し時に `workspace_id` を以下の正規表現で検証する。不正な値は即座にエラーを返し、ファイルシステムへのアクセスを行わない。

```
パターン: /^[a-zA-Z0-9_-]+$/
許可: 英数字・ハイフン・アンダースコア
拒否: スラッシュ・ドット・空白・その他の記号
```

### パストラバーサル防止

ツールの `path` 引数に `../` 等が含まれる場合でも、ワークスペース外へのアクセスを防ぐ。

```
検証ロジック:
  workspaceDir = {MCP_WORKSPACE_ROOT}/{workspace_id}
  resolved     = path.resolve(workspaceDir, 入力パス)

  resolved が workspaceDir の配下でなければ → エラー

例:
  入力: path = "../../etc/passwd"
  resolved = /etc/passwd
  workspaceDir = /workspaces/abc-123/
  → "Path traversal detected" エラー
```

### ワークスペースのライフサイクル

| タイミング | 動作 |
|----------|------|
| 初回 `write_file` / `create_directory` 呼び出し時 | ワークスペースディレクトリを自動作成（`mkdir -p`） |
| 会話削除時 | **自動削除しない**（現時点ではファイルを手動管理） |
| サーバー再起動時 | ワークスペースはファイルシステムに残り続ける |

> **注意**: ワークスペースの自動クリーンアップ（TTL・会話削除連動）は本実装のスコープ外。運用上必要であれば別途 cron 等で対応する。

### 環境変数

| 変数名 | デフォルト値 | 説明 |
|-------|------------|------|
| `MCP_WORKSPACE_ROOT` | `{cwd}/workspaces` | ワークスペースルートの絶対パスまたは相対パス |

相対パスを指定した場合は `path.resolve()` でNext.jsサーバーの起動ディレクトリ基準の絶対パスに変換される。

---

## 5. セキュリティ設計

### 脅威モデル

| 脅威 | 攻撃シナリオ | 対策 |
|------|------------|------|
| パストラバーサル（書き込み） | LLMまたは悪意あるリクエストが `path = "../../etc/passwd"` 等を指定してワークスペース外に書き込む | MCPサーバー内で `path.resolve()` + プレフィックス検証 |
| パストラバーサル（読み込み） | REST APIの `path` パラメータに `../` を含めてワークスペース外のファイルを読み取る | REST APIでも同一の `path.resolve()` + プレフィックス検証を実施 |
| workspace_id インジェクション | `workspace_id = "../other-session"` 等でセッション間のファイルを横断アクセスする | workspace_id を正規表現 `/^[a-zA-Z0-9_-]+$/` で検証。スラッシュ・ドットを含む値は拒否 |
| workspace_id の偽装 | クライアントが他ユーザーの会話IDを指定し、別セッションのワークスペースを読み書きする | （現状）認証済みユーザーのみAPIアクセス可能。会話IDの所有者検証は行っていない（下記「既知の制限」参照） |
| ディスク枯渇 | 大量のファイルを書き込んでサーバーのディスクを使い切る | （現状）ファイルサイズ・数の上限なし（下記「既知の制限」参照） |

### 多層防御の構造

```
【MCPツール経由（LLM）】

Layer 1: API認証（NextAuth）
    ↓ 未認証リクエストは 401 で遮断

Layer 2: sessionId はサーバー側で注入
    ↓ LLMがworkspace_idを操作する余地なし

Layer 3: workspace_id バリデーション（MCPサーバー）
    ↓ 不正文字を含むIDは即時拒否

Layer 4: パストラバーサル検証（MCPサーバー）
    ↓ ワークスペース境界外のパスは即時拒否

Layer 5: subprocess分離
    ↓ MCPサーバーはNext.jsとは別プロセス
      プロセスクラッシュが本体に波及しない

【REST API経由（UI）】

Layer 1: API認証（NextAuth）
    ↓ 未認証リクエストは 401 で遮断

Layer 2: workspace_id バリデーション（APIルート）
    ↓ 不正文字を含むIDは即時拒否

Layer 3: パストラバーサル検証（APIルート）
    ↓ ワークスペース境界外のパスは即時拒否

Layer 4: 読み取り専用
    ↓ REST APIは fs.readFileSync のみ使用
      書き込み・削除操作は行わない
```

### sessionId の信頼境界

`sessionId` はクライアント（ブラウザ）から送信されるが、以下の理由でリスクは限定的と判断する。

- NextAuth による認証済みユーザーのみがAPIを呼び出せる
- `sessionId` はUUID形式であり、推測困難
- 書き込み先・読み込み先はアプリ専用の `MCP_WORKSPACE_ROOT` 配下に限定される

### 既知の制限（現バージョン）

| 制限事項 | 影響 | 将来対応案 |
|---------|------|----------|
| 会話IDの所有者検証なし | 認証済みユーザーが他ユーザーの会話IDを知っていれば、そのワークスペースに書き込める | APIで会話IDとユーザーの紐付けを検証する処理を追加 |
| ファイルサイズ・数の上限なし | 悪意ある利用でディスク枯渇の恐れ | ワークスペースあたりの上限（サイズ・ファイル数）を設ける |
| ワークスペースの自動削除なし | 長期運用でディスクを圧迫する可能性 | 会話削除イベントに連動したクリーンアップ、またはTTLベースのcronを導入 |

---

## 6. API変更仕様

### 変更対象エンドポイント

既存のエンドポイントは後方互換を維持しつつパラメータを追加する。UI向けの読み込みAPIを新規追加する。

### `POST /api/chat` — リクエストボディの変更

```typescript
// 変更前
{
  messages:      ChatMessage[];
  provider:      string;
  model:         string;
  systemPrompt?: string;
  tools?:        ToolDefinition[];
  mcpServerIds?: string[];
}

// 変更後（sessionId を追加）
{
  messages:      ChatMessage[];
  provider:      string;
  model:         string;
  systemPrompt?: string;
  tools?:        ToolDefinition[];
  mcpServerIds?: string[];
  sessionId?:    string;          // 追加: 会話ID（workspace_id として使用）
}
```

`sessionId` は省略可能。省略時はファイル出力ツールの workspace_id 注入は行われない。

### サーバー側の処理変更（`app/api/chat/route.ts`）

**① ツールスキーマの加工**

`builtin-file-output` サーバーのツールを LLM に渡す際、`workspace_id` プロパティをスキーマから除去する。

```
LLMへ渡すスキーマ（加工後）:
  write_file:
    required: [path, content]      ← workspace_id を除去
    properties:
      path, content

MCPサーバーへ渡す実際の引数（注入後）:
  { workspace_id: sessionId, path: "report.md", content: "..." }
```

**② システムプロンプトへの追記**

`builtin-file-output` が選択されており `sessionId` が存在する場合、システムプロンプトの末尾に以下を自動付加する。

```
---
You have access to a server-side file output workspace for this session.
Use the File Output MCP tools to save files.
The workspace is isolated to this conversation.
```

**③ ツール呼び出し時のworkspace_id注入**

```
ツール名が "builtin-file-output__" で始まる かつ sessionId が存在する場合:
  callInput = { workspace_id: sessionId, ...LLMが渡したinput }
```

### クライアント側の変更（`src/hooks/useChat.ts`）

`sendMessage` が `/api/chat` を呼び出す際に `sessionId: convId` を付与する。

```typescript
// 変更前
body: JSON.stringify({
  messages, model, provider, systemPrompt, tools, mcpServerIds,
})

// 変更後
body: JSON.stringify({
  messages, model, provider, systemPrompt, tools, mcpServerIds,
  sessionId: convId,    // 追加
})
```

---

#### `GET /api/workspaces/[sessionId]` — ファイル一覧取得 【新規】

ワークスペース内のファイル・ディレクトリを再帰列挙する。

```typescript
// レスポンス 200
{
  sessionId: string;
  workspacePath: string;   // サーバー上の絶対パス
  entries: Array<{
    path: string;          // ワークスペースルートからの相対パス
    type: 'file' | 'directory';
    size?: number;         // ファイルの場合のみ（bytes）
  }>;
}

// レスポンス 404
{ error: 'Workspace not found' }
// ワークスペースディレクトリが未作成の場合
```

バリデーション:
- `sessionId` が `/^[a-zA-Z0-9_-]+$/` にマッチしない場合 → `400`
- 未認証の場合 → `401`

---

#### `GET /api/workspaces/[sessionId]/files?path=...` — ファイル読み込み 【新規】

ワークスペース内の指定ファイルの内容をテキストで返す。

```typescript
// クエリパラメータ
path: string  // ワークスペース内の相対パス（例: "report.md", "src/main.py"）

// レスポンス 200
{
  path: string;      // リクエストされた相対パス
  content: string;   // ファイルの内容（UTF-8テキスト）
  size: number;      // bytes
}

// エラーレスポンス
400  { error: 'path parameter is required' }
400  { error: 'Invalid sessionId' }
400  { error: 'Path traversal detected' }
401  （未認証）
404  { error: 'File not found' }
400  { error: '"src/" is a directory, not a file' }
```

バリデーション順序:
1. 認証チェック
2. `sessionId` の正規表現検証
3. `path` パラメータの存在チェック
4. `path.resolve()` によるパストラバーサル検証
5. ファイル存在チェック
6. ディレクトリでないことの確認

---

#### サーバー側共通処理（`src/lib/workspace.ts`）【新規】

両APIルートで使用するパス解決・検証ロジックを共通化する。

```typescript
// ワークスペースのルートパスを返す
export function getWorkspaceRoot(): string

// sessionId を検証してワークスペースディレクトリの絶対パスを返す
// 不正な場合は Error をスロー
export function resolveWorkspaceDir(sessionId: string): string

// ワークスペース内のファイルパスを安全に解決する
// パストラバーサルを検出した場合は Error をスロー
export function resolveSafePath(sessionId: string, filePath: string): string
```

---

---

#### `POST /api/tasks/[id]/chat` — タスクエージェント応答の変更

現状はテキスト応答のみで、MCPツールは未対応。以下を追加する。

**① MCPツールの注入**

`builtin-file-output` サーバーのツールをエージェントの `streamChat()` に渡す。`workspace_id` はスキーマから除去し、サーバー側で `taskId` を注入する。

```
LLMへ渡すツール:
  builtin-file-output__write_file
    required: [path, content]   ← workspace_id を除去

MCPサーバーへ渡す引数（注入後）:
  { workspace_id: taskId, path: "...", content: "..." }
```

**② システムプロンプトへの追記**

`buildSystemPrompt()` の結果に以下を自動付加する。

```
---
You have access to a server-side file output workspace for this task.
Use the File Output MCP tools to save files.
The workspace is isolated to this task.
```

**③ ストリーミングループの拡張**

現状は `text` チャンクのみ処理している。`tool_use` / `tool_result` チャンクの処理を追加する。

| チャンク種別 | 現状 | 変更後 |
|------------|------|--------|
| `text` | ○ | ○（変更なし） |
| `tool_use` | × | ○（MCP tool_use を検知・実行） |
| `tool_result` | × | ○（実行結果をLLMへ返して継続） |
| `done` | ○ | ○（変更なし） |
| `error` | ○ | ○（変更なし） |

**④ ツール呼び出し時のworkspace_id注入**

```
ツール名が "builtin-file-output__" で始まる場合:
  callInput = { workspace_id: taskId, ...LLMが渡したinput }
```

---

### 変更なしのエンドポイント

| エンドポイント | 理由 |
|--------------|------|
| `GET/POST /api/mcp/servers` | 組み込みサーバーは起動時に自動登録されるため、クライアントからの操作は不要 |
| その他の会話・メッセージAPI | 影響なし |

---

## 7. シーケンス図

### 7.1 サーバー起動時の自動セットアップ

```
Next.js起動
    │
    ▼
instrumentation.ts register()
    │
    ▼
initBuiltinMcpServers()
    │
    ├─ getMcpServer("builtin-file-output")
    │       │
    │       ├─ 未登録 → createMcpServer()  DBに登録
    │       └─ 登録済み・パス変更あり → updateMcpServer()  パスを更新
    │
    ▼
McpManager.connect(config)
    │
    ▼
StdioClientTransport
    │  node mcp-servers/file-output.mjs を spawn
    ▼
file-output.mjs
    │  initialize ハンドシェイク
    │  tools/list 応答
    ▼
状態: connected  ツール数: 6
```

### 7.2 ファイル書き込みのチャットフロー

```
Browser              /api/chat            McpManager        file-output.mjs
    │                    │                    │                    │
    │ POST /api/chat      │                   │                    │
    │ { messages,         │                   │                    │
    │   mcpServerIds:     │                   │                    │
    │   ["builtin-        │                   │                    │
    │    file-output"],   │                   │                    │
    │   sessionId: convId }                   │                    │
    │───────────────────►│                   │                    │
    │                    │                   │                    │
    │                    │ getToolsForServers()                    │
    │                    │──────────────────►│                    │
    │                    │ [write_file, ...]  │                    │
    │                    │◄──────────────────│                    │
    │                    │                   │                    │
    │                    │ workspace_idをスキーマから除去           │
    │                    │ systemPromptにワークスペース説明を追記    │
    │                    │                   │                    │
    │                    │ LLMへストリーム送信（tools含む）         │
    │                    │                   │                    │
    │◄─── text chunk ────│                   │                    │
    │◄─── text chunk ────│                   │                    │
    │                    │                   │                    │
    │◄─ tool_use chunk ──│                   │                    │
    │  "builtin-file-     │                   │                    │
    │   output__          │                   │                    │
    │   write_file"       │                   │                    │
    │  { path, content }  │                   │                    │
    │                    │                   │                    │
    │                    │ workspace_id = sessionId を注入         │
    │                    │ callTool(name,     │                    │
    │                    │  { workspace_id,   │                    │
    │                    │    path, content })│                    │
    │                    │──────────────────►│                    │
    │                    │                   │ tools/call         │
    │                    │                   │───────────────────►│
    │                    │                   │                    │ パス検証
    │                    │                   │                    │ ファイル書き込み
    │                    │                   │ "Written: ..."     │
    │                    │                   │◄───────────────────│
    │◄─ tool_result ─────│                   │                    │
    │                    │                   │                    │
    │                    │ LLMへtool_result送信→最終応答生成       │
    │◄─── text chunk ────│                   │                    │
    │◄─── done ──────────│                   │                    │
```

### 7.3 パストラバーサル検知フロー

```
/api/chat                      file-output.mjs
    │                                │
    │ callTool("write_file",          │
    │  { workspace_id: "abc-123",     │
    │    path: "../../etc/passwd",    │
    │    content: "..." })            │
    │────────────────────────────────►│
    │                                │
    │                                │ workspaceDir = /workspaces/abc-123
    │                                │ resolved = /etc/passwd
    │                                │
    │                                │ resolved が workspaceDir 配下でない
    │                                │ → Error: Path traversal detected
    │                                │
    │◄── isError: true ──────────────│
    │    "Error: Path traversal       │
    │     detected: ..."              │
    │                                │
    │ tool_result としてLLMへ返す      │
    │ ファイルシステムへのアクセスなし  │
```

### 7.4 UI経由のファイル読み込みフロー

```
Browser              /api/workspaces/[sessionId]        ファイルシステム
    │                          │                              │
    │  GET /api/workspaces/    │                              │
    │  {sessionId}             │                              │
    │─────────────────────────►│                              │
    │                          │ sessionId バリデーション      │
    │                          │ resolveWorkspaceDir()        │
    │                          │─────────────────────────────►│
    │                          │ ディレクトリ存在確認           │
    │                          │ 再帰的ファイル列挙            │
    │                          │◄─────────────────────────────│
    │  { entries: [...] }      │                              │
    │◄─────────────────────────│                              │
    │                          │                              │
    │  GET /api/workspaces/    │                              │
    │  {sessionId}/files       │                              │
    │  ?path=report.md         │                              │
    │─────────────────────────►│                              │
    │                          │ sessionId バリデーション      │
    │                          │ path バリデーション           │
    │                          │ resolveSafePath()            │
    │                          │ パストラバーサル検証          │
    │                          │─────────────────────────────►│
    │                          │ fs.readFileSync()            │
    │                          │◄─────────────────────────────│
    │  { path, content, size } │                              │
    │◄─────────────────────────│                              │
```

**パストラバーサル検知の場合:**

```
Browser              /api/workspaces/[sessionId]/files
    │                          │
    │  GET ?path=../../etc/passwd
    │─────────────────────────►│
    │                          │ resolveSafePath()
    │                          │ resolved = /etc/passwd
    │                          │ workspaceDir = /workspaces/{sessionId}
    │                          │ → 境界外と判定
    │  400                     │
    │  { error: 'Path          │
    │    traversal detected' } │
    │◄─────────────────────────│
    │                          │ ファイルシステムへの
    │                          │ アクセスなし
```

### 7.5 タスクエージェントによるファイル出力フロー

```
Browser        /api/tasks/[id]/chat    McpManager      file-output.mjs
    │                  │                   │                 │
    │ POST              │                   │                 │
    │ { agentName,      │                   │                 │
    │   triggerMsgId }  │                   │                 │
    │─────────────────►│                   │                 │
    │                  │ getTask(id)        │                 │
    │                  │ buildSystemPrompt()│                 │
    │                  │ + workspace追記    │                 │
    │                  │                   │                 │
    │                  │ getToolsForServers │                 │
    │                  │ ("builtin-file-   │                 │
    │                  │  output")         │                 │
    │                  │──────────────────►│                 │
    │                  │ workspace_idを     │                 │
    │                  │ スキーマから除去   │                 │
    │                  │◄──────────────────│                 │
    │                  │                   │                 │
    │                  │ LLMへストリーム送信（tools含む）     │
    │                  │                   │                 │
    │◄── streaming ────│                   │                 │
    │◄── streaming ────│                   │                 │
    │                  │                   │                 │
    │◄── tool_use ─────│                   │                 │
    │  "builtin-file-  │                   │                 │
    │   output__       │                   │                 │
    │   write_file"    │                   │                 │
    │  { path, content}│                   │                 │
    │                  │                   │                 │
    │                  │ workspace_id =    │                 │
    │                  │ taskId を注入      │                 │
    │                  │ callTool(name,    │                 │
    │                  │  { workspace_id,  │                 │
    │                  │    path, content})│                 │
    │                  │──────────────────►│                 │
    │                  │                   │ tools/call      │
    │                  │                   │────────────────►│
    │                  │                   │                 │ ファイル書き込み
    │                  │                   │ "Written: ..."  │
    │                  │                   │◄────────────────│
    │                  │ tool_resultをLLM  │                 │
    │                  │ へ返して応答継続   │                 │
    │◄── streaming ────│                   │                 │
    │◄── stream_end ───│                   │                 │
    │                  │ addTaskMessage()  │                 │
    │                  │ publish()         │                 │
```

---

## 8. 設定・運用ガイド

### 8.1 環境変数

`.env.local` に以下を追加する。

```bash
# ワークスペースのルートディレクトリ
# 省略時のデフォルト: {プロジェクトルート}/workspaces
MCP_WORKSPACE_ROOT=/var/data/chat-workspaces
```

パスの指定ルール:
- 絶対パス・相対パスどちらも可
- 相対パスはNext.jsサーバーの起動ディレクトリ（`process.cwd()`）を基準に解決される
- 起動時にディレクトリが存在しない場合は自動作成される

### 8.2 初回セットアップ手順

追加の手順は不要。サーバーを起動するだけで自動的にセットアップされる。

```bash
# 1. 環境変数を設定（任意）
echo "MCP_WORKSPACE_ROOT=/var/data/chat-workspaces" >> .env.local

# 2. サーバーを起動
npm run dev   # または npm run start

# 起動ログで以下が確認できれば正常
# [builtin-file-output] connected (6 tools)
```

### 8.3 動作確認方法

UIの設定画面 → MCPサーバー一覧で `File Output` が `connected` 状態であることを確認する。

```
MCPサーバー一覧:
  ● File Output   [stdio] [connected]   6ツール
```

チャット画面での動作確認:

```
1. MCPツールメニューから "File Output" を選択（チェックを入れる）
2. 以下のようなメッセージを送信:
   「Hello Worldと書いたtest.txtを保存してください」
3. LLMがwrite_fileを呼び出し、結果が返ること を確認
4. {MCP_WORKSPACE_ROOT}/{会話ID}/test.txt が作成されていることをサーバー上で確認
```

### 8.4 組み込みサーバーの管理

`builtin-file-output` はDBに登録されるため、UIのMCPサーバー管理画面にも表示される。

| 操作 | 動作 |
|------|------|
| 無効化（enabled = false） | 次回起動時から自動接続されなくなる |
| 削除 | 次回起動時に再登録・再接続される |
| コマンド・引数の手動変更 | 次回起動時に `instrumentation.ts` が正しいパスに上書きする |

> 組み込みサーバーの設定はコードで管理されているため、UI上での変更は永続しない。

### 8.5 ワークスペースのメンテナンス

自動クリーンアップ機能は現バージョンに含まれない。必要に応じて以下のような運用を行う。

```bash
# 30日以上更新されていないワークスペースを削除する例
find /var/data/chat-workspaces -mindepth 1 -maxdepth 1 \
  -type d -mtime +30 -exec rm -rf {} \;
```

---

*作成日: 2026-04-20*
