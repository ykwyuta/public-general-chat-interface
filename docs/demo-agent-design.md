# デモ用人工無脳エージェント 設計書

## 1. 概要

### 目的
YAMLファイルで定義されたシナリオに基づき、ユーザーに選択肢を提示しながら会話を進めるデモ用チャットボット（人工無脳エージェント）機能を追加する。APIキー不要で動作するため、サービスのデモンストレーションやUI確認に活用できる。

### 特徴
- **APIキー不要**: Claude APIを使わず、YAMLで定義したスクリプトに従って動作する
- **選択肢方式**: ユーザーはテキスト入力ではなく、提示されるボタンから回答を選択する
- **分岐フロー**: ユーザーの選択によって次のメッセージ・選択肢が変化する
- **YAML定義**: シナリオをYAMLファイルで記述するため、コード変更なしにシナリオ追加・編集ができる
- **会話履歴保持**: 選択した内容は通常のチャット履歴と同様にlocalStorageに保存される

---

## 2. アーキテクチャ

### 全体構成

```
┌─────────────────────────────────────────────────────────┐
│                     AppLayout                           │
│                                                         │
│  ┌──────────┐  ┌──────────────────────────────────────┐ │
│  │ Sidebar  │  │           Main Area                  │ │
│  │          │  │  ┌────────────────────────────────┐  │ │
│  │ [新規]   │  │  │        MessageList             │  │ │
│  │ [デモ]   │  │  │  (通常メッセージ + シナリオ      │  │ │
│  │          │  │  │   メッセージが混在)             │  │ │
│  │ 会話一覧 │  │  └────────────────────────────────┘  │ │
│  │          │  │  ┌────────────────────────────────┐  │ │
│  │ [設定]   │  │  │  InputArea / OptionButtons     │  │ │
│  └──────────┘  │  │  (会話タイプによって切替)        │  │ │
│                │  └────────────────────────────────┘  │ │
│                └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### シナリオ会話の識別
`Conversation` 型に `scenarioId?: string` フィールドを追加する。このフィールドが設定されている会話は「シナリオ会話」として扱われ、`InputArea` の代わりに `OptionButtons` が表示される。

### 現在ノードの管理
`scenarioStore`（Zustand）が `{ [conversationId]: currentNodeId }` のマップを管理し、localStorageに永続化する。画面リロード後も選択状態が復元される。

---

## 3. YAML シナリオ仕様

### ファイル配置
`src/scenarios/` ディレクトリに `.yaml` ファイルを配置する。

### スキーマ

```yaml
id: string                    # シナリオの一意ID（英数字・ハイフン）
name: string                  # 表示名
description: string           # シナリオの説明文
start: string                 # 開始ノードのID

nodes:
  <node_id>:                  # ノードID（英数字・アンダースコア）
    message: string           # アシスタントが表示するメッセージ
    terminal: boolean         # （省略可）true の場合は終端ノード
    options:                  # 選択肢一覧
      - label: string         # ボタンに表示するテキスト
        next: string | null   # 次のノードID（null の場合は終端）
```

### フィールド詳細

| フィールド | 必須 | 型 | 説明 |
|-----------|------|----|------|
| `id` | ✓ | string | シナリオ識別子。URLや内部管理に使用 |
| `name` | ✓ | string | UIに表示するシナリオ名 |
| `description` | ✓ | string | シナリオ選択画面に表示する説明文 |
| `start` | ✓ | string | 最初に表示するノードのID |
| `nodes` | ✓ | object | 全ノードのマップ |
| `node.message` | ✓ | string | アシスタントのメッセージ。改行は `\n` で表現 |
| `node.terminal` | | boolean | 終端ノードかどうか。省略時は `false` |
| `node.options` | ✓ | array | 選択肢リスト。`terminal: true` のノードも最低1つ必要 |
| `option.label` | ✓ | string | 選択肢ボタンのテキスト |
| `option.next` | ✓ | string\|null | 次のノードID。`null` は会話終了 |

### 記述例

```yaml
id: simple-demo
name: シンプルデモ
description: 基本的な分岐フローのサンプル
start: greeting

nodes:
  greeting:
    message: "こんにちは！ご用件をお選びください。"
    options:
      - label: "商品について"
        next: product
      - label: "終了"
        next: end

  product:
    message: "商品についてのご質問ですね。\n詳細はお電話にてお問い合わせください。"
    terminal: true
    options:
      - label: "最初からやり直す"
        next: greeting

  end:
    message: "ありがとうございました！"
    terminal: true
    options:
      - label: "最初からやり直す"
        next: greeting
```

### 新しいシナリオの追加手順

1. `src/scenarios/` に新しい `.yaml` ファイルを作成する
2. `src/scenarios/index.ts` に `import` と `parseScenario()` 呼び出しを追加する
3. 開発サーバーを再起動する

---

## 4. コンポーネント設計

### 新規コンポーネント

#### `ScenarioSelector`
シナリオ選択モーダル。サイドバーの「デモエージェント」ボタンクリックで表示される。

```
┌────────────────────────────────────┐
│  デモエージェント                   │
├────────────────────────────────────┤
│  ┌──────────────────────────────┐  │
│  │ [icon] カスタマーサポート      │  │
│  │  商品・注文・返品に関する...    │  │
│  │              [開始する →]    │  │
│  └──────────────────────────────┘  │
│  ┌──────────────────────────────┐  │
│  │ [icon] レストラン注文         │  │
│  │  レストランでのシンプルな...    │  │
│  │              [開始する →]    │  │
│  └──────────────────────────────┘  │
└────────────────────────────────────┘
```

Props:
- `onClose: () => void`
- `onStart: (scenarioId: string) => void`

#### `OptionButtons`
選択肢ボタン一覧。`InputArea` の代わりに表示される。

```
┌────────────────────────────────────────┐
│  [製品について知りたい]                  │
│  [注文・配送について]                    │
│  [返品・交換について]                    │
│  [その他のご質問]                        │
└────────────────────────────────────────┘
```

終端ノードの場合:
```
┌────────────────────────────────────────┐
│  ✓ 会話が終了しました                    │
│  [最初からやり直す]                      │
└────────────────────────────────────────┘
```

Props:
- `conversationId: string`

### 変更コンポーネント

#### `Sidebar`
- 「デモエージェント」ボタンを「新しいチャット」ボタンの下に追加
- `onDemoAgentClick: () => void` propsを追加

#### `AppLayout`
- `ScenarioSelector` モーダルの表示状態を管理
- アクティブ会話が `scenarioId` を持つ場合、`InputArea` の代わりに `OptionButtons` を表示
- 「デモエージェント」ボタンクリックハンドラの実装

---

## 5. 状態管理

### `chatStore`（既存・拡張）

```typescript
// Conversation型に追加
interface Conversation {
  // ...既存フィールド
  scenarioId?: string;  // シナリオIDがある場合はシナリオ会話
}

// 新規アクション追加
createScenarioConversation: (scenarioId: string) => Promise<string>;
```

`createScenarioConversation` の動作:
1. サーバーAPI (`POST /api/conversations`) を呼び出し、`scenarioId` を設定した新しい `Conversation` を作成
2. シナリオの `start` ノードのメッセージを最初のアシスタントメッセージとして作成
3. サーバーAPI (`POST /api/conversations/[id]/messages`) を呼び出し、初期メッセージを保存
4. `scenarioStore` の `activeNodes` を開始ノードに設定し、ローカルのZustandストアを更新

### `scenarioStore`（新規）

```typescript
interface ScenarioStoreState {
  activeNodes: Record<string, string>;  // conversationId → currentNodeId

  setActiveNode: (conversationId: string, nodeId: string) => void;
  getActiveNode: (conversationId: string) => string | undefined;
  clearNode: (conversationId: string) => void;
}
```

- Zustand `persist` ミドルウェアで localStorage に保存（キー: `scenario-storage`）
- 会話削除時に対応する `activeNodes` エントリを削除する処理が必要

---

## 6. データフロー

### シナリオ開始フロー

```
ユーザー: サイドバー「デモエージェント」クリック
  → ScenarioSelector モーダル表示
  → シナリオを選択して「開始する」クリック
    → chatStore.createScenarioConversation(scenarioId)
      → API: POST /api/conversations (Conversation作成)
      → API: POST /api/conversations/[id]/messages (初期メッセージ保存)
      → scenarioStore.setActiveNode(convId, scenario.start)
      → ローカル状態(Zustand)に会話と初期メッセージを追加
    → ScenarioSelector モーダルを閉じる
  → AppLayout: OptionButtons を表示（InputArea は非表示）
```

### 選択肢クリックフロー

```
ユーザー: 選択肢ボタンクリック
  → useScenario.selectOption(option)
    → chatStore.addMessage(convId, { role: 'user', content: option.label })
    → 次のノード取得: scenario.nodes[option.next]
    → scenarioStore.setActiveNode(convId, option.next)
    → chatStore.addMessage(convId, { role: 'assistant', content: nextNode.message })
  → OptionButtons: 新しいノードの選択肢を表示
```

### 終端ノード到達フロー

```
終端ノード到達（terminal: true または option.next が null）
  → OptionButtons: 終了メッセージと「最初からやり直す」ボタンを表示
  → 「最初からやり直す」クリック
    → scenarioStore.setActiveNode(convId, scenario.start)
    → addMessage(convId, { role: 'assistant', content: startNode.message })
```

---

## 7. ファイル構成

```
src/
├── types/
│   ├── index.ts              # Conversation型に scenarioId?: string を追加
│   └── scenario.ts           # Scenario, ScenarioNode, ScenarioOption 型定義
├── scenarios/
│   ├── index.ts              # YAML読み込み・エクスポート
│   ├── customer-support.yaml # カスタマーサポートシナリオ
│   ├── restaurant-order.yaml # レストラン注文シナリオ
│   ├── ui-artifact.yaml      # UIアーティファクトデモ
│   ├── ui-code.yaml          # UIコードブロックデモ
│   └── ui-markdown.yaml      # UIマークダウンデモ
├── lib/
│   └── scenarioParser.ts     # YAML文字列 → Scenario オブジェクト変換
├── stores/
│   ├── chatStore.ts          # createScenarioConversation を追加
│   └── scenarioStore.ts      # activeNodes 管理
├── hooks/
│   └── useScenario.ts        # シナリオ操作ロジック
└── components/
    ├── scenario/
    │   ├── OptionButtons.tsx  # 選択肢ボタン一覧
    │   └── ScenarioSelector.tsx # シナリオ選択モーダル
    └── layout/
        ├── AppLayout.tsx     # OptionButtons/InputArea 切替
        └── Sidebar.tsx       # 「デモエージェント」ボタン追加

docs/
└── demo-agent-design.md      # 本設計書

外部依存:
└── js-yaml                   # YAMLパース用ライブラリ
```

---

## 8. 依存関係

| パッケージ | バージョン | 用途 |
|----------|----------|------|
| `js-yaml` | ^4.x | YAML文字列のパース |
| `@types/js-yaml` | ^4.x | TypeScript型定義（devDependency） |

Next.js (Webpack) の `asset/source` rule を `next.config.ts` に設定し、`.yaml` ファイルを直接文字列としてインポートできるようにしている。

```typescript
// next.config.ts
config.module.rules.push({
  test: /\.ya?ml$/,
  type: 'asset/source',
});
```

---

## 9. 拡張方法

### 新しいシナリオの追加

1. `src/scenarios/my-scenario.yaml` を作成（YAML仕様に従う）
2. `src/scenarios/index.ts` に追加:

```typescript
import myScenarioRaw from './my-scenario.yaml';
// ...
export const SCENARIOS: Scenario[] = [
  parseScenario(customerSupportRaw),
  parseScenario(restaurantOrderRaw),
  parseScenario(myScenarioRaw),  // ← 追加
];
```

### 将来的な拡張案

- **変数補間**: メッセージ中に `{name}` などのプレースホルダーを使って動的なメッセージを生成
- **条件分岐**: セッション変数を使ったより複雑な分岐ロジック
- **タイマー**: 一定時間後に自動的に次のノードへ進む
- **外部API連携**: 特定のノードでAPIを呼び出してメッセージを動的生成
- **Claude API連携**: 終端ノードから通常チャットモードへシームレスに移行
