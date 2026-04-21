# デモ用認証機能 設計書

## 1. 概要

### 目的

本アプリケーションへのアクセスをユーザー認証で保護する。認証機能は2方式を実装する。

| 方式 | 説明 | 用途 |
|------|------|------|
| **デモ認証** | ファイルに定義したユーザー名・平文パスワードによる認証 | デモ・開発・社内検証 |
| **外部IdP認証** | Google / Microsoft Entra ID を用いた OAuth 2.0 / OIDC 認証 | 本番・本格運用 |

本書は **デモ認証** の設計を対象とする。

### デモ認証の特徴

- **設定ファイルのみ**: コードを変更せずにユーザーを追加・変更できる
- **平文パスワード**: セキュリティよりも手軽さを優先したデモ専用方式
- **ファイルベース**: データベース不要、YAMLファイルで管理
- **セッション管理**: ブラウザの `sessionStorage` に認証状態を保持
- **ログアウト**: ヘッダーからいつでもログアウト可能

> **警告**: デモ認証は平文パスワードを使用するため、本番環境での使用は禁止。インターネット公開環境では外部IdP認証を使用すること。

---

## 2. ユーザー定義ファイル仕様

### ファイル配置

```
general-chat-interface/
└── public/
    └── users.yaml        ← ユーザー定義ファイル（サーバーから fetch で取得）
```

`public/` 以下に配置することで、Vite のビルド・開発サーバーいずれでも静的ファイルとして配信される。

### YAML スキーマ

```yaml
# data/users.yaml

users:
  - username: admin           # ログインID（必須・一意）
    password: password123     # 平文パスワード（必須）
    displayName: 管理者       # 表示名（省略可。省略時は username を使用）

  - username: demo
    password: demo
    displayName: デモユーザー

  - username: tester
    password: test1234
    # displayName 省略 → "tester" として表示
```

### フィールド定義

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `username` | string | ✓ | ログイン時に入力するID。英数字・アンダースコアを推奨 |
| `password` | string | ✓ | 平文パスワード。デモ専用のため暗号化なし |
| `displayName` | string | | UI に表示する名前。省略時は `username` を使用 |

### TypeScript 型定義

```typescript
// src/types/auth.ts

export interface UserDefinition {
  username: string;
  password: string;
  displayName?: string;
}

export interface UsersConfig {
  users: UserDefinition[];
}

export interface AuthUser {
  username: string;
  displayName: string;
}

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  authMode: 'demo' | 'google' | 'entra' | null;
}
```

---

## 3. アーキテクチャ

### 全体フロー

```
ブラウザ起動
    │
    ▼
sessionStorage に認証情報あり？
    │
    ├── YES → AuthUser を復元 → AppLayout 表示
    │
    └── NO  → LoginPage 表示
                  │
                  ├── [デモ認証] ユーザー名・パスワード入力
                  │       │
                  │       ▼
                  │   data/users.yaml を fetch
                  │       │
                  │       ▼
                  │   認証成功？
                  │       ├── YES → sessionStorage 保存 → AppLayout 表示
                  │       └── NO  → エラーメッセージ表示
                  │
                  └── [外部IdP] Google / Entra ボタン（別設計書参照）
```

### コンポーネント構成

```
src/
├── types/
│   └── auth.ts                  ← 型定義（AuthUser, AuthState など）
│
├── stores/
│   └── authStore.ts             ← Zustand ストア（認証状態管理）
│
├── lib/
│   └── auth/
│       └── demoAuth.ts          ← デモ認証ロジック（YAML読込・照合）
│
├── components/
│   ├── auth/
│   │   ├── LoginPage.tsx        ← ログイン画面全体
│   │   ├── DemoLoginForm.tsx    ← ユーザー名・パスワードフォーム
│   │   └── AuthGuard.tsx        ← 認証チェック・ルーティング制御
│   │
│   └── layout/
│       └── Header.tsx           ← ログインユーザー名・ログアウトボタン追加
│
└── App.tsx                      ← AuthGuard でラップ
```

---

## 4. 状態管理（authStore）

### ストア設計

```typescript
// src/stores/authStore.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AuthUser, AuthState } from '../types/auth';

interface AuthStore extends AuthState {
  login: (user: AuthUser, mode: AuthState['authMode']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      authMode: null,

      login: (user, mode) =>
        set({ user, isAuthenticated: true, authMode: mode }),

      logout: () =>
        set({ user: null, isAuthenticated: false, authMode: null }),
    }),
    {
      name: 'general-chat-auth',
      storage: createJSONStorage(() => sessionStorage), // タブを閉じると消える
    }
  )
);
```

**`sessionStorage` を選択した理由:**
- タブを閉じると自動ログアウト → 共有PCでのセキュリティリスクを軽減
- ページリロードでは認証状態を維持 → UX を損なわない
- `localStorage` のようにブラウザ全体に永続しない

---

## 5. デモ認証ロジック

### `demoAuth.ts` の責務

1. `data/users.yaml` を `fetch` で取得
2. js-yaml でパース（既存依存: `js-yaml` パッケージ使用）
3. 入力されたユーザー名・パスワードと照合（大文字小文字を区別）
4. 一致すれば `AuthUser` を返す、不一致なら `null` を返す

```typescript
// src/lib/auth/demoAuth.ts

import yaml from 'js-yaml';
import { UsersConfig, UserDefinition, AuthUser } from '../../types/auth';

export async function authenticateDemo(
  username: string,
  password: string
): Promise<AuthUser | null> {
  const response = await fetch('/api/auth/demo', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (!response.ok) {
    throw new Error('ユーザー設定ファイルの読み込みに失敗しました');
  }

  const text = await response.text();
  const config = yaml.load(text) as UsersConfig;

  const matched: UserDefinition | undefined = config.users.find(
    (u) => u.username === username && u.password === password
  );

  if (!matched) return null;

  return {
    username: matched.username,
    displayName: matched.displayName ?? matched.username,
  };
}
```

### エラーハンドリング

| 状況 | ユーザー向けメッセージ | 内部処理 |
|------|----------------------|---------|
| `users.yaml` が存在しない | 「設定エラー: 管理者に連絡してください」 | `fetch` が 404 → `throw` |
| YAML パースエラー | 「設定エラー: 管理者に連絡してください」 | `yaml.load` 例外 → `throw` |
| ユーザー名・パスワード不一致 | 「ユーザー名またはパスワードが正しくありません」 | `null` 返却 |
| ネットワークエラー | 「ネットワークエラー: 再度お試しください」 | `fetch` 例外 → `throw` |

---

## 6. UI 仕様

### ログイン画面（LoginPage）

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              General Chat Interface                     │
│                                                         │
│         ┌─────────────────────────────────┐             │
│         │                                 │             │
│         │  ユーザー名                      │             │
│         │  ┌───────────────────────────┐  │             │
│         │  │ username                  │  │             │
│         │  └───────────────────────────┘  │             │
│         │                                 │             │
│         │  パスワード                      │             │
│         │  ┌───────────────────────────┐  │             │
│         │  │ ••••••••                  │  │             │
│         │  └───────────────────────────┘  │             │
│         │                                 │             │
│         │  ┌───────────────────────────┐  │             │
│         │  │       ログイン            │  │             │
│         │  └───────────────────────────┘  │             │
│         │                                 │             │
│         │  ─────────── または ──────────  │             │
│         │                                 │             │
│         │  ┌───────────────────────────┐  │             │
│         │  │  G  Google でログイン     │  │             │
│         │  └───────────────────────────┘  │             │
│         │                                 │             │
│         │  ┌───────────────────────────┐  │             │
│         │  │  🏢 Microsoft でログイン  │  │             │
│         │  └───────────────────────────┘  │             │
│         │                                 │             │
│         └─────────────────────────────────┘             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**表示制御:**
- デモ認証が有効な場合: ユーザー名・パスワードフォームを表示
- Google/Entra 認証が設定済みの場合: 対応するボタンを表示
- 設定に応じて不要なオプションは非表示にする（将来の拡張ポイント）

### フォーム動作

| 操作 | 動作 |
|------|------|
| Enter キー | フォーム送信 |
| ログインボタン | フォーム送信 |
| 送信中 | ボタンを disabled + ローディング表示 |
| 認証失敗 | フォーム下部にエラーメッセージ表示、パスワードをクリア |
| 認証成功 | `AppLayout` へ遷移 |

### ヘッダー（Header）の変更

```
┌─────────────────────────────────────────────────────────┐
│ General Chat Interface    [ユーザー名]  [ログアウト]      │
└─────────────────────────────────────────────────────────┘
```

- ログインユーザーの `displayName` を右上に表示
- ログアウトボタン押下 → `authStore.logout()` → `LoginPage` へ遷移

---

## 7. AuthGuard コンポーネント

アプリ全体の認証ルーティングを担う。

```typescript
// src/components/auth/AuthGuard.tsx

import { useAuthStore } from '../../stores/authStore';
import { LoginPage } from './LoginPage';
import { AppLayout } from '../layout/AppLayout';

export function AuthGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <AppLayout /> : <LoginPage />;
}
```

```typescript
// app/page.tsx（変更後）

import { AuthGuard } from '@/components/auth/AuthGuard';

export default function Page() {
  return <AuthGuard />;
}
```

---

## 8. セキュリティ考慮事項

### デモ認証の限界（既知の制限）

| リスク | 内容 | 対策（デモ範囲内） |
|--------|------|------------------|
| 平文パスワード | `users.yaml` が漏洩するとパスワードが露出 | ファイルアクセス制限・非公開環境での使用 |
| クライアントサイド照合 | ブラウザのDevToolsでYAMLの中身を確認可能 | デモ環境限定の使用 |
| セッションハイジャック | sessionStorage の値が読み取られる可能性 | HTTPS 環境での使用を推奨 |
| レートリミットなし | ブルートフォース攻撃への耐性なし | デモ用途・内部ネットワーク限定 |

### `users.yaml` の管理方針

- `data/users.yaml` は `.gitignore` に追加し、リポジトリにコミットしない
- 代わりに `data/users.yaml.example` をサンプルとしてコミット
- CI/CD やデプロイ時に環境変数または秘密管理サービスから生成

```
# .gitignore への追加
data/users.yaml
```

---

## 9. チャット履歴の管理方針

### 全体方針

会話履歴の正規データはサーバーに保存し、`localStorage` はセッション中の作業キャッシュとして使用する。
ログアウト時にキャッシュを削除し、次回ログイン時にサーバーから最新状態を再取得する。

```
【ログイン時】
  サーバー ──直近5件取得──▶ chatStore（インメモリ）
                                   │
                          localStorage にキャッシュ

【会話中】
  chatStore ──AIレスポンス完了後に自動同期──▶ サーバー
      │
  localStorage をリアルタイム更新（ページリロード対策）

【ログアウト時】
  localStorage を削除 ──▶ chatStore をリセット ──▶ ログイン画面へ
```

---

### 9.1 会話履歴 API 仕様

フロントエンドとバックエンドの間で以下の REST API を使用する。
バックエンドの実装は別途定義する。

#### エンドポイント一覧

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/conversations` | 会話一覧を取得（ページネーション） |
| `GET` | `/api/conversations/:id` | 会話の全メッセージを取得 |
| `POST` | `/api/conversations` | 会話を新規作成（メタデータのみ） |
| `PUT` | `/api/conversations/:id` | 会話を更新（メッセージ同期） |
| `DELETE` | `/api/conversations/:id` | 会話を削除 |

#### `GET /api/conversations` リクエスト

```
GET /api/conversations?limit=5&offset=0
Authorization: Bearer <session_token>
```

| パラメータ | 型 | デフォルト | 説明 |
|-----------|-----|-----------|------|
| `limit` | number | 20 | 取得件数 |
| `offset` | number | 0 | 取得開始位置（0始まり） |

#### `GET /api/conversations` レスポンス

```json
{
  "total": 42,
  "conversations": [
    {
      "id": "uuid",
      "title": "Reactのhooksについて",
      "createdAt": "2026-04-18T10:00:00Z",
      "updatedAt": "2026-04-18T10:30:00Z",
      "messageCount": 12,
      "scenarioId": null
    }
  ]
}
```

#### `GET /api/conversations/:id` レスポンス

```json
{
  "id": "uuid",
  "title": "Reactのhooksについて",
  "createdAt": "2026-04-18T10:00:00Z",
  "updatedAt": "2026-04-18T10:30:00Z",
  "scenarioId": null,
  "messages": [
    {
      "id": "uuid",
      "role": "user",
      "content": "useEffectの使い方を教えてください",
      "timestamp": "2026-04-18T10:00:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "content": "useEffectは...",
      "timestamp": "2026-04-18T10:00:05Z"
    }
  ]
}
```

#### 認証

全エンドポイントで `Authorization: Bearer <session_token>` ヘッダーを必須とする。
セッショントークンはログイン成功時にサーバーから発行し、`sessionStorage` に保存する。

---

### 9.2 ログイン時の履歴読み込み

認証成功後、以下の順序で初期化する。

```
1. sessionStorage に AuthUser + session_token を保存
2. GET /api/conversations?limit=5&offset=0 を fetch
3. 取得した5件を chatStore にロード
4. localStorage に同じ5件をキャッシュ（ページリロード対策）
5. AppLayout を表示
```

```typescript
// authStore.ts の login アクション（概要）

login: async (user, token, mode) => {
  set({ user, sessionToken: token, isAuthenticated: true, authMode: mode });

  const { conversations } = await fetchConversations({ limit: 5, offset: 0 });
  useChatStore.getState().loadConversations(conversations);
},
```

サーバーが応答しない場合はエラートーストを表示し、空の状態で AppLayout を表示する（オフラインフォールバック）。

---

### 9.3 会話のサーバー同期タイミング

| タイミング | 処理 | 理由 |
|-----------|------|------|
| AIレスポンスのストリーミング完了時 | `PUT /api/conversations/:id` | 最新メッセージを確実に保存 |
| 新規会話作成時 | `POST /api/conversations` | IDをサーバーと同期 |
| 会話削除時 | `DELETE /api/conversations/:id` | サーバー側も削除 |

ストリーミング中（`isStreaming: true`）は同期しない。

---

### 9.4 ログアウト時の処理

```typescript
// authStore.ts の logout アクション

logout: async () => {
  const { user } = get();

  // 1. localStorage のキャッシュを削除
  localStorage.removeItem('general-chat-storage');
  localStorage.removeItem('scenario-storage');

  // 2. インメモリ状態をリセット
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    settings: DEFAULT_SETTINGS,
  });
  useScenarioStore.setState({ activeNodes: {} });

  // 3. 認証状態をクリア（sessionStorage も消える）
  set({ user: null, sessionToken: null, isAuthenticated: false, authMode: null });
},
```

ログアウト後はログイン画面に遷移し、次回ログイン時はサーバーから履歴を再取得する。

---

## 10. 履歴画面

サイドバーには直近5件のみ表示し、それ以前の会話は専用の履歴画面で参照する。

### 10.1 UI レイアウト

```
┌─────────────────────────────────────────────────────────┐
│ ← 戻る   過去の会話履歴                  [検索ボックス]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  2026年4月18日                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Reactのhooksについて              10:30  12件 ▶ │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ TypeScriptの型推論                09:15   8件 ▶ │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  2026年4月17日                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ デモ: 製品紹介シナリオ            15:42   5件 ▶ │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ SQLのJOINについて                 11:20  20件 ▶ │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│              ┌────────────────────┐                     │
│              │  さらに読み込む     │                     │
│              └────────────────────┘                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 10.2 機能仕様

| 機能 | 仕様 |
|------|------|
| **表示件数** | 1ページ20件。「さらに読み込む」で追加20件を取得 |
| **日付グループ** | 会話を更新日でグループ化して表示 |
| **検索** | タイトルのクライアントサイド検索（取得済みデータのみ対象） |
| **会話を開く** | 行クリック → `GET /api/conversations/:id` でメッセージを取得 → サイドバーに追加してメイン画面で表示 |
| **削除** | 行の削除ボタン → `DELETE /api/conversations/:id` → 一覧から除去 |

### 10.3 コンポーネント構成

```
src/components/
└── history/
    ├── HistoryPage.tsx        ← 履歴画面全体
    ├── HistoryList.tsx        ← 日付グループ付き一覧
    └── HistoryItem.tsx        ← 会話1件分の行
```

### 10.4 サイドバーとの連携

```
┌──────────────┐
│ Sidebar      │
│              │
│ [新規]       │
│              │
│ 最近の会話   │  ← ログイン時にサーバーから取得した直近5件
│  > 会話A     │
│  > 会話B     │
│  > 会話C     │
│  > 会話D     │
│  > 会話E     │
│              │
│ [過去の履歴] │  ← クリックで HistoryPage を表示
│ [設定]       │
└──────────────┘
```

履歴画面で会話を開くと、その会話がサイドバーの「最近の会話」欄の先頭に追加される（最大5件を超えたら末尾を押し出す）。

---

## 11. 認証モード設定の切り替え

将来的な外部IdP認証との共存を考慮し、認証モードを設定で切り替えられる構造にする。

```typescript
// src/lib/auth/authConfig.ts

export interface AuthConfig {
  demo: {
    enabled: boolean;
  };
  google: {
    enabled: boolean;
    clientId: string;
  };
  entra: {
    enabled: boolean;
    clientId: string;
    tenantId: string;
  };
}
```

設定の読み込み方法は外部IdP認証の設計書にて詳細を定義する。

---

## 12. 実装スコープ

### 認証基盤

- [x] `data/users.yaml` のスキーマ定義
- [x] `src/types/auth.ts` の型定義（`sessionToken` フィールド追加）
- [x] `src/stores/authStore.ts` の実装（ログイン時サーバー取得・ログアウト時localStorage削除）
- [x] `src/lib/auth/demoAuth.ts` の実装
- [x] `src/components/auth/LoginPage.tsx` の実装
- [x] `src/components/auth/DemoLoginForm.tsx` の実装
- [x] `src/components/auth/AuthGuard.tsx` の実装
- [x] `app/page.tsx` の修正（AuthGuard 適用）
- [x] `src/components/layout/Header.tsx` の修正（ユーザー名・ログアウト追加）
- [x] `data/users.yaml.example` の作成
- [x] `.gitignore` への `data/users.yaml` 追加

### 会話履歴のサーバー連携

- [ ] `src/lib/api/conversationsApi.ts` の実装（REST APIクライアント）
- [x] `src/stores/chatStore.ts` の修正（`loadConversations` アクション追加・同期処理追加）
- [x] `src/stores/scenarioStore.ts` の修正（ログアウト時リセット対応）
- [x] AIレスポンス完了時のサーバー同期処理（`useChat.ts` または `chatStore.ts` 内）

### 履歴画面

- [ ] `src/components/history/HistoryPage.tsx` の実装
- [ ] `src/components/history/HistoryList.tsx` の実装
- [ ] `src/components/history/HistoryItem.tsx` の実装
- [ ] サイドバーへの「過去の履歴」ボタン追加

### 外部IdP認証フェーズ（別設計書）

- [ ] Google OAuth 2.0 / OIDC 実装
- [ ] Microsoft Entra ID 実装
- [ ] 認証モード設定 UI
