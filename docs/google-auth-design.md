# Google認証 設計書

## 1. 概要

本書はデモ認証（`demo-auth-design.md`）に続く、**Google OAuth 2.0 認証**の設計を対象とする。

### 前提

- 既存のデモ認証（YAML/パスワード）は引き続き共存する
- Google認証はオプション機能として、環境変数の有無で有効・無効を切り替える
- 既存の Zustand ストア（`authStore`）・API の `x-username` ヘッダーとの統合を維持する

---

## 論点 1: ライブラリ選定

### 選択肢

| 選択肢 | 概要 | メリット | デメリット |
|--------|------|---------|-----------|
| **NextAuth.js v5 (Auth.js)** | Next.js 公式推奨の認証ライブラリ | App Router 対応・Google Provider 内蔵・PKCE/CSRF 自動処理 | 学習コスト・設定ファイルが増える |
| 独自実装（googleapis SDK） | Google API を直接呼び出す | 完全な制御 | OAuth フロー・セキュリティ対策を全て自前で実装 |
| Firebase Authentication | Firebase の認証基盤 | 手軽・実績豊富 | Firebase 依存が生まれる |

### 決定: **NextAuth.js v5 (Auth.js)** を採用

**理由:**
- Next.js App Router との親和性が最も高い（App Router 専用の `auth()` 関数が使える）
- OAuth の state パラメータ・PKCE・CSRF トークン管理が自動
- Google Provider が内蔵されており、実装量が最小
- 将来的に Microsoft Entra ID（`authMode: 'entra'`）を追加する際も同一ライブラリで対応可能

```
# 追加パッケージ（1件のみ）
next-auth@^5.0.0-beta
```

---

## 論点 2: セッション管理の統合

### 課題

既存アーキテクチャと NextAuth.js のセッション管理方式が異なる。

| | 既存（デモ認証） | NextAuth.js（Google認証） |
|--|----------------|--------------------------|
| セッション保存先 | `sessionStorage`（クライアント） | HTTP Cookie（サーバー発行） |
| 状態管理 | Zustand `authStore` | NextAuth セッション |
| 有効期限管理 | タブを閉じると失効 | Cookie の `maxAge` で制御 |

### 解決策: **NextAuth セッション → Zustand ブリッジ**

`AuthGuard` の初期化時に NextAuth セッションを読み取り、Zustand に同期する。

```
ブラウザ起動
    │
    ▼
AuthGuard がマウント
    │
    ├─ Zustand rehydrate（既存）
    │       isAuthenticated: true → AppLayout 表示（デモ認証）
    │
    └─ Zustand が未認証の場合
            │
            ▼
        GET /api/auth/session（NextAuth）
            │
            ├─ セッションあり（Google認証済み）
            │       → authStore.login(user, 'google') → AppLayout 表示
            │
            └─ セッションなし
                    → LoginPage 表示
```

### コード概要

```typescript
// src/components/auth/AuthGuard.tsx（変更後）

'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAuthStore } from '../../stores/authStore';
import { LoginPage } from './LoginPage';
import { UsernameSetupPage } from './UsernameSetupPage';
import { AppLayout } from '../layout/AppLayout';

type AuthFlow = 'loading' | 'unauthenticated' | 'setup-username' | 'authenticated';

interface GoogleSetupInfo {
  email: string;
  googleDisplayName: string;
  suggestedUsername: string;
}

export function AuthGuard() {
  const [flow, setFlow] = useState<AuthFlow>('loading');
  const [setupInfo, setSetupInfo] = useState<GoogleSetupInfo | null>(null);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);
  const { data: session, status } = useSession();

  // Rehydrate Zustand on mount
  useEffect(() => {
    useAuthStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (status === 'loading') return;

    // Already authenticated via demo auth (Zustand sessionStorage)
    if (isAuthenticated) {
      setFlow('authenticated');
      return;
    }

    // No NextAuth session → show login
    if (!session?.user?.email) {
      setFlow('unauthenticated');
      return;
    }

    // NextAuth session exists → look up or set up username
    const email = session.user.email;
    fetch(`/api/auth/google-user?email=${encodeURIComponent(email)}`)
      .then((res) => res.json())
      .then(async (data: { exists?: boolean; username?: string; displayName?: string; suggestedUsername?: string }) => {
        if (data.exists && data.username && data.displayName) {
          await login(
            { username: data.username, displayName: data.displayName, email },
            'google',
          );
          setFlow('authenticated');
        } else {
          setSetupInfo({
            email,
            googleDisplayName: session.user?.name ?? email,
            suggestedUsername: data.suggestedUsername ?? email.split('@')[0],
          });
          setFlow('setup-username');
        }
      })
      .catch(() => setFlow('unauthenticated'));
  }, [status, isAuthenticated, session, login]);

  // After username setup, authStore.login() is called inside UsernameSetupPage
  // Watch isAuthenticated to transition to authenticated state
  useEffect(() => {
    if (isAuthenticated && flow === 'setup-username') {
      setFlow('authenticated');
    }
  }, [isAuthenticated, flow]);

  if (flow === 'loading') {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: 'var(--bg)' }}
      >
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          読み込み中...
        </div>
      </div>
    );
  }

  if (flow === 'setup-username' && setupInfo) {
    return (
      <UsernameSetupPage
        email={setupInfo.email}
        googleDisplayName={setupInfo.googleDisplayName}
        suggestedUsername={setupInfo.suggestedUsername}
      />
    );
  }

  if (flow === 'authenticated') {
    return <AppLayout />;
  }

  return <LoginPage />;
}
```

---

## 論点 3: ユーザー識別子の扱い

### 課題

既存のデモ認証では `username`（英数字 ID）で識別しているが、Google 認証ではユーザーが持つのはメールアドレスのみ。メールアドレスをそのまま username にするとメンション（`@tanaka@example.com`）が長すぎて使いにくい。

### 決定: **初回ログイン時にユーザー名を入力させる**

- 初回 Google ログイン成功後、ユーザー名設定画面を表示する
- 初期値はメールアドレスの `@` より前の部分（ローカルパート）
- 既存ユーザーと重複する場合は末尾に連番を付与（例: `tanaka` → `tanaka2`）
- ユーザーが編集して確定できる（確定後は変更不可）
- 制約: 2〜30文字・半角英小文字・数字・アンダースコアのみ

### AuthUser 型の拡張

```typescript
// src/types/auth.ts（変更後）

export interface AuthUser {
  username: string;    // デモ認証: YAML の username / Google認証: 設定したユーザー名
  displayName: string; // デモ認証: displayName / Google認証: Google アカウント名
  email?: string;      // Google認証のみ設定（デモ認証では undefined）
}
```

### DB: google_users テーブル

Google ユーザーとユーザー名の対応を永続化する。

```sql
CREATE TABLE IF NOT EXISTS google_users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT UNIQUE NOT NULL,
  username     TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### ユーザー名重複時の自動提案ロジック

```
メールの @ より前を取得: "tanaka.taro" → sanitize → "tanaka_taro"
"tanaka_taro" が未使用 → 提案値として返す
使用中なら "tanaka_taro2", "tanaka_taro3", ... と連番で探索
```

---

## 論点 4: 表示制御（認証モードの切り替え）

### 設計方針

環境変数の有無でUIを動的に制御する。**コードを変更せずに認証方法を追加・無効化できる**ようにする。

### 環境変数

```bash
# .env.local

# Google OAuth（設定すると Google ログインボタンが表示される）
GOOGLE_CLIENT_ID=xxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxx

# NextAuth.js 必須（openssl rand -base64 32 で生成）
AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ドメイン制限（省略可。設定すると指定ドメインのみ許可）
GOOGLE_ALLOWED_DOMAINS=example.com,sub.example.com
```

### 表示ロジック

`/api/auth/config` エンドポイントでサーバーサイドの設定を返し、LoginPage がそれを参照して描画を決める。

```typescript
// app/api/auth/config/route.ts

export async function GET() {
  return Response.json({
    googleEnabled: !!process.env.GOOGLE_CLIENT_ID,
  });
}
```

```
GOOGLE_CLIENT_ID 未設定の場合:      GOOGLE_CLIENT_ID 設定済みの場合:
┌─────────────────────┐            ┌─────────────────────┐
│  ユーザー名          │            │  ユーザー名          │
│  [          ]       │            │  [          ]       │
│  パスワード          │            │  パスワード          │
│  [          ]       │            │  [          ]       │
│  [  ログイン  ]     │            │  [  ログイン  ]     │
│                     │            │  ──── または ────   │
│                     │            │  [ G Googleでログイン]│
└─────────────────────┘            └─────────────────────┘
```

---

## 論点 5: ドメイン制限

### 課題

Google OAuth は任意のGoogleアカウント所持者が認証できてしまう。業務用途では特定の組織ドメイン（例: `example.com`）のみに制限したい。

### 実装: NextAuth コールバックでフィルタリング

```typescript
// src/lib/auth/nextAuth.ts

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const allowedDomains = process.env.GOOGLE_ALLOWED_DOMAINS
  ? process.env.GOOGLE_ALLOWED_DOMAINS.split(',').map((d) => d.trim())
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (allowedDomains.length === 0) return true;
      const email = profile?.email ?? '';
      const domain = email.split('@')[1];
      return allowedDomains.includes(domain);
    },
  },
  pages: {
    error: '/auth/error',
  },
});
```

```typescript
// app/api/auth/[...nextauth]/route.ts

import { handlers } from '@/lib/auth/nextAuth';

export const { GET, POST } = handlers;
```

### エラー表示

ドメイン外のアカウントでログインを試みた場合、NextAuth はデフォルトで `/api/auth/error?error=AccessDenied` にリダイレクトする。

`/auth/error` ページを作成し「このアカウントでのアクセスは許可されていません」と日本語で表示する。

---

## 論点 6: API ルートの保護

### 現状

タスク系 API は `x-username` ヘッダーで認証ユーザーを識別している。デモ認証ではクライアントが `authStore` からユーザー名を取得してヘッダーにセットしている。

```typescript
// 既存の呼び出し例
fetch('/api/tasks', {
  headers: { 'x-username': authStore.user.username }
})
```

### 変更方針

**クライアント側の変更は不要。** Google 認証ユーザーの `username` にはメールアドレスが入っているため、既存の `x-username` ヘッダーをそのまま利用できる。

```
Google 認証ユーザー: username = "tanaka@example.com"
デモ 認証ユーザー:   username = "tanaka"

→ どちらも x-username ヘッダーとして送信される（既存の API コードを変更不要）
```

### 将来的な改善（スコープ外）

より堅牢にするには、`x-username` の代わりに `auth()` でサーバーサイド検証するべきだが、それは別設計書で扱う。

---

## 論点 7: ログアウト処理

### 課題

Google 認証ではセッションが Cookie にあるため、ログアウト時に NextAuth の `signOut()` を呼ばないとセッションが残る。

### 変更: logout アクションの拡張

```typescript
// src/stores/authStore.ts（logout の変更箇所）

import { signOut } from 'next-auth/react';

logout: () => {
  const currentMode = get().authMode;

  // 共通のクリーンアップ
  if (typeof window !== 'undefined') {
    localStorage.removeItem('scenario-storage');
  }
  useChatStore.setState({ conversations: [], activeConversationId: null });
  useScenarioStore.setState({ activeNodes: {} });
  set({ user: null, sessionToken: null, isAuthenticated: false, authMode: null });

  // Google 認証の場合は NextAuth セッションも破棄
  if (currentMode === 'google') {
    signOut({ redirect: false });
  }
},
```

### ログアウトフロー

```
ヘッダーの「ログアウト」ボタン押下
    │
    ▼
authStore.logout()
    ├─ Zustand 状態クリア（sessionStorage 消去）
    ├─ chatStore リセット
    └─ authMode === 'google' なら signOut() 呼び出し
            │
            ▼
        NextAuth が Cookie を無効化（サーバーへの POST /api/auth/signout）
            │
            ▼
        LoginPage を表示
```

---

## 論点 8: Google Cloud Console の設定

実装に先立ち、Google Cloud Console で以下を設定する必要がある。これはコード変更ではなく**運用作業**である。

### 手順

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成または選択
2. 「APIとサービス」→「認証情報」→「OAuth 2.0 クライアント ID」を作成
3. アプリケーションの種類: **「ウェブ アプリケーション」**
4. 以下を設定:

| 項目 | 開発環境 | 本番環境 |
|------|---------|---------|
| 承認済みのリダイレクト URI | `http://localhost:3000/api/auth/callback/google` | `https://your-domain.com/api/auth/callback/google` |
| 承認済みの JavaScript 生成元 | `http://localhost:3000` | `https://your-domain.com` |

5. 作成後に表示される **クライアント ID** と **クライアント シークレット** を `.env.local` に設定

### AUTH_SECRET の生成

```bash
openssl rand -base64 32
```

生成した値を `AUTH_SECRET` に設定する（NextAuth.js がセッション Cookie の署名・暗号化に使用）。

---

## 9. ファイル変更一覧

### 新規作成

| ファイル | 内容 |
|---------|------|
| `src/lib/auth/nextAuth.ts` | NextAuth 設定（Google Provider・ドメイン制限コールバック） |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth ハンドラー（handlers の再エクスポート） |
| `app/api/auth/config/route.ts` | 認証モード設定を返すエンドポイント |
| `app/api/auth/google-user/route.ts` | Google ユーザーの照会・登録 API |
| `app/auth/error/page.tsx` | 認証エラー画面（ドメイン制限などのエラー表示） |
| `src/components/auth/GoogleLoginButton.tsx` | Googleログインボタン（`signIn('google')` を呼ぶ） |
| `src/components/auth/UsernameSetupPage.tsx` | 初回ログイン時のユーザー名設定画面 |
| `src/components/providers/SessionProviderWrapper.tsx` | クライアント側 SessionProvider ラッパー |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/db.ts` | `google_users` テーブル追加・照会/登録/重複確認/提案ヘルパー追加 |
| `src/types/auth.ts` | `AuthUser` に `email?: string` を追加 |
| `src/components/auth/AuthGuard.tsx` | NextAuth セッション → Zustand ブリッジ・ユーザー名未設定時は設定画面へ |
| `src/components/auth/LoginPage.tsx` | Google ボタンの表示制御（`/api/auth/config` を参照） |
| `src/stores/authStore.ts` | `logout` で `signOut()` を呼ぶ分岐を追加 |
| `app/layout.tsx` | `SessionProviderWrapper` でラップ |
| `.env.local.example` | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `AUTH_SECRET` / `GOOGLE_ALLOWED_DOMAINS` を追加 |
| `package.json` | `next-auth@^5.0.0-beta` を追加 |

---

## 10. 実装スコープ（チェックリスト）

### 事前作業（運用）

- [ ] Google Cloud Console でプロジェクト作成・OAuth クライアント ID 発行
- [ ] `AUTH_SECRET` を `openssl rand -base64 32` で生成
- [ ] `.env.local` に `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `AUTH_SECRET` を設定

### パッケージ

- [x] `next-auth@^5.0.0-beta` をインストール

### 実装

- [x] `app/api/auth/[...nextauth]/route.ts` を作成（Google Provider・ドメイン制限コールバック）
- [x] `app/api/auth/config/route.ts` を作成
- [x] `app/auth/error/page.tsx` を作成（日本語エラー画面）
- [x] `app/layout.tsx` を `SessionProvider` でラップ
- [x] `src/types/auth.ts` に `email?: string` を追加
- [x] `src/components/auth/GoogleLoginButton.tsx` を作成
- [x] `src/components/auth/LoginPage.tsx` を変更（Google ボタン条件表示）
- [x] `src/components/auth/AuthGuard.tsx` を変更（NextAuth → Zustand ブリッジ）
- [x] `src/stores/authStore.ts` を変更（logout に `signOut()` 追加）
- [x] `.env.local.example` を更新

### 動作確認

- [x] Google アカウントでログインできる
- [x] ドメイン制限設定時、対象外ドメインで弾かれる
- [x] ログアウト後に Cookie が消えており、リロードしても再ログインを要求される
- [x] デモ認証（YAML）が引き続き動作する
- [x] タスク機能の `x-username` ヘッダーが Google ユーザーのメールアドレスで正常に動作する
