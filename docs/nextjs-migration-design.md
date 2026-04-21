# Next.js 移行設計書

## 概要

現在の構成（Vite + React SPA）を Next.js に移行し、以下の変更を行う。

- **LLM API キー**をサーバーサイドの環境変数で管理（ブラウザに露出しない）
- **チャット履歴**をサーバーサイドの SQLite DB で永続化（localStorage から移行）
- **ストリーミング**を Next.js の Route Handler（Server-Sent Events）経由で実現

---

## 現在のアーキテクチャ

```
Browser
  └─ React SPA (Vite)
       ├─ LLM SDK (anthropic, gemini, bedrock) ← APIキーがブラウザに露出
       ├─ Zustand store (localStorage) ← 履歴がブラウザのみに保存
       └─ 直接 fetch → api.anthropic.com / Google / AWS
```

**問題点:**
- API キーが localStorage・バンドルに含まれる → XSS で漏洩リスク
- `anthropic-dangerous-direct-browser-access: true` ヘッダーが必要
- チャット履歴がブラウザローカルにしか存在しない（デバイス間共有不可・消去リスク）

---

## 移行後のアーキテクチャ

```
Browser
  └─ Next.js (App Router)
       ├─ Client Components (UI)
       │    ├─ チャット画面（SSE でストリームを受信）
       │    └─ 設定画面（APIキー入力UI は不要になる）
       └─ Server (Route Handlers / Server Components)
            ├─ POST /api/chat → LLM API 呼び出し (SSE レスポンス)
            ├─ GET/POST/DELETE /api/conversations → 会話 CRUD
            ├─ GET/POST/DELETE /api/conversations/[id]/messages → メッセージ CRUD
            └─ SQLite (better-sqlite3)
                 ├─ conversations テーブル
                 └─ messages テーブル
```

---

## ディレクトリ構造（移行後）

```
general-chat-interface/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # ルートレイアウト（テーマ・フォント）
│   ├── page.tsx                  # メインページ（チャット UI）
│   └── api/
│       ├── chat/
│       │   └── route.ts          # LLM ストリーミング endpoint
│       ├── conversations/
│       │   └── route.ts          # 会話一覧取得・新規作成
│       └── conversations/[id]/
│           ├── route.ts          # 会話取得・更新・削除
│           └── messages/
│               └── route.ts      # メッセージ一覧取得・追加
├── src/
│   ├── components/               # 現行のコンポーネントをそのまま移行
│   │   ├── artifact/
│   │   ├── chat/
│   │   ├── layout/
│   │   ├── scenario/
│   │   └── settings/
│   ├── hooks/
│   │   ├── useChat.ts            # fetch → /api/chat に変更
│   │   └── useConversations.ts   # fetch → /api/conversations に変更
│   ├── stores/
│   │   └── chatStore.ts          # persist 削除・API 経由に変更
│   ├── lib/
│   │   ├── db.ts                 # SQLite 接続・初期化（サーバーサイド専用）
│   │   ├── anthropic.ts          # サーバーサイドのみで使用
│   │   ├── providers/
│   │   │   ├── gemini.ts
│   │   │   └── bedrock.ts
│   │   └── llm-provider.ts
│   └── types/
│       └── index.ts
├── .env.local                    # APIキーなど（Git 管理外）
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## API 設計

### POST /api/chat

LLM にメッセージを送信し、SSE（Server-Sent Events）でストリームを返す。

**リクエスト:**
```json
{
  "conversationId": "uuid",
  "messages": [
    { "role": "user", "content": "こんにちは" }
  ],
  "model": "claude-sonnet-4-6",
  "provider": "anthropic",
  "systemPrompt": "あなたは...",
  "tools": []
}
```

**レスポンス:** `Content-Type: text/event-stream`
```
data: {"type":"text","text":"こんに"}
data: {"type":"text","text":"ちは"}
data: {"type":"tool_use","toolUse":{...}}
data: {"type":"done"}
data: {"type":"error","error":"..."}
```

**サーバー側の処理:**
1. `provider` の値で使用する LLM プロバイダーを選択
2. 環境変数からAPIキーを取得（クライアントからは受け取らない）
3. `streamChat()` の AsyncGenerator を SSE に変換してレスポンス

---

### GET /api/conversations

会話一覧を取得する。

**レスポンス:**
```json
[
  {
    "id": "uuid",
    "title": "会話タイトル",
    "createdAt": "2026-04-18T00:00:00Z",
    "updatedAt": "2026-04-18T00:00:00Z",
    "scenarioId": null
  }
]
```

---

### POST /api/conversations

新しい会話を作成する。

**リクエスト:**
```json
{
  "title": "新しい会話",
  "scenarioId": null
}
```

---

### GET /api/conversations/[id]

特定の会話（メッセージ含む）を取得する。

**レスポンス:**
```json
{
  "id": "uuid",
  "title": "タイトル",
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "メッセージ本文",
      "images": [],
      "artifacts": [],
      "timestamp": "2026-04-18T00:00:00Z"
    }
  ]
}
```

---

### PATCH /api/conversations/[id]

会話タイトル等を更新する。

**リクエスト:**
```json
{ "title": "新しいタイトル" }
```

---

### DELETE /api/conversations/[id]

会話を削除する（関連メッセージも CASCADE 削除）。

---

### POST /api/conversations/[id]/messages

メッセージを追加する。

**リクエスト:**
```json
{
  "id": "uuid",
  "role": "user",
  "content": "テキスト",
  "images": [],
  "artifacts": [],
  "timestamp": "2026-04-18T00:00:00Z"
}
```

---

## データベース設計（SQLite）

### 使用ライブラリ

`better-sqlite3` を使用（同期 API、Node.js サーバーサイドのみ）。

ファイルパス: `./data/chat.db`（プロジェクトルート以下、`.gitignore` 対象）

---

### conversations テーブル

```sql
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '新しい会話',
  scenario_id TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

### messages テーブル

```sql
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL DEFAULT '',
  images_json     TEXT NOT NULL DEFAULT '[]',   -- ImageAttachment[] をJSON文字列化
  artifacts_json  TEXT NOT NULL DEFAULT '[]',   -- Artifact[] をJSON文字列化
  timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
  sort_order      INTEGER NOT NULL DEFAULT 0    -- 順序保証用
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id, sort_order);
```

**補足:**
- `images` と `artifacts` は型が複雑なため、JSON 文字列として格納する
- `sort_order` は `timestamp` だけでは衝突する可能性があるため別途管理

---

### settings テーブル（オプション）

ユーザーごとの設定（マルチユーザー対応しない場合は不要でもよい）。

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

保存対象: `systemPrompt`, `model`, `provider`, `theme`  
**APIキーは保存しない**（環境変数のみ）

---

## 環境変数設計

`.env.local` ファイルで管理（Git 管理外）。

```env
# Anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxx

# Google Gemini
GOOGLE_GENERATIVE_AI_API_KEY=AIzaxxxxx

# AWS Bedrock
AWS_ACCESS_KEY_ID=AKIAxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxx
AWS_REGION=us-east-1

# SQLite DB ファイルパス（省略時は ./data/chat.db）
DATABASE_PATH=./data/chat.db
```

**変更点:**
- クライアントの `SettingsModal` から API キー入力欄を削除（または非表示）
- `chatStore` の `settings.apiKey` を削除
- サーバー側で `process.env.ANTHROPIC_API_KEY` 等を直接参照

---

## 主要ファイルの変更内容

### 削除・大幅変更が必要なファイル

| ファイル | 変更内容 |
|---|---|
| `src/lib/anthropic.ts` | `apiKey` コンストラクタ引数を削除、`process.env` を使用 |
| `src/lib/providers/gemini.ts` | 同上 |
| `src/lib/providers/bedrock.ts` | 同上 |
| `src/stores/chatStore.ts` | `persist` 削除。APIキー関連 state 削除。データ操作を API 呼び出しに変更 |
| `src/hooks/useChat.ts` | LLM 直接呼び出し → `POST /api/chat` への fetch に変更 |
| `src/hooks/useConversations.ts` | localStorage → `/api/conversations` への fetch に変更 |
| `src/components/settings/SettingsModal.tsx` | APIキー入力欄を削除 |
| `vite.config.ts` | 削除（Next.js に置き換え） |

### 新規作成が必要なファイル

| ファイル | 内容 |
|---|---|
| `app/layout.tsx` | Next.js ルートレイアウト |
| `app/page.tsx` | メインページ（現行の App.tsx 相当） |
| `app/api/chat/route.ts` | LLM ストリーミング Route Handler |
| `app/api/conversations/route.ts` | 会話一覧 CRUD |
| `app/api/conversations/[id]/route.ts` | 会話詳細 CRUD |
| `app/api/conversations/[id]/messages/route.ts` | メッセージ CRUD |
| `src/lib/db.ts` | SQLite 接続・スキーマ初期化・クエリ関数 |
| `next.config.ts` | Next.js 設定 |
| `.env.local` | APIキー（サンプル: `.env.local.example` として管理） |
| `.env.local.example` | APIキーのサンプル（Git 管理対象） |
| `data/.gitkeep` | DB ファイル格納ディレクトリ |

---

## フロントエンドの SSE 受信実装方針

`useChat.ts` でのストリーム受信は現行と同じ SSE パース実装を流用する。
変更点は呼び出し先を LLM SDK から `/api/chat` へ変更するのみ。

```typescript
// 変更前: 各プロバイダーの SDK を直接呼び出し
const provider = getProvider(settings);
for await (const chunk of provider.streamChat(...)) { ... }

// 変更後: /api/chat を fetch して SSE を読む
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ conversationId, messages, model, provider, systemPrompt, tools }),
});
const reader = response.body!.getReader();
// 現行の SSE パースロジックをそのまま使用
```

---

## 移行手順（実装フェーズ）

1. **Next.js プロジェクトのセットアップ**
   - `package.json` に `next`, `better-sqlite3`, `@types/better-sqlite3` を追加
   - `vite`, `@vitejs/plugin-react` を削除
   - `next.config.ts`, `app/layout.tsx`, `app/page.tsx` を作成

2. **DB 層の実装**
   - `src/lib/db.ts` でスキーマ初期化・クエリ関数を実装

3. **API Route Handlers の実装**
   - `/api/chat` → SSE ストリーミング
   - `/api/conversations` 系 → CRUD

4. **LLM プロバイダーの修正**
   - APIキー取得を `process.env` に変更
   - `'anthropic-dangerous-direct-browser-access'` ヘッダーを削除

5. **クライアント側の修正**
   - `chatStore.ts` から `persist` と APIキー関連を削除
   - `useChat.ts` を `/api/chat` 呼び出しに変更
   - `useConversations.ts` を API 呼び出しに変更
   - `SettingsModal.tsx` から APIキー入力欄を削除

6. **動作確認・テスト**

---

## 考慮事項・注意点

### ストリーミングの注意
- Next.js の Route Handler で `ReadableStream` を使い SSE を実装する
- `Edge Runtime` は `better-sqlite3` が非対応のため **Node.js Runtime** を使用する
  ```typescript
  // app/api/chat/route.ts の先頭
  export const runtime = 'nodejs';
  ```

### マルチユーザー対応
- 現行はシングルユーザー前提の設計
- 将来的にマルチユーザー対応する場合は `users` テーブルと認証を追加する必要がある
- 今回の設計では考慮しない

### 画像データの扱い
- `images_json` カラムに base64 画像が含まれる場合、DB サイズが肥大化する
- 将来的にはファイルシステムや S3 に保存してパスのみ DB に持つ方式を検討する
- 今回はそのまま JSON に格納する方針

### シナリオ機能
- `scenarioStore.ts` の `persist`（localStorage）は現行のまま維持するか、DB の `settings` テーブルに移行するか検討が必要
- 今回は localStorage のまま維持する方針とする

### `"use client"` ディレクティブ
- Zustand store を使用するコンポーネントはすべて `"use client"` が必要
- LLM プロバイダーのコードは `app/api/` 以下でのみ使用し、クライアントバンドルに含めない

### パッケージの整理
- `@anthropic-ai/sdk`, `@google/genai`, `@aws-sdk/client-bedrock-runtime` はサーバーサイドでのみ使用
- Next.js の `serverExternalPackages` に追加してクライアントバンドルから除外する
  ```typescript
  // next.config.ts
  const nextConfig = {
    serverExternalPackages: [
      '@anthropic-ai/sdk',
      '@google/genai',
      '@aws-sdk/client-bedrock-runtime',
      'better-sqlite3',
    ],
  };
  ```
