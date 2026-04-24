# Chat Template Feature Design Document

## 1. 概要 (Overview)

通常のチャット（Standard Chat）機能において、タスクテンプレートとは別に「チャットテンプレート」機能を追加する。
これにより、特定の用途や目的に合わせたチャット環境を簡単に構築・再利用できるようになる。

### 主な機能
- **ウェルカムメッセージ**: チャット開始時に表示される初期メッセージ。
- **システムプロンプト**: LLMに設定するカスタムプロンプト。
- **デフォルトMCP**: チャット開始時に自動的に有効化されるMCPサーバーのリスト。
- **コンテキストコンテンツ**: 画像やテキストファイルなどの事前提供データ。テンプレートからチャットを開始する際、これらのファイルはセッション毎のワークスペースに自動的にコピーされる。

---

## 2. データベース設計 (Database Schema)

`src/lib/db.ts` の `initDatabase` に以下のテーブルを追加する。

### `chat_templates`

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT (UUID) | 主キー |
| `name` | TEXT | テンプレート名（必須） |
| `description` | TEXT | テンプレートの説明（任意） |
| `welcome_message` | TEXT | チャット開始時に表示するウェルカムメッセージ |
| `system_prompt` | TEXT | 適用するシステムプロンプト |
| `mcp_servers` | TEXT | デフォルトで有効にするMCPサーバーIDのリスト (JSON配列) |
| `created_by` | TEXT | 作成者のユーザー名 |
| `created_at` | TEXT | 作成日時 |
| `updated_at` | TEXT | 更新日時 |

### `chat_template_files`
テンプレートに紐づくコンテキストコンテンツ（ファイル）を保存するテーブル。またはファイルシステム（`data/chat-templates/`等）に保存する設計も可能だが、SQLiteで一元管理するアプローチとする。

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT (UUID) | 主キー |
| `template_id` | TEXT | `chat_templates(id)` への外部キー (CASCADE) |
| `filename` | TEXT | ファイル名 (例: `guidelines.txt`, `sample.png`) |
| `content` | TEXT | ファイルコンテンツ（テキスト、または画像のBase64） |
| `media_type` | TEXT | MIMEタイプ (例: `text/plain`, `image/png`) |
| `created_at` | TEXT | 作成日時 |

---

## 3. TypeScript 型定義 (Type Definitions)

`src/types/chatTemplate.ts` を新規作成する。

```typescript
export interface ChatTemplateFile {
  id: string;
  templateId: string;
  filename: string;
  content: string; // Base64 or text
  mediaType: string;
}

export interface ChatTemplate {
  id: string;
  name: string;
  description: string;
  welcomeMessage: string;
  systemPrompt: string;
  mcpServers: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  files?: ChatTemplateFile[];
}

export interface CreateChatTemplateParams {
  name: string;
  description?: string;
  welcomeMessage?: string;
  systemPrompt?: string;
  mcpServers?: string[];
  files?: Omit<ChatTemplateFile, 'id' | 'templateId'>[];
}

export interface UpdateChatTemplateParams extends Partial<CreateChatTemplateParams> {}
```

---

## 4. API 設計 (API Design)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/chat-templates` | テンプレート一覧取得 |
| POST | `/api/chat-templates` | テンプレート作成 |
| GET | `/api/chat-templates/{id}` | テンプレート詳細取得（ファイル内容含む） |
| PATCH | `/api/chat-templates/{id}` | テンプレート更新 |
| DELETE | `/api/chat-templates/{id}` | テンプレート削除 |
| POST | `/api/chat-templates/{id}/apply` | テンプレート適用・ワークスペースへのファイルコピー |

### POST `/api/chat-templates/{id}/apply` の仕様
リクエストボディに `conversationId` を受け取る。
1. テンプレート情報を取得。
2. テンプレートに紐づく `chat_template_files` の内容を `workspaces/{conversationId}/` ディレクトリにコピーする。
3. 初期状態の設定情報（ウェルカムメッセージ、システムプロンプト、MCPサーバーリスト）をクライアントに返す。

---

## 5. 状態管理 (State Management)

`src/stores/chatTemplateStore.ts` を作成（Zustandを使用）。

- テンプレート一覧の取得・作成・更新・削除アクション。
- 現在選択されているチャットテンプレートのIDを保持（チャット作成時に適用するため）。

---

## 6. UI 設計 (UI Design)

### 1. テンプレート管理モーダル / ページ
- タスクテンプレートと同様に、チャットテンプレートの一覧表示、新規作成、編集、削除を行うUIを追加。
- コンテキストコンテンツのアップロードUI（ファイル選択）をフォームに含める。
- MCPサーバーの複数選択UI。

### 2. チャット開始時のテンプレート選択
- 新規チャット作成画面（またはサイドバーの「New Chat」ボタン横）に「テンプレートからチャットを作成」オプションを追加。
- テンプレートを選択してチャットを開始すると、システムプロンプトがセットされ、指定されたMCPが自動で有効化される。
- 初回レンダリング時（または適用API呼び出し直後）に、ウェルカムメッセージがアシスタントからのメッセージとして画面上に表示される。

---

## 7. 動作ロジック (Logic / Behavior)

1. **テンプレート作成**:
   - ユーザーがUIから設定とファイルをアップロードし保存。DBにレコードが作成される。
2. **テンプレートからチャット開始**:
   - UIでテンプレートを選択し、新規Conversationを作成。
   - `conversationId` を使って `/api/chat-templates/{template_id}/apply` を呼び出す。
   - API側で `workspaces/{conversationId}/` が作成され、DBからファイルが書き出される。
   - クライアント側でチャットの状態（Zustand）にシステムプロンプト、有効MCPサーバーを反映。
   - ウェルカムメッセージが存在する場合、アシスタントの最初のメッセージ（またはシステムメッセージ）として表示領域に挿入する。

---

## 8. 実装手順 (Implementation Steps)

1. **DBスキーマ追加**:
   - `src/lib/db.ts` の `initDatabase` に `chat_templates` と `chat_template_files` を追加。
   - DBアクセス関数 (`src/lib/chatTemplateDb.ts`) を実装。
2. **型定義**:
   - `src/types/chatTemplate.ts` を作成。
3. **APIエンドポイント作成**:
   - `app/api/chat-templates/route.ts`
   - `app/api/chat-templates/[id]/route.ts`
   - `app/api/chat-templates/[id]/apply/route.ts`（ワークスペースファイル操作ロジック含む）
4. **Zustandストア作成**:
   - `src/stores/chatTemplateStore.ts`
5. **UIコンポーネント実装**:
   - テンプレート管理UI (`ChatTemplateModal.tsx`)
   - 新規チャット画面のテンプレート選択ドロップダウン
   - ファイルアップロードコンポーネントの適用
6. **統合とテスト**:
   - テンプレート適用時にファイルがワークスペースに正しく配置されるか（`useWorkspaceFiles` 等で確認）。
   - ウェルカムメッセージやシステムプロンプト、MCPが想定通り設定されるかテスト。

---

## 9. 変更ファイル一覧 (Files to be modified/added)

**新規ファイル:**
- `docs/chat-template-design.md`
- `src/types/chatTemplate.ts`
- `src/lib/chatTemplateDb.ts`
- `src/stores/chatTemplateStore.ts`
- `app/api/chat-templates/route.ts`
- `app/api/chat-templates/[id]/route.ts`
- `app/api/chat-templates/[id]/apply/route.ts`
- `src/components/chat/ChatTemplateModal.tsx`

**既存ファイルの変更:**
- `src/lib/db.ts` (テーブル定義の追加)
- `src/components/layout/Sidebar.tsx` (テンプレート管理へのリンク追加)
- `src/components/chat/NewChatScreen.tsx` またはそれに相当するコンポーネント (テンプレート選択UIの追加)
- `src/hooks/useChat.ts` または `src/stores/chatStore.ts` (テンプレート適用ロジック、ウェルカムメッセージ挿入処理の追加)
