# ビルトイン MCPサーバーの追加ガイド

プロジェクトに同梱する形で MCP サーバーを実装・登録する方法を説明します。
`mcp-servers/` ディレクトリに `.mjs` ファイルを追加し、`builtin-servers.ts` に登録するだけで、アプリ起動時に自動接続されます。

---

## 全体の流れ

```
1. mcp-servers/<name>.mjs を作成 (MCP サーバー本体)
2. src/lib/mcp/builtin-servers.ts に登録 (起動時の自動接続)
3. 必要に応じて .env.local に API キー等を追加
4. アプリを再起動して動作確認
```

---

## ステップ 1: MCP サーバーファイルの作成

`mcp-servers/` ディレクトリに ESM スクリプトを作成します。
以下は最小構成のテンプレートです。

```js
#!/usr/bin/env node
// mcp-servers/my-tool.mjs

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ツール定義
const TOOLS = [
  {
    name: 'my_tool',
    description: 'ツールの説明をここに書く',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: '入力メッセージ',
        },
      },
      required: ['message'],
    },
  },
];

// ツールの実装
async function handleMyTool(args) {
  const { message } = args;
  // ここに処理を実装する
  return `受け取ったメッセージ: ${message}`;
}

// サーバーの起動
const server = new Server(
  { name: 'my-tool', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    if (name === 'my_tool') {
      result = await handleMyTool(args);
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [{ type: 'text', text: result }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 実装パターンの参考

| ファイル | 特徴 |
|---------|------|
| `mcp-servers/file-output.mjs` | ファイル I/O、パストラバーサル防御、ワークスペース分離 |
| `mcp-servers/brave-search.mjs` | 外部 REST API 呼び出し、複数ツール定義 |
| `mcp-servers/mlit-geospatial.mjs` | 地理座標計算、API キー必須チェック |

---

## ステップ 2: builtin-servers.ts への登録

`src/lib/mcp/builtin-servers.ts` を開き、新しいサーバーの ID 定数と初期化ロジックを追加します。

```ts
// src/lib/mcp/builtin-servers.ts

export const BUILTIN_FILE_OUTPUT_ID = 'builtin-file-output';
export const BUILTIN_BRAVE_SEARCH_ID = 'builtin-brave-search';
export const BUILTIN_MLIT_GEOSPATIAL_ID = 'builtin-mlit-geospatial';
export const BUILTIN_MY_TOOL_ID = 'builtin-my-tool'; // ← 追加

export async function initBuiltinMcpServers(): Promise<void> {
  // ... 既存の初期化コード ...

  // ---- My Tool ----
  const myToolScriptPath = path.join(process.cwd(), 'mcp-servers', 'my-tool.mjs');
  const existingMyTool = getMcpServer(BUILTIN_MY_TOOL_ID);

  if (!existingMyTool) {
    createMcpServer({
      id: BUILTIN_MY_TOOL_ID,
      name: 'My Tool',
      transport: 'stdio',
      command: 'node',
      args: [myToolScriptPath],
      enabled: true,
    });
  } else if (existingMyTool.args?.[0] !== myToolScriptPath) {
    updateMcpServer(BUILTIN_MY_TOOL_ID, { args: [myToolScriptPath] });
  }

  const myToolConfig = getMcpServer(BUILTIN_MY_TOOL_ID)!;
  if (myToolConfig.enabled) {
    await mcpManager.connect(myToolConfig).catch(e => {
      console.error('[builtin-my-tool] Failed to connect:', e);
    });
  }
}
```

### API キーが必要なサーバーの場合

環境変数が設定されている場合のみ接続するパターンです。

```ts
const myApiKey = process.env.MY_API_KEY;
if (myApiKey) {
  const scriptPath = path.join(process.cwd(), 'mcp-servers', 'my-tool.mjs');
  const existing = getMcpServer(BUILTIN_MY_TOOL_ID);

  if (!existing) {
    createMcpServer({
      id: BUILTIN_MY_TOOL_ID,
      name: 'My Tool',
      transport: 'stdio',
      command: 'node',
      args: [scriptPath],
      env: { MY_API_KEY: myApiKey }, // ← 環境変数として渡す
      enabled: true,
    });
  } else {
    const updates: Parameters<typeof updateMcpServer>[1] = {};
    if (existing.args?.[0] !== scriptPath) updates.args = [scriptPath];
    if (existing.env?.MY_API_KEY !== myApiKey) updates.env = { MY_API_KEY: myApiKey };
    if (Object.keys(updates).length > 0) updateMcpServer(BUILTIN_MY_TOOL_ID, updates);
  }

  const config = getMcpServer(BUILTIN_MY_TOOL_ID)!;
  if (config.enabled) {
    await mcpManager.connect(config).catch(e => {
      console.error('[builtin-my-tool] Failed to connect:', e);
    });
  }
}
```

`.env.local` に API キーを追加します。

```bash
# .env.local
MY_API_KEY=your_api_key_here
```

---

## ステップ 3: 動作確認

アプリを再起動します。

```bash
npm run dev
```

起動ログに以下のようなエラーが出なければ接続成功です。

```
[builtin-my-tool] Failed to connect: ...  ← これが出なければOK
```

設定モーダルの「MCPサーバー」タブを開くと、追加したサーバーが `connected` 状態で表示されます。

---

## 仕組みの詳細

### 起動フロー

```
npm run dev
  └─ Next.js instrumentation フック (instrumentation.ts)
       └─ initBuiltinMcpServers() (builtin-servers.ts)
            ├─ DB に設定を upsert (mcp_servers テーブル)
            └─ mcpManager.connect() で子プロセスを起動
                 └─ node mcp-servers/my-tool.mjs
                      ↕ stdin/stdout (JSON-RPC 2.0)
                 McpClient (接続・ツール一覧取得)
```

### ツール名の衝突回避

LLM に渡されるツール名は `{serverId}__{toolName}` 形式になります。

```
サーバー ID: "builtin-my-tool"
ツール名:    "my_tool"
→ LLM へ渡す名前: "builtin-my-tool__my_tool"
```

### 環境変数の受け渡し

`createMcpServer` の `env` に指定した値は、子プロセスの環境変数として渡されます。
サーバー側では通常の `process.env.MY_KEY` で参照できます。
フロントエンドの API レスポンスでは値がマスクされ（`"MY_KEY": "***"`）、ブラウザに露出しません。

---

## よくある問題

| 症状 | 原因と対処 |
|------|-----------|
| `Failed to connect` ログが出る | スクリプトの構文エラーか、必須の環境変数が未設定。`node mcp-servers/my-tool.mjs` を直接実行して確認する |
| サーバーが `disconnected` のまま | `enabled: true` で登録されているか確認する |
| ツールが LLM に渡らない | チャット画面でそのサーバーが有効になっているか確認する（MCPサーバー選択ドロップダウン） |
| プロジェクトを移動した後に壊れる | `args[0]` のパスを自動更新する `else if` 節を登録コードに含める（本ガイドのサンプル参照） |
