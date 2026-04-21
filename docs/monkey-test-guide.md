# モンキーテスト用ガイド: デモ認証と人工無能（デモチャットボット）

本ドキュメントは、General Chat Interfaceのモンキーテスト（動作確認）を行うテストユーザー向けに、デモ認証と人工無能（デモチャットボット）の有効化手順、および主要なディレクトリ・ファイルの概要を解説するものです。

## 1. デモ環境の有効化手順

テスト環境では、外部APIキーを設定せずにチャットUIや各種機能の動作確認を行うための「デモ認証」と「人工無能（デモチャットボット/シナリオ機能）」が用意されています。

### 1.1 デモ認証（Demo Auth）の設定とログイン

1. **ユーザー定義ファイルの作成**
   プロジェクトルートの `data/` ディレクトリにある `users.yaml.example` をコピーして、同じ場所に `users.yaml` を作成します。
   ```bash
   cp data/users.yaml.example data/users.yaml
   ```

2. **サーバーの起動**
   ```bash
   npm run dev
   ```
   ブラウザで `http://localhost:3000` などの起動したURLにアクセスします。

3. **ログイン**
   ログイン画面に表示される「デモログイン」フォームを使用します。`users.yaml` に定義されている以下のいずれかの認証情報でログインしてください。
   - ユーザー名: `admin` / パスワード: `password123`
   - ユーザー名: `demo` / パスワード: `demo`
   - ユーザー名: `tester` / パスワード: `test1234`

### 1.2 人工無能（デモチャットボット）の利用

1. ログイン後、チャット画面のサイドバーやヘッダーにある「Demo Agent（シナリオ選択）」ボタンをクリックします。
2. シナリオ選択モーダルが表示されます。
3. 一覧からテストしたいシナリオ（例：カスタマーサポート、飲食店注文など）を選択します。
4. チャット画面がシナリオモードに切り替わり、選択肢ボタン等を使った人工無能との会話テストが可能になります。

---

## 2. ディレクトリ構造と主要ファイルの概要

プロジェクトの主要なディレクトリ構造と、テスト時に意識すべきファイル群の概要です。

```text
.
├── app/                  # Next.js App Routerのルーティング・ページ定義
│   ├── api/              # APIルート
│   ├── auth/             # 認証関連のページ
│   ├── layout.tsx        # アプリケーション全体のレイアウト
│   └── page.tsx          # メインページ
├── docs/                 # ドキュメント（本ファイルなど）
├── public/               # 静的ファイル
│   ├── users.yaml        # [作成] デモログイン用のユーザー定義ファイル
│   └── users.yaml.example
└── src/                  # アプリケーションの主要なソースコード
    ├── components/       # Reactコンポーネント
    │   ├── auth/         # ログインフォーム（DemoLoginForm等）
    │   ├── chat/         # チャットUI（メッセージ一覧、入力エリア）
    │   ├── layout/       # サイドバー、ヘッダー、AppLayoutなど
    │   └── scenario/     # 人工無能（シナリオ）関連のUI（選択肢ボタン等）
    ├── hooks/            # カスタムReact Hooks (useChat, useScenario等)
    ├── lib/              # ユーティリティ、プロバイダー実装
    │   ├── auth/         # 認証ロジック（demoAuth.ts）
    │   └── providers/    # LLMプロバイダー実装（Scripted Demo等）
    ├── scenarios/        # ★人工無能（デモエージェント）のシナリオ定義（YAML）
    │   ├── customer-support.yaml
    │   ├── restaurant-order.yaml
    │   └── index.ts
    ├── stores/           # Zustandによる状態管理
    │   ├── authStore.ts
    │   ├── chatStore.ts
    │   └── scenarioStore.ts
    └── types/            # TypeScript型定義
```

### 主要ファイルのポイント

- **`data/users.yaml`**
  デモログイン用のアカウントを管理するファイル。テストユーザーを追加したい場合はこのファイルを編集します。
- **`src/components/auth/DemoLoginForm.tsx` & `src/lib/auth/demoAuth.ts`**
  デモログインのUIと、`users.yaml`をパースして認証を行うロジックが含まれています。
- **`src/scenarios/*.yaml`**
  人工無能の会話フロー（シナリオ）を定義しているYAMLファイルです。テスト中にシナリオの応答を変更したり、新しいパターンを追加したい場合はここを確認・編集します。
- **`src/stores/scenarioStore.ts`**
  人工無能との会話状態や遷移を管理する状態ストアです。

以上を参考に、システム各所のモンキーテストを実施してください。
