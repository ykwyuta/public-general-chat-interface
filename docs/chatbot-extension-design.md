# チャットボット動作確認環境拡張 設計書

## 1. 概要・目的

### 背景

既存の人工無脳（デモチャットボット）は YAML シナリオによる選択肢ベースの会話のみを提供する。実際の LLM API を呼び出すため、以下の 3 機能の動作確認は API キーがなければ行えない。

| 機能領域 | 現状 | 課題 |
|---------|------|------|
| **Tool機能** | Anthropic/Gemini/Bedrock API 経由でのみ動作 | ツール呼び出しループの UI・ロジックを単独で確認できない |
| **UI機能** | 実際の LLM 応答に依存 | マークダウン・アーティファクト等の各 UI コンポーネントを意図的・網羅的に確認できない |
| **タスク機能** | LLM エージェント応答が API 必須 | @メンション・リアルタイム SSE・エージェント応答を API なしで確認できない |

### 目的

人工無脳の仕組みを基盤として拡張し、API キー不要で以下を検証できる環境を整備する。

1. **Tool機能検証** — ツール呼び出し（`tool_use`）→ ツール実行 → 結果返却 → 最終回答のループ全体
2. **UI機能検証** — マークダウン・コードブロック・アーティファクト・ストリーミング表示等、各 UI コンポーネントの網羅的な確認
3. **タスク機能検証** — タスク作成・参加者管理・@メンションルーティング・SSE リアルタイム通信・LLM エージェント応答の一連フロー

### スコープ外

- LLM の応答品質・精度の評価（本設計は動作確認が目的）
- 自動化テスト・CI/CD への組み込み（手動確認環境として設計）
- 本番 LLM との完全な互換性保証

### 設計方針

| 方針 | 説明 |
|------|------|
| **既存資産の活用** | 人工無脳シナリオエンジン・`LLMProvider` インターフェース・タスク SSE 基盤をそのまま利用する |
| **API キー不要** | すべての検証シナリオが `ANTHROPIC_API_KEY` 等を設定しない状態で動作すること |
| **実挙動に近い再現** | 遅延付きストリーミング・ツール呼び出しループ等、実際の LLM 動作に近い体験をシミュレートする |
| **コードへの影響を最小化** | 既存の本番コードパスを変更せず、検証用モジュールを追加する形で実装する |

---

## 2. ScriptedProvider 設計

### 2.1 概要と位置づけ

`ScriptedProvider` は、事前定義スクリプトに従って応答を返すモック LLM プロバイダーである。既存の `LLMProvider` インターフェース（`src/lib/llm-provider.ts`）を実装するため、既存の `useChat.ts` のツール呼び出しループをそのまま通過する。

```
useChat.ts
    │
    ▼
getProvider('scripted') → ScriptedProvider   ← NEW
    │
    ▼  streamChat() → AsyncGenerator<StreamChunk>
    │
    ├── type: 'text'     （テキストチャンクをストリーミング）
    ├── type: 'tool_use' （ツール呼び出しをシミュレート）
    └── type: 'done'
```

### 2.2 スクリプト定義 YAML 仕様

スクリプトは `src/scenarios/scripts/` に YAML ファイルとして配置する。

```yaml
id: tool-single
name: "Tool確認：単一ツール呼び出し"
description: "ツール呼び出し → 結果取得 → 最終回答の基本ループを確認します"
category: tool

turns:
  - match: ".*"          # ユーザーメッセージへの正規表現マッチ
    steps:
      - type: text
        text: "天気を確認しています..."
      - type: tool_use
        tool_name: "get_weather"
        tool_input:
          location: "Tokyo"
        mock_result: "晴れ、気温22度、湿度60%"   # ツール実行結果をモック
      - type: text
        text: "東京の現在の天気は晴れで気温22度です。"

  - match: ".*"                # デフォルト（最後に定義、上から順にマッチ）
    steps:
      - type: text
        text: "こんにちは！何かお手伝いできますか？"
```

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `id` | ✓ | スクリプト識別子 |
| `name` | ✓ | 表示用名称 |
| `category` | | `tool` | `ui` | `task`（用途の識別用） |
| `turns[].match` | ✓ | ユーザーメッセージへの正規表現。上から順に評価し最初にマッチしたものを使用 |
| `turns[].steps` | ✓ | ステップリスト。順番に実行される |
| `step.type: text` | | テキスト応答。ストリーミング風に分割して yield |
| `step.type: tool_use` | | ツール呼び出しを発行。`mock_result` はツール実行結果として `useChat.ts` に返却 |
| `step.type: error` | | エラー応答をシミュレート |

### 2.3 ツール呼び出しループとの統合

`useChat.ts` のツール呼び出しループとの統合ポイント：

```
【1回目の streamChat 呼び出し】
ScriptedProvider:
  "天気を確認しています..." を yield（text）
  tool_use{get_weather, {location:"Tokyo"}} を yield（tool_use）

useChat.ts:
  tool_use を受け取る
  → ToolRegistry.executeTool("get_weather", ...) を呼ぼうとする
  → ScriptedProvider が登録した MockToolExecutor が mock_result を返す
  → tool_result メッセージを messages に追加して再ループ

【2回目の streamChat 呼び出し】
ScriptedProvider:
  messages 末尾に tool_result があることを検出
  → 同 turn の tool_use より後のステップ（最終テキスト）を yield
  "東京の現在の天気は晴れで気温22度です。" を yield
```

`tool_use` ステップが存在する turn では、`ScriptedProvider` は1回目と2回目の呼び出しを **turn 内のフェーズ** で区別する。フェーズ管理はインスタンス変数で保持する。

### 2.4 クラス・型定義

```typescript
// src/lib/providers/scripted.ts

export type ScriptedStep =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool_name: string; tool_input: Record<string, unknown>; mock_result: string }
  | { type: 'error'; error: string };

export interface ScriptedTurn {
  match: string;
  steps: ScriptedStep[];
}

export interface ProviderScript {
  id: string;
  name: string;
  description: string;
  category?: 'tool' | 'ui' | 'task';
  turns: ScriptedTurn[];
}

// Server-side script registry
const scriptRegistry = new Map<string, ProviderScript>();

export function registerScript(script: ProviderScript): void {
  scriptRegistry.set(script.id, script);
}

export class ScriptedProvider implements LLMProvider {
  readonly id = 'scripted';
  readonly name = 'Scripted Demo';

  async *streamChat(params: StreamChatParams): AsyncGenerator<StreamChunk> {
    const scriptId = params.model;
    const script = scriptRegistry.get(scriptId);

    // ... スクリプトからのターンとステップ抽出処理 ...

    for (const step of steps) {
      if (step.type === 'text') {
        yield* streamText(step.text);
      } else if (step.type === 'tool_use') {
        yield {
          type: 'tool_use',
          toolUse: {
            id: `scripted_${Date.now()}`,
            name: step.tool_name,
            input: step.tool_input,
          },
        };
      } else if (step.type === 'error') {
        yield { type: 'error', error: step.error };
        return;
      }
    }
    yield { type: 'done' };
  }

  async generateTitle(firstMessage: string): Promise<string> {
    return firstMessage.slice(0, 30) || 'デモ会話';
  }
}

/** スクリプト内の全 tool_use ステップから mock_result を集めて MockExecutor を生成する */
export function createMockExecutorFromScript(script: ProviderScript): (name: string, input: Record<string, unknown>) => string {
  // ... mock_result を取得する関数を返す
}
```

### 2.5 MockToolExecutor

`tool-registry.ts` の実際のツール実行の代わりに `mock_result` を返す executor。ScriptedProvider 使用時（UI操作時）に差し込む。
`src/lib/providers/scripted.ts` 内の `createMockExecutorFromScript` で生成し、`AppLayout.tsx` などでシナリオ開始時に `tool-registry.ts` の `setMockExecutor` に登録する。

### 2.6 プロバイダーの登録

```typescript
// src/lib/providers/index.ts
import { ScriptedProvider, registerScript } from './scripted';
import { SCRIPTS } from '../../scenarios/scripts/index';

// スクリプトをレジストリに登録（モジュール初期化時に1度だけ実行）
for (const script of SCRIPTS) {
  registerScript(script);
}

export function getProvider(providerId: string): LLMProvider {
  // ... scripted の場合は new ScriptedProvider() を返す
}
```

UI の設定モーダルで `provider: 'scripted'` を選択できるようにする。または人工無脳の「デモ開始」フローからスクリプト ID を指定して自動設定する。

---

## 3. Tool機能検証設計

### 3.1 検証対象

| 検証項目 | 対象コンポーネント |
|---------|-----------------|
| `tool_use` チャンクの受信と UI 表示 | `useChat.ts`, `MessageItem.tsx` |
| ツール実行（executor の呼び出し） | `tool-registry.ts` |
| ツール結果を含む再ループ | `useChat.ts` |
| 複数ツールの順次呼び出し | `useChat.ts` |
| ツール実行エラー時の表示 | `MessageItem.tsx` |
| ツール呼び出し中のストリーミング表示 | `chatStore.ts`, `MessageItem.tsx` |

### 3.2 検証シナリオ一覧

| シナリオ ID | スクリプトファイル | 検証内容 |
|-----------|----------------|---------|
| `tool-single` | `tool-single.yaml` | 単一ツール呼び出し → 結果表示 → 最終回答 |
| `tool-multiple` | `tool-multiple.yaml` | 1応答で2ツールを順次呼び出し |
| `tool-error` | `tool-error.yaml` | ツール実行エラー時の表示 |
| `tool-no-result` | `tool-no-result.yaml` | ツールを呼ばず純テキスト応答（比較用） |

### 3.3 各シナリオのスクリプト定義

**tool-single.yaml**（単一ツール呼び出し）
```yaml
id: tool-single
name: "Tool確認：単一ツール呼び出し"
description: "ツール呼び出し → 結果取得 → 最終回答の基本ループを確認します"
category: tool

turns:
  - match: ".*"
    steps:
      - type: text
        text: "現在時刻を確認します。"
      - type: tool_use
        tool_name: "get_current_time"
        tool_input:
          timezone: "Asia/Tokyo"
        mock_result: "2025-04-18T10:30:00+09:00"
      - type: text
        text: "現在の日本時間は 2025年4月18日 10時30分 です。"
```

**tool-multiple.yaml**（複数ツール順次呼び出し）
```yaml
id: tool-multiple
name: "Tool確認：複数ツール順次呼び出し"
description: "1応答で複数ツールを呼び出す順次実行ループを確認します"
category: tool

turns:
  - match: ".*"
    steps:
      - type: text
        text: "天気と為替レートを調べます。"
      - type: tool_use
        tool_name: "get_weather"
        tool_input: { location: "Tokyo" }
        mock_result: "晴れ、気温22度"
      - type: tool_use
        tool_name: "get_exchange_rate"
        tool_input: { from: "USD", to: "JPY" }
        mock_result: "1 USD = 155.2 JPY"
      - type: text
        text: "東京は晴れで22度、ドル円は155.2円です。"
```

**tool-error.yaml**（エラーケース）
```yaml
id: tool-error
name: "Tool確認：ツールエラー"
description: "ツール実行エラー時のエラー表示とリカバリーを確認します"
category: tool

turns:
  - match: ".*"
    steps:
      - type: tool_use
        tool_name: "get_weather"
        tool_input: { location: "Unknown" }
        mock_result: "__ERROR__: 場所が見つかりません"
      - type: text
        text: "申し訳ありません。指定された場所の天気情報を取得できませんでした。"
```

> `mock_result` が `__ERROR__:` で始まる場合、`MockToolExecutor` はエラーレスポンスとして返す。

### 3.4 UI 起動フロー

```
サイドバー「デモエージェント」
    ↓
ScenarioSelector モーダル
    ├── [既存] カスタマーサポート
    ├── [既存] レストラン注文
    └── [NEW] Tool機能デモ  ← type: 'scripted' として識別
            ↓ 選択
    settings.provider を 'scripted' に設定
    settings.scriptId を 'tool-single' に設定
    通常の InputArea でチャット開始（選択肢ボタンは不使用）
```

既存のシナリオ（選択肢ボタン方式）とは異なり、ScriptedProvider シナリオでは通常の InputArea をそのまま使用する。どんなメッセージを送っても YAML の `match` パターンに従って応答が返る。

### 3.5 `tool-registry.ts` への変更

既存のツール executor を ScriptedProvider 使用時にモックへ切り替えるための注入口を追加する。

```typescript
// src/lib/tool-registry.ts への追加（最小変更）

let mockExecutor: ((name: string, input: unknown) => string) | null = null;

export function setMockExecutor(fn: typeof mockExecutor) {
  mockExecutor = fn;
}

export async function executeTool(name: string, input: unknown): Promise<string> {
  if (mockExecutor) return mockExecutor(name, input);  // ← モック優先
  // 既存ロジック...
}
```

---

## 4. UI機能検証設計

### 4.1 検証対象

| 検証項目 | 対象コンポーネント |
|---------|-----------------|
| マークダウンレンダリング（見出し・リスト・テーブル・引用・太字など） | `MessageItem.tsx` |
| コードブロック（シンタックスハイライト・コピーボタン） | `MessageItem.tsx` |
| アーティファクト自動抽出 | `lib/artifactParser.ts`, `ArtifactPanel.tsx` |
| HTML/SVG アーティファクトのプレビュー | `ArtifactPreview.tsx` |
| ストリーミング表示（逐次テキスト表示） | `useChat.ts`, `chatStore.ts` |
| メッセージ編集・再生成 | `MessageItem.tsx` |
| 長文メッセージのスクロール | `MessageList.tsx` |
| ダークモード切替 | グローバル CSS |

### 4.2 設計方針

UI機能の検証は **既存の YAML シナリオ形式を拡張**して実現する。`ScriptedProvider` は使わず、人工無脳の「アシスタントメッセージを直接定義する」仕組みをそのまま活用する。

現在の YAML スキーマ（`node.message: string`）に対して、`message` にマークダウンやコードブロックを含む長文を書くだけで UI 検証用コンテンツを配信できる。追加のアーキテクチャ変更は不要。

### 4.3 検証シナリオ一覧

| シナリオ ID | ファイル | 検証内容 |
|-----------|---------|---------|
| `ui-markdown` | `ui-markdown.yaml` | 各種マークダウン要素の表示 |
| `ui-code` | `ui-code.yaml` | コードブロック・シンタックスハイライト |
| `ui-artifact` | `ui-artifact.yaml` | アーティファクト自動抽出とプレビュー |
| `ui-long` | `ui-long.yaml` | 長文メッセージのスクロール動作 |

### 4.4 各シナリオの YAML 定義

**ui-markdown.yaml**（マークダウン要素）
```yaml
id: ui-markdown
name: "UI確認：マークダウン"
description: "見出し・リスト・テーブル・引用・インラインコード等の表示確認"
start: showcase

nodes:
  showcase:
    message: |
      ## 見出しレベル2
      ### 見出しレベル3

      **太字**、*イタリック*、~~取り消し線~~、`インラインコード`

      - リスト項目1
      - リスト項目2
        - ネスト項目

      1. 番号付きリスト
      2. 2番目の項目

      > 引用文はこのように表示されます。
      > 複数行にわたる引用も可能です。

      | 列1 | 列2 | 列3 |
      |-----|-----|-----|
      | A   | B   | C   |
      | D   | E   | F   |
    options:
      - label: "コードブロックを確認する"
        next: null
```

**ui-artifact.yaml**（アーティファクト抽出・プレビュー）
```yaml
id: ui-artifact
name: "UI確認：アーティファクト"
description: "コードブロックからのアーティファクト抽出とHTML/SVGプレビューの確認"
start: html_preview

nodes:
  html_preview:
    message: |
      以下はHTMLのサンプルです。アーティファクトパネルでプレビューが表示されます。

      ```html
      <!DOCTYPE html>
      <html>
      <head><style>
        body { font-family: sans-serif; padding: 20px; }
        h1 { color: #4f46e5; }
      </style></head>
      <body>
        <h1>Hello, World!</h1>
        <p>アーティファクトプレビューのテストです。</p>
        <button onclick="alert('クリックされました')">クリック</button>
      </body>
      </html>
      ```
    options:
      - label: "SVGを確認する"
        next: svg_preview
      - label: "終了"
        next: null

  svg_preview:
    message: |
      SVGのサンプルです。

      ```svg
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="40" fill="#4f46e5" />
        <text x="50" y="55" text-anchor="middle" fill="white" font-size="12">SVG</text>
      </svg>
      ```
    terminal: true
    options:
      - label: "最初からやり直す"
        next: html_preview
```

### 4.5 ストリーミング表示の確認

既存のシナリオエンジンはメッセージを即時表示する（ストリーミングなし）。ストリーミング表示の確認には ScriptedProvider を使用し、`type: text` ステップで長文を 30ms 間隔のチャンクに分割して yield することで再現する。

```yaml
# src/scenarios/scripts/ui-streaming.yaml（ScriptedProvider 用）
id: ui-streaming
name: "UI確認：ストリーミング表示"
description: "テキストが逐次ストリーミング表示される様子を確認します"
category: ui

turns:
  - match: ".*"
    steps:
      - type: text
        text: |
          これはストリーミング表示のテストです。
          テキストが少しずつ表示されていく様子を確認してください。
          （以下、長文が続く...）
```

### 4.6 ScenarioSelector への追加

```
ScenarioSelector モーダル
├── [既存] カスタマーサポート        （type: 'scenario'）
├── [既存] レストラン注文            （type: 'scenario'）
├── [NEW]  UI確認：マークダウン      （type: 'scenario'）
├── [NEW]  UI確認：アーティファクト  （type: 'scenario'）
└── [NEW]  UI確認：ストリーミング    （type: 'scripted'）
```

---

## 5. タスク機能検証設計

### 5.1 検証対象

| 検証項目 | 対象コンポーネント |
|---------|-----------------|
| タスク作成フロー（タイトル・目的・完了条件の入力） | `TaskCreationModal.tsx` |
| 参加者追加（human / llm） | `TaskParticipantPanel.tsx` |
| タスク状態遷移（draft → active → completed） | `taskStore.ts`, `tasks/[id]/route.ts` |
| @メンション補完付き入力 | `TaskInputArea.tsx` |
| SSE リアルタイム通信（複数タブ間の同期） | `useTaskStream.ts`, `tasks/[id]/stream/route.ts` |
| LLM エージェント応答（@メンションによるトリガー） | `tasks/[id]/chat/route.ts` |
| メッセージ可視性（全体送信 / 限定送信） | `TaskMessageItem.tsx` |
| タスク完了・キャンセル操作 | `TaskRoomLayout.tsx` |

### 5.2 設計方針

タスク機能の LLM エージェント応答部分に `ScriptedProvider` を差し込む。タスク作成・参加者管理・SSE・@メンション等の UI/API ロジックは実装済みのものをそのまま使用し、エージェント応答のみをモックに置き換える。

```
POST /api/tasks/[id]/messages （@エージェント名）
    ↓
tasks/[id]/chat/route.ts
    ↓
getProvider(agent.provider)  ← agent.provider === 'scripted' の場合
    ↓
ScriptedProvider.streamChat()  ← スクリプト定義に従って応答
```

### 5.3 デモタスクテンプレート

タスク機能の検証を素早く開始できるよう、「デモタスクを作成」ボタンから以下の設定が自動投入されるテンプレートを用意する。

```typescript
// src/lib/demo-task-template.ts

export const DEMO_TASK_TEMPLATE = {
  title: "新製品のリリース計画レビュー",
  purpose: "来月リリース予定の新製品について、マーケティング戦略と技術的な課題を整理し、リリース判断を下す。",
  completionCondition: "マーケティング担当（@marketing）と技術担当（@tech）の両エージェントから承認コメントが得られること。",
  participants: [
    {
      participantType: 'llm' as const,
      agentName: "marketing",
      agentRole: "マーケティング担当。製品の市場投入戦略・訴求ポイント・競合分析の観点でアドバイスする。",
      provider: "scripted",
      model: "task-marketing",
    },
    {
      participantType: 'llm' as const,
      agentName: "tech",
      agentRole: "技術担当。実装の実現可能性・技術的リスク・工数見積もりの観点でアドバイスする。",
      provider: "scripted",
      model: "task-tech",
    },
  ],
};
```

### 5.4 デモエージェント用スクリプト定義

```yaml
# src/scenarios/scripts/task-marketing.yaml
id: task-marketing
name: "タスクエージェント：マーケティング担当"
description: "タスク機能検証用のマーケティングエージェント応答スクリプト"
category: task

turns:
  - match: ".*競合.*|.*市場.*"
    steps:
      - type: text
        text: |
          競合分析の観点からコメントします。

          **市場ポジショニング**
          - 既存製品との差別化ポイントを明確にする必要があります
          - ターゲット層は30〜40代のビジネスユーザーが最適と考えます

          リリース前に競合他社の動向を再確認することをお勧めします。

  - match: ".*"
    steps:
      - type: text
        text: |
          マーケティング観点からの初期見解をお伝えします。

          製品の強みを前面に出したメッセージングと、段階的なリリース戦略を推奨します。
          詳細な訴求ポイントについては @tech との連携も必要です。
```

```yaml
# src/scenarios/scripts/task-tech.yaml
id: task-tech
name: "タスクエージェント：技術担当"
description: "タスク機能検証用の技術エージェント応答スクリプト"
category: task

turns:
  - match: ".*実装.*|.*工数.*"
    steps:
      - type: text
        text: |
          技術面での懸念点をお伝えします。

          **工数見積もり**
          | 項目 | 見積もり |
          |------|---------|
          | バックエンド実装 | 3週間 |
          | フロントエンド実装 | 2週間 |
          | テスト・品質保証 | 1週間 |

          来月リリースはスケジュールとして**タイトです**。優先度の調整を検討してください。

  - match: ".*"
    steps:
      - type: text
        text: |
          技術的な観点から状況を確認しました。

          現状の実装では主要機能の提供は可能ですが、パフォーマンス最適化は
          リリース後の対応になります。@marketing と優先機能の合意が必要です。
```

### 5.5 スクリプトとエージェントの紐付け

`task_participants` テーブルの `model` フィールドにスクリプト ID を格納する。

```
agent.provider = 'scripted'
agent.model    = 'task-marketing'  ← スクリプト ID として使用
```

`tasks/[id]/chat/route.ts` は `provider === 'scripted'` の場合、`model` をスクリプト ID として `ScriptedProvider` を初期化する。

### 5.6 タスク機能検証フロー

```
1. サイドバー「+ 新規タスク」
    ↓
2. TaskCreationModal
   「デモタスクを作成」ボタン → DEMO_TASK_TEMPLATE を自動入力
    ↓
3. タスク作成 → draft 状態で /tasks/[id] へ遷移
    ↓
4. 「タスク開始」→ active 状態
    ↓
5. "@marketing リリース計画についてどう思いますか？" を送信
   → ScriptedProvider (task-marketing.yaml) が応答
    ↓
6. "@tech 工数はどのくらいかかりますか？" を送信
   → ScriptedProvider (task-tech.yaml) が応答
    ↓
7. 別タブで同じタスクを開き、SSE によるリアルタイム同期を確認
    ↓
8. 「タスク完了」で completed 状態へ遷移
```

---

## 6. ファイル構成・実装フェーズ

### 6.1 新規追加ファイル

```
src/
├── lib/
│   ├── providers/
│   │   └── scripted.ts              # ScriptedProvider クラス・型定義、MockToolExecutor 生成ロジック
│   └── demo-task-template.ts        # デモタスクテンプレート定義
├── scenarios/
│   ├── scripts/                     # ScriptedProvider 用スクリプト（新規ディレクトリ）
│   │   ├── index.ts                 # スクリプトの読み込みとエクスポート
│   │   ├── tool-single.yaml         # 単一ツール呼び出し検証
│   │   ├── tool-multiple.yaml       # 複数ツール順次呼び出し検証
│   │   ├── tool-error.yaml          # ツールエラー検証
│   │   ├── ui-streaming.yaml        # ストリーミング表示検証
│   │   ├── task-marketing.yaml      # タスク検証：マーケティングエージェント
│   │   └── task-tech.yaml           # タスク検証：技術エージェント
│   ├── ui-markdown.yaml             # UI検証：マークダウン（既存形式）
│   ├── ui-code.yaml                 # UI検証：コードブロック（既存形式）
│   └── ui-artifact.yaml             # UI検証：アーティファクト（既存形式）

docs/
└── chatbot-extension-design.md      # 本設計書
```

### 6.2 既存ファイルへの変更

| ファイル | 変更内容 | 影響範囲 |
|---------|---------|---------|
| `src/lib/tool-registry.ts` | `setMockExecutor()` / `executeTool()` にモック注入口を追加 | 既存ロジックは変更なし。`mockExecutor` が null の場合は従来通り動作 |
| `src/components/layout/AppLayout.tsx` | ScriptedProvider モード切り替え時に `setMockExecutor()` を呼び出してモックを注入するロジックを追加 | 既存チャット利用への影響なし |
| `src/lib/providers/index.ts` | `ScriptedProvider` の登録を追加 | 既存プロバイダーへの影響なし |
| `src/scenarios/index.ts` | UI検証用 YAML（`ui-*.yaml`）の読み込みを追加 | 既存シナリオへの影響なし |
| `src/components/scenario/ScenarioSelector.tsx` | ScriptedProvider シナリオ（type: `'scripted'`）の表示・起動処理を追加 | 既存シナリオの動作は変更なし |
| `src/components/task/TaskCreationModal.tsx` | 「デモタスクを作成」ボタンと `DEMO_TASK_TEMPLATE` の自動入力を追加 | 既存フォームへの影響なし |
| `app/api/tasks/[id]/chat/route.ts` | `provider === 'scripted'` の場合に `model` をスクリプト ID として使用する分岐を追加 | 既存の LLM 呼び出しロジックへの影響なし |

### 6.3 実装フェーズ

全体を3フェーズに分割し、各フェーズで独立して動作確認できる状態を維持する。

---

**フェーズ1: ScriptedProvider 基盤**

目標: `ScriptedProvider` を通常チャットで使えるようにする

| # | 作業内容 | 対象ファイル |
|---|---------|------------|
| 1 | `ScriptedProvider` クラスの実装 | `src/lib/providers/scripted.ts` |
| 2 | `MockToolExecutor` の実装 | `src/lib/providers/scripted.ts` |
| 3 | `tool-registry.ts` にモック注入口を追加、`AppLayout.tsx` での呼び出し | `src/lib/tool-registry.ts`, `src/components/layout/AppLayout.tsx`, `src/components/layout/TaskAppLayout.tsx` |
| 4 | プロバイダーレジストリへの登録 | `src/lib/providers/index.ts` |
| 5 | Tool検証用スクリプト YAML の作成 | `src/scenarios/scripts/tool-*.yaml` |

完了条件: 設定モーダルで `provider: scripted` を選択し、`tool-single` スクリプトでツール呼び出しループが動作すること

---

**フェーズ2: UI検証シナリオ**

目標: 既存シナリオエンジンに UI 検証シナリオを追加する

| # | 作業内容 | 対象ファイル |
|---|---------|------------|
| 1 | UI検証用 YAML シナリオの作成 | `src/scenarios/ui-*.yaml` |
| 2 | シナリオ登録 | `src/scenarios/index.ts` |
| 3 | `ScenarioSelector` に ScriptedProvider 型シナリオの対応を追加 | `ScenarioSelector.tsx` |
| 4 | ストリーミング検証スクリプトの作成 | `src/scenarios/scripts/ui-streaming.yaml` |

完了条件: ScenarioSelector から UI 検証シナリオを選択し、マークダウン・アーティファクト・ストリーミングが確認できること

---

**フェーズ3: タスク機能検証**

目標: ScriptedProvider をタスクのエージェント応答に組み込む

| # | 作業内容 | 対象ファイル |
|---|---------|------------|
| 1 | タスク用スクリプト YAML の作成 | `src/scenarios/scripts/task-*.yaml` |
| 2 | `tasks/[id]/chat/route.ts` に scripted プロバイダー対応を追加 | `app/api/tasks/[id]/chat/route.ts` |
| 3 | `DEMO_TASK_TEMPLATE` の定義 | `src/lib/demo-task-template.ts` |
| 4 | `TaskCreationModal` に「デモタスクを作成」ボタンを追加 | `TaskCreationModal.tsx` |

完了条件: デモタスクを作成し、@marketing / @tech へのメンションにスクリプト応答が返り、SSE でリアルタイム配信されること

### 6.4 フェーズ依存関係

```
フェーズ1（ScriptedProvider 基盤）
    ↓
フェーズ2（UI検証シナリオ）  ←─ フェーズ1完了後、並行実施可能
フェーズ3（タスク機能検証）  ←┘
```
