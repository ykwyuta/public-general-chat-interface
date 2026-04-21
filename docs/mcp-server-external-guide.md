# 外部 MCPサーバーの追加ガイド（設定ファイル経由）

外部の MCP サーバー（npm パッケージや別プロセスで動く HTTP サービス）を、設定ファイルまたは管理 UI から登録する方法を説明します。
コードの変更は不要で、接続設定を DB に登録するだけで利用できます。

---

## トランスポート方式の選択

| 方式 | 用途 | 例 |
|------|------|-----|
| **stdio** | ローカルで npm パッケージをプロセス起動して使う | `@modelcontextprotocol/server-github` |
| **SSE** | リモートの HTTP エンドポイントに接続する | `https://mcp.example.com/sse` |

---

## 方法 A: 管理 UI から登録する

アプリが起動している状態で、設定モーダルの「MCPサーバー」タブから追加できます。

```
設定アイコン → MCPサーバータブ → [+ サーバー追加]
```

### stdio の設定例（GitHub MCP）

| フィールド | 値 |
|-----------|-----|
| 名前 | `GitHub MCP` |
| トランスポート | `stdio` |
| コマンド | `npx` |
| 引数（1行1つ） | `-y`<br>`@modelcontextprotocol/server-github` |
| 環境変数（KEY=VALUE） | `GITHUB_TOKEN=ghp_xxxxxxxxxxxx` |

### SSE の設定例（リモートサービス）

| フィールド | 値 |
|-----------|-----|
| 名前 | `My Remote MCP` |
| トランスポート | `SSE` |
| URL | `https://mcp.example.com/sse` |
| ヘッダー（KEY=VALUE） | `Authorization=Bearer your_token` |

---

## 方法 B: 設定ファイル（JSON）で一括登録する

アプリ起動前に設定ファイルを用意してインポートする方法です。
CI/CD 環境や複数台のサーバーに同じ設定を配布する場合に便利です。

### 設定ファイルのフォーマット

```json
{
  "mcpServers": [
    {
      "id": "github",
      "name": "GitHub MCP",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      },
      "enabled": true
    },
    {
      "id": "filesystem",
      "name": "Filesystem MCP",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
      "enabled": true
    },
    {
      "id": "my-remote-mcp",
      "name": "My Remote MCP",
      "transport": "sse",
      "url": "https://mcp.example.com/sse",
      "headers": {
        "Authorization": "Bearer your_token"
      },
      "enabled": true
    }
  ]
}
```

### フィールド一覧

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | string | ✓ | 一意な識別子。ツール名のプレフィックスになる（例: `github__create_issue`） |
| `name` | string | ✓ | UI に表示される名前 |
| `transport` | `"stdio"` \| `"sse"` | ✓ | 接続方式 |
| `command` | string | stdio のみ | 実行コマンド（例: `npx`, `node`, `python`） |
| `args` | string[] | stdio のみ | コマンドの引数リスト |
| `env` | object | 任意 | 子プロセスに渡す環境変数（APIキー等） |
| `url` | string | SSE のみ | SSE エンドポイントの URL |
| `headers` | object | SSE のみ | HTTP リクエストヘッダー（認証トークン等） |
| `enabled` | boolean | 任意 | `false` にすると登録はされるが接続しない（デフォルト: `true`） |

### 設定ファイルをインポートするスクリプト

プロジェクトルートに以下のスクリプトを用意し、アプリ起動前に実行します。

```js
// scripts/import-mcp-config.mjs
import fs from 'fs';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'chat.db');
const CONFIG_PATH = process.argv[2] ?? 'mcp-config.json';

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const db = new Database(DB_PATH);

const upsert = db.prepare(`
  INSERT INTO mcp_servers (id, name, transport, command, args_json, env_json, url, headers_json, enabled)
  VALUES (@id, @name, @transport, @command, @args_json, @env_json, @url, @headers_json, @enabled)
  ON CONFLICT(id) DO UPDATE SET
    name         = excluded.name,
    transport    = excluded.transport,
    command      = excluded.command,
    args_json    = excluded.args_json,
    env_json     = excluded.env_json,
    url          = excluded.url,
    headers_json = excluded.headers_json,
    enabled      = excluded.enabled,
    updated_at   = datetime('now')
`);

for (const server of config.mcpServers) {
  upsert.run({
    id:           server.id,
    name:         server.name,
    transport:    server.transport,
    command:      server.command ?? null,
    args_json:    server.args ? JSON.stringify(server.args) : null,
    env_json:     server.env ? JSON.stringify(server.env) : null,
    url:          server.url ?? null,
    headers_json: server.headers ? JSON.stringify(server.headers) : null,
    enabled:      server.enabled !== false ? 1 : 0,
  });
  console.log(`Registered: ${server.id} (${server.name})`);
}

db.close();
```

実行方法:

```bash
node scripts/import-mcp-config.mjs mcp-config.json
npm run dev
```

---

## よく使う外部 MCPサーバーの設定例

### GitHub MCP

```json
{
  "id": "github",
  "name": "GitHub MCP",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": { "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx" }
}
```

**提供ツールの例:** `create_issue`, `list_pull_requests`, `get_file_contents` など

### Filesystem MCP

```json
{
  "id": "filesystem",
  "name": "Filesystem MCP",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/project"],
  "env": {}
}
```

> 第3引数以降にアクセスを許可するディレクトリを指定します。複数指定可能です。

**提供ツールの例:** `read_file`, `write_file`, `list_directory` など

### SQLite MCP

```json
{
  "id": "sqlite",
  "name": "SQLite MCP",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-sqlite", "/path/to/database.db"]
}
```

**提供ツールの例:** `query`, `list_tables`, `describe_table` など

### Brave Search MCP（外部パッケージ版）

```json
{
  "id": "brave-search-ext",
  "name": "Brave Search (external)",
  "transport": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-brave-search"],
  "env": { "BRAVE_API_KEY": "BSAxxxxxxxxxx" }
}
```

> ビルトインの Brave Search サーバー（`builtin-brave-search`）が既に登録されている場合は、ID が衝突しないよう `"id"` を別の値にしてください。

---

## 仕組みの詳細

### 接続フロー（stdio）

```
アプリ起動
  └─ DB から enabled=true のサーバーを読み込み
       └─ mcpManager.connect(config)
            └─ child_process.spawn(command, args, { env })
                 ↕ stdin / stdout（JSON-RPC 2.0）
            McpClient が initialize → tools/list を実行
            → ツール一覧をメモリに保持
```

### 接続フロー（SSE）

```
アプリ起動
  └─ mcpManager.connect(config)
       └─ HTTP GET {url}  ← SSE ストリーム確立
          HTTP POST {url} ← JSON-RPC コマンド送信
       McpClient が initialize → tools/list を実行
```

### ツール名の衝突回避

登録した `id` がツール名のプレフィックスになります。

```
id: "github"  +  ツール: "create_issue"
→ LLM に渡す名前: "github__create_issue"
```

異なるサーバーで同じツール名が重複しても安全に共存できます。

### セキュリティについて

- `env` と `headers` に指定したシークレットはサーバーサイドのみで管理され、ブラウザ（フロントエンド API レスポンス）では `"KEY": "***"` のようにマスクされます。
- stdio サーバーは Next.js の Node.js サーバープロセスの子プロセスとして動作します。Vercel Edge Runtime 等のサーバーレス環境では stdio は使用できません（SSE のみ対応）。

---

## トラブルシューティング

| 症状 | 確認事項 |
|------|---------|
| 管理 UI に `error` と表示される | コマンドが存在するか確認: `npx -y @modelcontextprotocol/server-github` を手動実行 |
| ツールが表示されない | サーバーが `connected` になっているか確認。チャット画面の MCPサーバー選択でそのサーバーを有効化しているか確認 |
| SSE サーバーに接続できない | URL が正しいか、ファイアウォールで許可されているか確認。`curl -N {url}` で疎通確認 |
| `npx` が見つからないエラー | `command` を絶対パスに変更: `/usr/local/bin/npx` |
| 環境変数が渡っていない | `env` フィールドに正しい形式（`{ "KEY": "VALUE" }`）で記述されているか確認 |
