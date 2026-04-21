# タスク機能 設計書

## 1. 概要・目的

### 背景

既存のチャット機能は「1ユーザー対1つのLLM」という1対1モデルを前提としている。
業務上のユースケースでは、複数の人間とLLMエージェントが協力して特定の目標（タスク）を達成する場面が存在する。

### タスク機能とは

**タスク**とは、明確な目的・完了条件を持つ専用チャットルームである。
通常の会話との主な違いを以下に示す。

| 項目 | 通常の会話 | タスク |
|------|-----------|--------|
| 参加者 | 1ユーザー + LLM | 複数ユーザー + 複数LLMエージェント |
| 目的 | 自由 | 開始者が明示的に定義 |
| 完了条件 | なし | 開始者が定義（権限付与で他者も終了可能） |
| 宛先指定 | なし | @メンションで特定参加者に送信 |
| システムプロンプト | ユーザー設定に依存 | タスク目的・完了条件から自動生成 |
| 終了 | いつでも削除可能 | 終了権限を持つ参加者のみ終了可能 |

### 主要ユースケース

1. **人間 × LLM 協業**: 複数ユーザーが異なる役割のLLMエージェントと共同作業する
2. **人間 × 人間 + LLM支援**: 人間同士の議論にLLMがファシリテーターやアドバイザーとして参加する
3. **ロールプレイ型ディスカッション**: 複数のLLMエージェントが異なる立場で議論し、人間が判断する

### 設計方針

- **既存アーキテクチャの延長**: 現行のNext.js + SQLite + SSE構成を最大限活用する
- **段階的実装**: フェーズ分割し、コア機能から順に実装する
- **権限の明確化**: タスクの開始・終了・参加者管理の権限を明示的に定義する

---

## 2. タスクライフサイクル（状態遷移）

### タスクの状態

タスクは以下の4つの状態を持つ。

| 状態 | 値 | 説明 |
|------|----|------|
| 準備中 | `draft` | 開始者が参加者・目的を設定している段階。メッセージ送信不可 |
| 進行中 | `active` | 参加者全員がメッセージを送受信できる状態 |
| 完了 | `completed` | 完了条件を満たし正常終了した状態 |
| キャンセル | `cancelled` | 目的未達のまま中断された状態 |

### 状態遷移図

```
                    ┌─────────────────┐
                    │   draft（準備中）  │
                    └────────┬────────┘
                             │ 開始者が「タスク開始」を実行
                             ▼
                    ┌─────────────────┐
                    │  active（進行中）  │◄──── メッセージ送受信
                    └────────┬────────┘
                    ┌────────┴────────┐
                    │                 │
    終了権限を持つ参加者が        終了権限を持つ参加者が
    「完了」を実行               「キャンセル」を実行
                    │                 │
                    ▼                 ▼
           ┌──────────────┐  ┌──────────────────┐
           │   completed   │  │    cancelled     │
           │   （完了）     │  │  （キャンセル）    │
           └──────────────┘  └──────────────────┘
```

> `completed` / `cancelled` からの再開はサポートしない。終了後は読み取り専用となる。

### 操作権限マトリクス

| 操作 | 開始者 | 終了権限付与済みユーザー | 一般参加者（人間） | LLMエージェント |
|------|:------:|:--------------------:|:---------------:|:--------------:|
| タスク開始（draft→active） | ✅ | ❌ | ❌ | ❌ |
| 参加者の追加・削除 | ✅ | ❌ | ❌ | ❌ |
| 終了権限の付与・剥奪 | ✅ | ❌ | ❌ | ❌ |
| メッセージ送信 | ✅ | ✅ | ✅ | ✅（呼ばれた時） |
| タスク完了（active→completed） | ✅ | ✅ | ❌ | ❌ |
| タスクキャンセル（active→cancelled） | ✅ | ✅ | ❌ | ❌ |
| タスク削除 | ✅ | ❌ | ❌ | ❌ |

### draft フェーズの設定項目

開始者は `active` に移行する前に以下を設定する。

```
必須:
  - タスクタイトル
  - タスクの目的（purpose）
  - 完了条件（completion_condition）
  - 参加者（1名以上）

任意:
  - 終了権限の付与先ユーザー
```

参加者が0名、または目的・完了条件が未入力の場合は `active` への遷移をブロックする。

---

## 3. 参加者モデル

### 参加者の種別

タスクには2種別の参加者が存在する。

| 種別 | `participant_type` | 実体 | 宛先指定 |
|------|--------------------|------|---------|
| 人間ユーザー | `human` | `users.yaml` に登録済みの認証ユーザー | `@username` |
| LLMエージェント | `llm` | タスク内で定義された仮想エージェント | `@エージェント名` |

### 人間ユーザー参加者

- `users.yaml` に存在する `username` を指定して追加する
- 開始者自身は自動的に参加者として登録される（削除不可）
- タスク参加の通知手段は本設計のスコープ外とする（ポーリングで検知）

```typescript
interface HumanParticipant {
  participantType: 'human';
  username: string;        // users.yaml の username
  displayName: string;     // users.yaml の displayName
  canTerminate: boolean;   // 終了権限
}
```

### LLMエージェント参加者

開始者がタスク作成時に定義する仮想エージェント。
既存の `Settings.provider` / `Settings.model` と同様の設定値を持つ。

```typescript
interface LlmParticipant {
  participantType: 'llm';
  agentName: string;       // タスク内での呼び名（@メンションに使用）
  agentRole: string;       // このエージェントの役割説明（システムプロンプトに反映）
  provider: string;        // 'anthropic' | 'gemini' | 'bedrock'
  model: string;           // モデルID
  canTerminate: false;     // LLMは終了権限を持たない（固定）
}
```

### エージェント名の制約

`@メンション` での識別に使用するため、エージェント名に以下の制約を設ける。

- 半角英数字・ハイフン・アンダースコアのみ使用可（スペース不可）
- タスク内で一意であること
- `username` との重複不可（人間ユーザーと混同を防ぐ）
- 最大32文字

### 参加者の統合ビュー

UIおよびロジックでは両種別を統一的に扱うため、共通の型を定義する。

```typescript
type TaskParticipant = HumanParticipant | LlmParticipant;

interface TaskParticipantBase {
  id: string;
  taskId: string;
  participantType: 'human' | 'llm';
  canTerminate: boolean;
  joinedAt: Date;
}
```

### 参加者数の制限

| 種別 | 最小 | 最大 |
|------|:----:|:----:|
| 人間ユーザー | 1（開始者のみ可） | 20 |
| LLMエージェント | 0 | 5 |
| 合計 | 1 | 25 |

> LLMエージェントの上限はAPI同時呼び出しコストを考慮した値。将来的に設定可能にする。

---

## 4. データモデル（DBスキーマ）

### 既存テーブルとの関係

既存の `conversations` / `messages` テーブルはそのまま維持し、タスク専用テーブルを追加する。
タスクメッセージは既存の `messages` テーブルとは**独立したテーブル**で管理する。

```
既存:
  conversations ─┐
  messages ───────┘  （通常チャット用。変更なし）

追加:
  tasks ──────────────────────┐
  task_participants ───────────┤  （タスク機能用）
  task_messages ───────────────┘
```

### `tasks` テーブル

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL DEFAULT '新しいタスク',
  purpose              TEXT NOT NULL DEFAULT '',   -- タスクの目的
  completion_condition TEXT NOT NULL DEFAULT '',   -- 完了条件
  status               TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  created_by           TEXT NOT NULL,              -- 開始者の username
  system_prompt        TEXT NOT NULL DEFAULT '',   -- purpose/condition から生成したプロンプト
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### `task_participants` テーブル

```sql
CREATE TABLE IF NOT EXISTS task_participants (
  id               TEXT PRIMARY KEY,
  task_id          TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  participant_type TEXT NOT NULL CHECK (participant_type IN ('human', 'llm')),

  -- human のみ使用
  username         TEXT,
  display_name     TEXT,

  -- llm のみ使用
  agent_name       TEXT,
  agent_role       TEXT,
  provider         TEXT,
  model            TEXT,

  can_terminate    INTEGER NOT NULL DEFAULT 0,  -- BOOLEAN (0/1)
  joined_at        TEXT NOT NULL DEFAULT (datetime('now')),

  -- human: username が task 内で一意
  -- llm:   agent_name が task 内で一意
  UNIQUE (task_id, username),
  UNIQUE (task_id, agent_name)
);

CREATE INDEX IF NOT EXISTS idx_task_participants_task
  ON task_participants(task_id);
```

### `task_messages` テーブル

```sql
CREATE TABLE IF NOT EXISTS task_messages (
  id               TEXT PRIMARY KEY,
  task_id          TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sender_type      TEXT NOT NULL CHECK (sender_type IN ('human', 'llm', 'system')),
  sender_name      TEXT NOT NULL,   -- username または agent_name。system メッセージは 'system'
  to_name          TEXT,            -- @メンション先の username/agent_name。NULL = 全体送信
  content          TEXT NOT NULL DEFAULT '',
  timestamp        TEXT NOT NULL DEFAULT (datetime('now')),
  sort_order       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_task_messages_task
  ON task_messages(task_id, sort_order);
```

### `system` メッセージ

タスクの状態変化（開始・完了・参加者追加など）をチャット上に表示するため、
`sender_type = 'system'` のメッセージを使用する。

| イベント | 表示例 |
|---------|--------|
| タスク開始 | 「タスクを開始しました」 |
| 参加者追加 | 「@alice が参加しました」 |
| タスク完了 | 「@bob がタスクを完了しました」 |
| タスクキャンセル | 「@carol がタスクをキャンセルしました」 |

### データの整合性ルール

- `tasks.created_by` は `task_participants` に `can_terminate = 1` で必ず存在する
- `task_participants.username` / `agent_name` はどちらか一方のみ非NULL（`participant_type` に対応）
- `task_messages.to_name` が非NULLの場合、同タスクの `task_participants` に存在する名前であること（アプリ層で検証）

---

## 5. @メンションルーティング

### 基本仕様

メッセージ本文の先頭または任意の位置に `@名前` を記述することで宛先を指定する。

| パターン | 例 | 動作 |
|---------|-----|------|
| 宛先なし | `進捗を共有します` | 全参加者への全体送信 |
| 単一宛先 | `@alice レビューお願いします` | alice にのみ送信 |
| 複数宛先 | `@alice @reviewer 確認してください` | alice と reviewer の両方に送信 |

> 全体送信と宛先指定は排他。宛先を1つでも指定した場合は指定した参加者のみに届く。

### メンションの解析ルール

```
正規表現: /@([a-zA-Z0-9_-]+)/g

1. メッセージ本文からすべての @名前 を抽出する
2. 抽出した名前をタスク参加者リストと照合する
3. 一致した参加者を「宛先リスト」とする
4. 一致しない @名前 はメンションとして扱わず本文の一部として残す
5. 宛先リストが空（一致なし）の場合は全体送信とする
```

### LLMエージェントの呼び出しトリガー

宛先リストに LLM エージェントが含まれる場合、そのエージェントへの応答生成を開始する。
複数の LLM エージェントが宛先に含まれる場合は**順次**実行する（並列実行はしない）。

```
ユーザーが送信
    ↓
@メンション解析
    ├─ 宛先に human のみ → DB保存 → SSE配信のみ
    ├─ 宛先に llm を含む → DB保存 → SSE配信 → LLM呼び出し（順次）
    └─ 宛先なし（全体送信） → DB保存 → SSE配信
                               ※ LLMは呼ばれていないので応答しない
```

> 全体送信では LLM は自動応答しない。LLM に応答させるには `@エージェント名` で明示的に呼ぶ必要がある。

### LLMへ渡すコンテキスト

LLM エージェントが応答を生成する際、以下の情報をコンテキストとして渡す。

```
[システムプロンプト]
  タスク目的・完了条件・エージェントの役割（セクション6で詳述）

[会話履歴]
  task_messages を時系列順に変換
  - human メッセージ → role: "user"
  - llm メッセージ   → role: "assistant"（送信者が自分なら）/ role: "user"（他エージェントなら）
  - system メッセージ → 省略

[今回のメッセージ]
  宛先指定されたメッセージ本文（@メンション部分はそのまま含める）
```

### メッセージの可視性

`to_name` の値によってメッセージの表示範囲を制御する。

| `to_name` の値 | 表示対象 |
|---------------|---------|
| `NULL` | 全参加者 |
| 特定の名前（単一） | 送信者・受信者・開始者 |
| 複数名（カンマ区切りで保存） | 送信者・全受信者・開始者 |

> 開始者は常に全メッセージを閲覧できる（監査目的）。

---

## 6. LLMエージェント統合

### 既存 LLMProvider との関係

既存の `LLMProvider` インターフェース（`src/lib/llm-provider.ts`）と `getProvider()` ファクトリをそのまま利用する。
タスク用に新たなプロバイダー実装は不要。

```
既存: getProvider(provider) → LLMProvider
         ↓ streamChat({ systemPrompt, messages, model })
タスク: エージェント設定から同インターフェースで呼び出す
```

### システムプロンプトの生成

タスク開始時（`draft` → `active`）に、タスク情報とエージェント設定からシステムプロンプトを生成し `tasks.system_prompt` に保存する。各エージェントへのシステムプロンプトはエージェントごとに個別に生成する。

```
## タスク概要
{purpose}

## 完了条件
{completion_condition}

## あなたの役割
{agentRole}

## 参加者一覧
{参加者の名前と種別のリスト}

## 行動規則
- メッセージには @名前 で宛先を指定してください
- 宛先を指定しない場合は全参加者への発言になります
- タスクの完了条件を意識して会話を進めてください
```

### 会話履歴の変換

LLM 呼び出し時、`task_messages` を `ChatMessage[]` に変換する。
LLM の視点では「自分の発言 = assistant、それ以外 = user」として扱う。

```typescript
function buildMessagesForAgent(
  messages: TaskMessage[],
  agentName: string,
): ChatMessage[] {
  return messages
    .filter(m => m.senderType !== 'system')
    .map(m => ({
      role: m.senderName === agentName ? 'assistant' : 'user',
      content: formatMessageContent(m),
    }));
}

// メッセージ本文に送信者名を付与して文脈を明確にする
function formatMessageContent(m: TaskMessage): string {
  const prefix = `[${m.senderName}${m.toName ? ` → @${m.toName}` : ''}] `;
  return prefix + m.content;
}
```

### LLM応答のストリーミング

既存の `/api/chat` エンドポイントとは別に、タスク専用の `/api/tasks/[id]/chat` エンドポイントを設ける。
応答は SSE でストリーミングし、完了後に `task_messages` へ保存する。

```
POST /api/tasks/[id]/chat
  ↓
対象エージェントの設定を取得
  ↓
会話履歴 + システムプロンプトを構築
  ↓
getProvider(agent.provider).streamChat(...)
  ↓
SSE ストリーム（既存の StreamChunk 形式を流用）
  ↓
完了後: task_messages に保存 → 全参加者に SSE 通知
```

### 複数エージェントの順次呼び出し

1つのメッセージで複数の LLM エージェントが宛先に含まれる場合、**登録順に順次**呼び出す。
前のエージェントの応答が DB に保存されてから次のエージェントを呼び出す（応答が会話履歴に積まれるため）。

```
@agentA @agentB メッセージ
  ↓
agentA を呼び出し → 応答を保存
  ↓
agentB を呼び出し（agentA の応答も履歴に含む）→ 応答を保存
```

### ツール使用（Tool Use）

タスク内の LLM エージェントは既存の `tool-registry.ts` に登録されたツールをそのまま利用できる。
ツール呼び出しループの実装は既存の `useChat.ts` のロジックを参考にサーバーサイドで実装する。

---

## 7. リアルタイム通信設計

### 方式の選定

現行アーキテクチャは LLM ストリーミングに SSE（Server-Sent Events）を使用している。
タスクの多人数リアルタイム通信も、**既存の SSE 基盤を拡張**して実現する。
WebSocket は導入コストが高く、Next.js App Router との相性も考慮して採用しない。

| 方式 | メリット | デメリット | 採用 |
|------|---------|-----------|:----:|
| SSE（ポーリング拡張） | 既存資産を活用、実装シンプル | 単方向（サーバー→クライアント） | ✅ |
| WebSocket | 双方向、低レイテンシ | 導入コスト高、Next.js との統合が複雑 | ❌ |
| ロングポーリング | 実装シンプル | 効率が悪い、スケールしない | ❌ |

### SSEエンドポイント

各参加者のブラウザは以下のエンドポイントに SSE 接続を維持する。

```
GET /api/tasks/[id]/stream
  Authorization: セッショントークン（Cookie）

レスポンス: text/event-stream
```

サーバーサイドでは接続中のクライアントを**インメモリのマップ**で管理する。

```typescript
// src/lib/taskEventBus.ts
type Subscriber = (event: TaskEvent) => void;

const subscribers = new Map<string, Set<Subscriber>>();
//                          taskId    クライアントごとのコールバック

export function subscribe(taskId: string, cb: Subscriber): () => void { ... }
export function publish(taskId: string, event: TaskEvent): void { ... }
```

> SQLite は単一プロセスで動作するため、インメモリのイベントバスで十分。
> 複数プロセス・複数サーバーへのスケールアウトは本設計のスコープ外とする。

### TaskEvent の型定義

SSE で流すイベントの種別を以下のように定義する。

```typescript
type TaskEvent =
  | { type: 'message';     message: TaskMessage }      // 新着メッセージ
  | { type: 'streaming';   agentName: string; chunk: string }  // LLM ストリーミング中
  | { type: 'stream_end';  agentName: string; messageId: string } // LLM 応答完了
  | { type: 'participant_joined'; participant: TaskParticipant }
  | { type: 'participant_left';   participantName: string }
  | { type: 'status_changed';    status: TaskStatus }  // タスク状態変化
```

SSE のフォーマットは既存の `/api/chat` と同じ `data: {JSON}\n\n` 形式を踏襲する。

### メッセージ送信〜配信のシーケンス

```
クライアント（送信者）          サーバー               クライアント（受信者）
       │                         │                          │
       │  POST /api/tasks/[id]/messages                     │
       │─────────────────────────►│                          │
       │                         │ DB 保存                  │
       │                         │ publish(taskId, event)   │
       │                         │──────────────────────────►│ SSE: { type: 'message', ... }
       │  200 OK                 │                          │
       │◄─────────────────────────│                          │
       │                         │                          │
       │  （宛先に LLM が含まれる場合）                        │
       │                         │ LLM API 呼び出し開始     │
       │                         │──────────────────────────►│ SSE: { type: 'streaming', ... }
       │                         │  （チャンクごとに配信）    │
       │                         │ LLM 応答完了 → DB 保存   │
       │                         │──────────────────────────►│ SSE: { type: 'stream_end', ... }
```

### 接続断・再接続

- SSE 接続が切れた場合、クライアントは**3秒後に自動再接続**する
- 再接続時は `?since={lastMessageId}` を付与し、未受信メッセージを取得する
- サーバー側は再接続時に `since` 以降のメッセージを一括送信してから SSE ストリームに切り替える

```
GET /api/tasks/[id]/stream?since=msg_abc123
```

---

## 8. API設計

既存の `/api/conversations` と同じ構造で、タスク専用のエンドポイント群を追加する。
すべてのエンドポイントで `export const runtime = 'nodejs'` を指定し、SQLite を利用可能にする。

### エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/tasks` | 自分が参加しているタスク一覧 |
| `POST` | `/api/tasks` | タスクを新規作成（draft 状態） |
| `GET` | `/api/tasks/[id]` | タスク詳細（参加者・メッセージ含む） |
| `PATCH` | `/api/tasks/[id]` | タスク情報の更新（タイトル・目的・状態変更） |
| `DELETE` | `/api/tasks/[id]` | タスク削除（開始者のみ） |
| `GET` | `/api/tasks/[id]/participants` | 参加者一覧 |
| `POST` | `/api/tasks/[id]/participants` | 参加者を追加 |
| `DELETE` | `/api/tasks/[id]/participants/[pid]` | 参加者を削除 |
| `GET` | `/api/tasks/[id]/messages` | メッセージ一覧（ページング対応） |
| `POST` | `/api/tasks/[id]/messages` | メッセージを送信 |
| `POST` | `/api/tasks/[id]/chat` | LLM エージェントへの応答要求（SSE） |
| `GET` | `/api/tasks/[id]/stream` | リアルタイム SSE ストリーム |

### 各エンドポイント詳細

#### `POST /api/tasks` — タスク作成

```typescript
// リクエスト
{
  title: string;
  purpose: string;
  completionCondition: string;
}

// レスポンス 201
{
  id: string;
  title: string;
  purpose: string;
  completionCondition: string;
  status: 'draft';
  createdBy: string;  // セッションから取得
  createdAt: string;
  updatedAt: string;
}
```

#### `PATCH /api/tasks/[id]` — タスク更新・状態遷移

```typescript
// リクエスト（すべてオプション。status 変更が状態遷移を意味する）
{
  title?: string;
  purpose?: string;
  completionCondition?: string;
  status?: 'active' | 'completed' | 'cancelled';
}

// エラーケース
// 403: 権限なし（status 変更は開始者 or 終了権限者のみ）
// 409: 無効な状態遷移（例: completed → active）
```

#### `POST /api/tasks/[id]/participants` — 参加者追加

```typescript
// リクエスト（human の場合）
{
  participantType: 'human';
  username: string;
  canTerminate?: boolean;  // デフォルト false
}

// リクエスト（llm の場合）
{
  participantType: 'llm';
  agentName: string;
  agentRole: string;
  provider: string;
  model: string;
}

// レスポンス 201: 追加された参加者オブジェクト
// エラーケース
// 400: agentName が不正（使用不可文字、重複など）
// 404: username が users.yaml に存在しない
// 409: すでに参加している
```

#### `POST /api/tasks/[id]/messages` — メッセージ送信

```typescript
// リクエスト
{
  content: string;       // @メンションを含む本文
}

// レスポンス 201
{
  id: string;
  senderType: 'human';
  senderName: string;
  toName: string | null;
  content: string;
  timestamp: string;
}
// @メンションの解析・LLM 呼び出しトリガーはサーバー側で処理
```

#### `POST /api/tasks/[id]/chat` — LLM応答（SSE）

```typescript
// リクエスト
{
  agentName: string;     // 応答させるエージェント名
  triggerMessageId: string;  // トリガーとなったメッセージID
}

// レスポンス: text/event-stream（StreamChunk 形式）
// 完了後に task_messages へ保存し、stream エンドポイント経由で全員に配信
```

### 認証・認可の実装方針

- すべてのエンドポイントでリクエストヘッダーのセッショントークンを検証する
- 認可チェックは各ルートハンドラーの先頭で実施し、失敗時は即座に `403` を返す
- 既存の `demoAuth.ts` のセッション検証関数を共通ユーティリティとして切り出して利用する

---

## 9. フロントエンド設計

### ルーティング

Next.js App Router に以下のページを追加する。既存の通常チャット（`/`）とは独立したルートとする。

```
app/
├── page.tsx              （既存: 通常チャット）
└── tasks/
    ├── page.tsx          （タスク一覧）
    └── [id]/
        └── page.tsx      （タスクルーム）
```

`Sidebar` に「タスク」セクションを追加し、タスク一覧と通常チャット一覧を切り替え表示できるようにする。

### 新規コンポーネント構成

```
src/components/
├── task/
│   ├── TaskCreationModal.tsx      タスク作成ダイアログ
│   ├── TaskRoomLayout.tsx         タスクルームの3ペインレイアウト
│   ├── TaskMessageList.tsx        タスクメッセージ一覧
│   ├── TaskMessageItem.tsx        個別メッセージ（送信者バッジ付き）
│   ├── TaskInputArea.tsx          @メンション補完付き入力欄
│   ├── TaskParticipantPanel.tsx   参加者パネル（右サイドバー）
│   ├── TaskStatusBadge.tsx        タスク状態バッジ（draft/active/...）
│   └── TaskParticipantForm.tsx    参加者追加フォーム
```

### Zustand ストア: `taskStore.ts`

```typescript
interface TaskStore {
  // State
  tasks: Task[];
  activeTaskId: string | null;
  activeTask: Task | null;
  taskMessages: Record<string, TaskMessage[]>;  // taskId → messages
  streamingAgents: Record<string, string>;       // agentName → 蓄積中テキスト

  // Actions
  loadTasks(): Promise<void>;
  loadTaskMessages(taskId: string): Promise<void>;
  createTask(params: CreateTaskParams): Promise<string>;
  updateTaskStatus(taskId: string, status: TaskStatus): Promise<void>;
  addParticipant(taskId: string, params: AddParticipantParams): Promise<void>;
  sendMessage(taskId: string, content: string): Promise<void>;

  // SSE ハンドラ
  handleTaskEvent(taskId: string, event: TaskEvent): void;
}
```

永続化は行わない（`partialize` でストアから除外）。ページ遷移のたびにサーバーから取得する。

### SSE 接続管理: `useTaskStream` フック

タスクルームのマウント時に SSE 接続を開始し、アンマウント時に切断するカスタムフック。

```typescript
// src/hooks/useTaskStream.ts
export function useTaskStream(taskId: string) {
  const { handleTaskEvent } = useTaskStore();

  useEffect(() => {
    let eventSource: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect(since?: string) {
      const url = `/api/tasks/${taskId}/stream${since ? `?since=${since}` : ''}`;
      eventSource = new EventSource(url);

      eventSource.onmessage = (e) => {
        const event = JSON.parse(e.data) as TaskEvent;
        handleTaskEvent(taskId, event);
      };

      eventSource.onerror = () => {
        eventSource.close();
        retryTimeout = setTimeout(() => connect(getLastMessageId()), 3000);
      };
    }

    connect();
    return () => { eventSource.close(); clearTimeout(retryTimeout); };
  }, [taskId]);
}
```

### TaskInputArea: @メンション補完

メッセージ入力欄では `@` 入力時に参加者名のインライン補完を表示する。

```
動作:
1. 入力中に @ を検出したら候補リストをポップアップ表示
2. 候補は現在のタスク参加者（human / llm）
3. キーボード（↑↓Enter）またはクリックで選択・補完
4. 補完後はカーソルを @名前 の直後に移動
5. 複数の @メンション を連続して入力可能
```

### TaskMessageItem: 送信者の視覚的区別

| 送信者種別 | 表示スタイル |
|-----------|------------|
| 自分（human） | 右寄せ・青背景（既存チャットと同様） |
| 他の human | 左寄せ・グレー背景 + アバター（イニシャル） |
| llm エージェント | 左寄せ・紫背景 + ロボットアイコン |
| system | 中央揃え・小テキスト・区切り線スタイル |

宛先が限定メッセージ（`toName` が非NULL）の場合は `→ @名前` バッジを送信者名の横に表示する。

### タスク作成フロー（UI）

```
1. Sidebar の「+ 新規タスク」ボタン
    ↓
2. TaskCreationModal が開く
    - タイトル入力
    - 目的（purpose）入力
    - 完了条件（completionCondition）入力
    - 参加者追加（human: username 入力 / llm: 名前・役割・モデル設定）
    - 終了権限の付与先チェックボックス
    ↓
3. 「タスクを作成」→ POST /api/tasks → POST /api/tasks/[id]/participants（複数）
    ↓
4. draft 状態で /tasks/[id] に遷移
    ↓
5. ヘッダーの「タスク開始」ボタン → PATCH /api/tasks/[id] { status: 'active' }
    ↓
6. active 状態でチャット開始
```

---

## 10. 実装フェーズ

全体を4フェーズに分割し、各フェーズで動作確認できる状態を維持しながら段階的に実装する。

### フェーズ1: データ基盤とタスクCRUD

**目標**: タスクの作成・取得・状態遷移がAPIレベルで動作する

| # | 作業内容 | 対象ファイル |
|---|---------|------------|
| 1 | DBスキーマ追加（tasks / task_participants / task_messages） | `src/lib/db.ts` |
| 2 | タスク用DBクエリ関数の実装 | `src/lib/taskDb.ts`（新規） |
| 3 | `/api/tasks` GET / POST | `app/api/tasks/route.ts` |
| 4 | `/api/tasks/[id]` GET / PATCH / DELETE | `app/api/tasks/[id]/route.ts` |
| 5 | `/api/tasks/[id]/participants` GET / POST / DELETE | `app/api/tasks/[id]/participants/[pid]/route.ts` |
| 6 | タスク型定義の追加 | `src/types/task.ts`（新規） |

**完了条件**: curl でタスクの作成・参加者追加・状態遷移が確認できる

---

### フェーズ2: メッセージ送受信とリアルタイム通信

**目標**: 複数ブラウザタブ間でメッセージがリアルタイムに同期される

| # | 作業内容 | 対象ファイル |
|---|---------|------------|
| 1 | TaskEventBus の実装 | `src/lib/taskEventBus.ts`（新規） |
| 2 | `/api/tasks/[id]/stream` SSEエンドポイント | `app/api/tasks/[id]/stream/route.ts` |
| 3 | `/api/tasks/[id]/messages` POST（@メンション解析含む） | `app/api/tasks/[id]/messages/route.ts` |
| 4 | `useTaskStream` フックの実装 | `src/hooks/useTaskStream.ts`（新規） |
| 5 | `taskStore.ts` の実装 | `src/stores/taskStore.ts`（新規） |

**完了条件**: 2タブ開いた状態でメッセージが双方に即時反映される

---

### フェーズ3: LLMエージェント統合

**目標**: @メンションで LLM エージェントが応答する

| # | 作業内容 | 対象ファイル |
|---|---------|------------|
| 1 | システムプロンプト生成ロジック | `src/lib/taskSystemPrompt.ts`（新規） |
| 2 | 会話履歴の変換ロジック（TaskMessage → ChatMessage） | `src/lib/taskMessageAdapter.ts`（新規） |
| 3 | `/api/tasks/[id]/chat` SSEエンドポイント | `app/api/tasks/[id]/chat/route.ts` |
| 4 | メッセージ送信時のLLM呼び出しトリガー（POST messages 内） | `app/api/tasks/[id]/messages/route.ts` |
| 5 | 複数エージェント順次呼び出しの実装 | 同上 |

**完了条件**: `@agentName` メッセージに対してエージェントが応答し全参加者に配信される

---

### フェーズ4: フロントエンドUI

**目標**: ブラウザ上でタスクの作成から完了までの全操作が可能になる

| # | 作業内容 | 対象ファイル |
|---|---------|------------|
| 1 | タスク型のクライアント定義 | `src/types/task.ts` に追記 |
| 2 | `TaskCreationModal` | `src/components/task/TaskCreationModal.tsx` |
| 3 | `TaskRoomLayout` / `TaskParticipantPanel` | `src/components/task/` |
| 4 | `TaskMessageList` / `TaskMessageItem` | `src/components/task/` |
| 5 | `TaskInputArea`（@補完付き） | `src/components/task/TaskInputArea.tsx` |
| 6 | タスク一覧ページ | `app/tasks/page.tsx` |
| 7 | タスクルームページ | `app/tasks/[id]/page.tsx` |
| 8 | Sidebar へのタスクセクション追加 | `src/components/layout/Sidebar.tsx` |

**完了条件**: ブラウザのみで「タスク作成 → 参加者追加 → メッセージ送受信 → LLM応答 → タスク完了」の一連操作が完結する

---

### 依存関係と実装順序

```
フェーズ1（DB・API）
    ↓
フェーズ2（SSE・メッセージ）
    ↓
フェーズ3（LLM統合）   ←─ フェーズ2完了後に並行実施可能
フェーズ4（フロントエンド）←┘
```

フェーズ3とフェーズ4はフェーズ2完了後であれば並行作業が可能。
フェーズ4の開発中は `curl` でAPIを直接叩いてバックエンドの動作を確認しながら進める。
