# タスクテンプレート機能 設計書

## 1. 概要・目的

### 背景

タスク作成時は毎回、タイトル・目的・完了条件・参加者（人間・LLMエージェント）を手動で入力する必要がある。
同じ構成のタスクを繰り返し作成する場合（例: 毎週の定例レビュー、特定の分析フロー）にユーザーの手間が大きい。

### タスクテンプレート機能とは

**タスクテンプレート**とは、タスク作成時の入力内容（タイトル・目的・完了条件・参加者構成）をあらかじめ保存しておき、再利用できる機能である。
ユーザーはテンプレートを選ぶだけで同じ構成のタスクをすぐに作成できる。

### 主要ユースケース

1. **定型タスクの繰り返し作成**: 同じ目的・参加者構成のタスクを何度も作成する場合に時間を節約する
2. **チーム内での標準フロー共有**: ユーザーが自分のベストプラクティスをテンプレートとして保存する
3. **LLMエージェント構成の保存**: よく使うエージェントの組み合わせ（プロバイダー・モデル・役割）を再利用する

### 設計方針

- 既存のタスク作成フロー（`TaskCreationModal`）を拡張し、テンプレート機能を追加する
- テンプレートはユーザーごとに管理し、他ユーザーのテンプレートは参照・利用できない
- テンプレートから作成したタスクは通常タスクと同じライフサイクルに従う
- 既存のDB・API・コンポーネントのパターンに準拠して実装する

---

## 2. データモデル設計

### 2.1 新規テーブル

#### `task_templates`

```sql
CREATE TABLE IF NOT EXISTS task_templates (
  id                   TEXT PRIMARY KEY,
  name                 TEXT NOT NULL,
  description          TEXT NOT NULL DEFAULT '',
  title                TEXT NOT NULL DEFAULT '',
  purpose              TEXT NOT NULL DEFAULT '',
  completion_condition TEXT NOT NULL DEFAULT '',
  created_by           TEXT NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
```

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT (UUID) | 主キー |
| `name` | TEXT | テンプレート名（必須） |
| `description` | TEXT | テンプレートの説明（任意） |
| `title` | TEXT | タスクタイトルの雛形 |
| `purpose` | TEXT | タスク目的の雛形 |
| `completion_condition` | TEXT | 完了条件の雛形 |
| `created_by` | TEXT | 作成者のユーザー名 |
| `created_at` | TEXT | 作成日時（ISO 8601） |
| `updated_at` | TEXT | 更新日時（ISO 8601） |

#### `task_template_participants`

```sql
CREATE TABLE IF NOT EXISTS task_template_participants (
  id               TEXT PRIMARY KEY,
  template_id      TEXT NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('human', 'llm')),
  username         TEXT,
  display_name     TEXT,
  agent_name       TEXT,
  agent_role       TEXT,
  provider         TEXT,
  model            TEXT,
  can_terminate    INTEGER NOT NULL DEFAULT 0
);
```

| カラム | 型 | 説明 |
|--------|-----|------|
| `id` | TEXT (UUID) | 主キー |
| `template_id` | TEXT | 親テンプレートID（CASCADE削除） |
| `participant_type` | TEXT | `'human'` または `'llm'` |
| `username` | TEXT | 人間参加者のユーザー名 |
| `display_name` | TEXT | 人間参加者の表示名 |
| `agent_name` | TEXT | LLMエージェント名 |
| `agent_role` | TEXT | LLMエージェントの役割説明 |
| `provider` | TEXT | LLMプロバイダー |
| `model` | TEXT | LLMモデルID |
| `can_terminate` | INTEGER | タスク終了権限（0/1） |

### 2.2 既存テーブルへの変更

変更なし。`task_templates` は独立したテーブルとして追加する。

---

## 3. TypeScript 型定義

### `src/types/taskTemplate.ts`（新規）

```typescript
export type TaskTemplateParticipantType = 'human' | 'llm';

export interface HumanTemplateParticipant {
  id: string;
  templateId: string;
  participantType: 'human';
  username: string;
  displayName: string;
  canTerminate: boolean;
}

export interface LlmTemplateParticipant {
  id: string;
  templateId: string;
  participantType: 'llm';
  agentName: string;
  agentRole: string;
  provider: string;
  model: string;
  canTerminate: false;
}

export type TaskTemplateParticipant =
  | HumanTemplateParticipant
  | LlmTemplateParticipant;

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  title: string;
  purpose: string;
  completionCondition: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  participants: TaskTemplateParticipant[];
}

// API リクエスト型
export interface CreateTaskTemplateParams {
  name: string;
  description?: string;
  title?: string;
  purpose?: string;
  completionCondition?: string;
  participants?: CreateTemplateParticipantParams[];
}

export type CreateTemplateParticipantParams =
  | {
      participantType: 'human';
      username: string;
      canTerminate?: boolean;
    }
  | {
      participantType: 'llm';
      agentName: string;
      agentRole: string;
      provider: string;
      model: string;
    };

export interface UpdateTaskTemplateParams {
  name?: string;
  description?: string;
  title?: string;
  purpose?: string;
  completionCondition?: string;
  participants?: CreateTemplateParticipantParams[];
}
```

---

## 4. API 設計

### エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/task-templates` | ユーザーのテンプレート一覧取得 |
| POST | `/api/task-templates` | テンプレート作成 |
| GET | `/api/task-templates/{id}` | テンプレート詳細取得 |
| PATCH | `/api/task-templates/{id}` | テンプレート更新（参加者含む全体置換） |
| DELETE | `/api/task-templates/{id}` | テンプレート削除 |
| POST | `/api/task-templates/{id}/apply` | テンプレートからタスクを作成 |

### 認証

全エンドポイントで `x-username` ヘッダー必須（既存タスク API と同じ方式）。

### 詳細仕様

#### `GET /api/task-templates`

```
Headers: x-username (必須)
Response: TaskTemplate[]  ※ participants 含む、作成者のテンプレートのみ返す
```

#### `POST /api/task-templates`

```
Headers: x-username (必須)
Body: CreateTaskTemplateParams
  - name: string (必須)
  - description?: string
  - title?: string
  - purpose?: string
  - completionCondition?: string
  - participants?: CreateTemplateParticipantParams[]

Response: TaskTemplate (201)
```

#### `GET /api/task-templates/{id}`

```
Headers: x-username (必須)
Response: TaskTemplate (participants 含む)
Error: 404 (存在しない or 他ユーザーのテンプレート)
```

#### `PATCH /api/task-templates/{id}`

```
Headers: x-username (必須、作成者のみ)
Body: UpdateTaskTemplateParams
  ※ participants を指定した場合、既存の参加者を全削除して再登録する（全体置換）
Response: TaskTemplate (更新後)
Error: 403 (他ユーザーのテンプレート)
```

#### `DELETE /api/task-templates/{id}`

```
Headers: x-username (必須、作成者のみ)
Response: 204
Error: 403 (他ユーザーのテンプレート)
```

#### `POST /api/task-templates/{id}/apply`

テンプレートの内容を使い、新しいタスクを作成して返す。

```
Headers: x-username (必須)
Body: ApplyTaskTemplateParams (任意でフィールドを上書き)
  - title?: string        ← 省略時はテンプレートの title を使用
  - purpose?: string
  - completionCondition?: string

Response: Task (既存の Task 型)
  ※ 内部で POST /api/tasks と POST /api/tasks/{id}/participants を呼び出す
  ※ テンプレートの参加者は自動的にタスクに追加される
  ※ リクエスト送信者は自動的に human 参加者として追加される（タスク作成と同じ挙動）
Error: 404 (テンプレートが存在しない or 他ユーザーのもの)
```

---

## 5. データベース実装

### `src/lib/taskTemplateDb.ts`（新規）

既存の `src/lib/taskDb.ts` と同じパターンで実装する。

```typescript
// テンプレート一覧取得（参加者含む）
export function listTemplatesForUser(username: string): TaskTemplate[]

// テンプレート詳細取得
export function getTemplate(id: string, username: string): TaskTemplate | null

// テンプレート作成（参加者も一括登録）
export function createTemplate(
  params: CreateTaskTemplateParams,
  username: string
): TaskTemplate

// テンプレート更新（参加者は全体置換）
export function updateTemplate(
  id: string,
  params: UpdateTaskTemplateParams,
  username: string
): TaskTemplate | null

// テンプレート削除
export function deleteTemplate(id: string, username: string): boolean

```

### `src/lib/db.ts` への追加

既存の `initDatabase()` 関数内に `task_templates` と `task_template_participants` の `CREATE TABLE IF NOT EXISTS` を追加する。

---

## 6. 状態管理

### `src/stores/taskTemplateStore.ts`（新規）

既存の `taskStore.ts` と同じパターンで Zustand を使用する。

```typescript
interface TaskTemplateStore {
  templates: TaskTemplate[];
  isLoading: boolean;

  // Actions
  loadTemplates: () => Promise<void>;
  createTemplate: (params: CreateTaskTemplateParams) => Promise<TaskTemplate>;
  updateTemplate: (id: string, params: UpdateTaskTemplateParams) => Promise<TaskTemplate>;
  deleteTemplate: (id: string) => Promise<void>;
  applyTemplate: (id: string, overrides?: { title?: string; purpose?: string; completionCondition?: string }) => Promise<Task>;
}
```

永続化（persist）は不要。テンプレートは API から都度取得する。

---

## 7. UI設計

### 7.1 テンプレート管理ページ（オプション）

`/app/task-templates/page.tsx`

- サイドバーに「テンプレート」リンクを追加（既存 `Sidebar.tsx` を更新）
- テンプレートの一覧表示・作成・編集・削除ができる管理画面
- カード形式でテンプレート名・説明・参加者数を表示
- 「このテンプレートでタスクを作成」ボタンで直接タスク作成へ遷移

### 7.2 TaskCreationModal の拡張（最優先）

既存の `src/components/task/TaskCreationModal.tsx` を拡張する。

**変更点:**

1. モーダル上部に「テンプレートから読み込む」ボタンを追加
2. ボタンクリックでテンプレート選択ドロップダウンを表示
3. テンプレート選択後、フォームの各フィールドにテンプレート値を自動入力
4. 自動入力後は通常通り編集可能（テンプレートはあくまで初期値）

**UI フロー:**

```
[タスク作成モーダル]
  ┌─────────────────────────────────────────┐
  │ テンプレートから読み込む ▼              │  ← テンプレート選択ドロップダウン
  ├─────────────────────────────────────────┤
  │ タイトル: [___________]                 │  ← テンプレートで自動入力
  │ 目的:     [___________]                 │
  │ 完了条件: [___________]                 │
  │ 参加者:   [___________]                 │  ← テンプレートの参加者を自動追加
  └─────────────────────────────────────────┘
```

### 7.3 テンプレート作成・編集モーダル

`src/components/task/TaskTemplateModal.tsx`（新規）

タスク作成モーダルとほぼ同じフォーム構成に、以下を追加する：

- **テンプレート名**（必須）: テキスト入力
- **説明**（任意）: テキストエリア

フォーム項目（タスク作成と共通）:
- タイトル（雛形）
- 目的（雛形）
- 完了条件（雛形）
- 参加者（人間・LLMエージェント）

**「現在のタスクからテンプレートを保存」ボタン（オプション）:**

タスク詳細ページ（`/app/tasks/[id]/page.tsx`）にボタンを追加し、現在のタスクの内容・参加者構成をテンプレートとして保存できる。

---

## 8. 実装手順

以下の順序で実装する。

### Step 1: DB スキーマ追加

1. `src/lib/db.ts` の `initDatabase()` に2つのテーブル定義を追加

### Step 2: DB ユーティリティ実装

1. `src/types/taskTemplate.ts` を新規作成
2. `src/lib/taskTemplateDb.ts` を新規作成

### Step 3: API ルート実装

1. `app/api/task-templates/route.ts`（GET・POST）
2. `app/api/task-templates/[id]/route.ts`（GET・PATCH・DELETE）
3. `app/api/task-templates/[id]/apply/route.ts`（POST）

### Step 4: 状態管理

1. `src/stores/taskTemplateStore.ts` を新規作成

### Step 5: UIコンポーネント実装

1. `src/components/task/TaskTemplateModal.tsx` を新規作成（テンプレート作成・編集）
2. `src/components/task/TaskCreationModal.tsx` を拡張（テンプレート読み込みボタン追加）
3. `src/components/layout/Sidebar.tsx` を更新（テンプレートリンク追加）
4. `app/task-templates/page.tsx` を新規作成（テンプレート管理ページ）

### Step 6: テスト・動作確認

1. テンプレートの CRUD 操作
2. テンプレートからのタスク作成（参加者が正しく引き継がれるか）
3. 他ユーザーのテンプレートにアクセスできないことの確認
4. テンプレート削除時に関連参加者がCASCADE削除されることの確認

---

## 9. 考慮事項・制約

### セキュリティ

- テンプレートは `created_by` に一致するユーザーのみ参照・更新・削除できる
- API レベルで `x-username` と `created_by` の一致チェックを行う
- `task_template_participants` の `username` は `apply` 時に `users.yaml` で検証する（存在しないユーザーはスキップまたはエラー）

### データ整合性

- テンプレートに保存した人間参加者のユーザーが `users.yaml` から削除された場合、テンプレート自体は残るが `apply` 時にその参加者は無視する
- `task_template_participants` は `template_id` に CASCADE DELETE を設定するため、テンプレート削除で参加者も自動削除される

### スコープ外（将来検討）

- テンプレートの共有（他ユーザーへの公開）
- テンプレートのインポート・エクスポート（JSON）
- テンプレートのバージョン管理
- 使用回数・最終使用日時の記録

---

## 10. ファイル変更一覧

### 新規作成

| ファイル | 説明 |
|---------|------|
| `src/types/taskTemplate.ts` | TypeScript 型定義 |
| `src/lib/taskTemplateDb.ts` | DB ユーティリティ |
| `src/stores/taskTemplateStore.ts` | Zustand ストア |
| `src/components/task/TaskTemplateModal.tsx` | テンプレート作成・編集モーダル |
| `app/api/task-templates/route.ts` | テンプレート一覧・作成 API |
| `app/api/task-templates/[id]/route.ts` | テンプレート詳細・更新・削除 API |
| `app/api/task-templates/[id]/apply/route.ts` | テンプレート適用 API |
| `app/task-templates/page.tsx` | テンプレート管理ページ |

### 既存ファイルの変更

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/db.ts` | `initDatabase()` にテーブル定義を追加 |
| `src/components/task/TaskCreationModal.tsx` | テンプレート読み込みボタン・ロジックを追加 |
| `src/components/layout/Sidebar.tsx` | テンプレートへのナビゲーションリンクを追加 |
