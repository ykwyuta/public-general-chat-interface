export const DEMO_TASK_TEMPLATE = {
  title: '新製品のリリース計画レビュー',
  purpose:
    '来月リリース予定の新製品について、マーケティング戦略と技術的な課題を整理し、リリース判断を下す。',
  completionCondition:
    'マーケティング担当（@marketing）と技術担当（@tech）の両エージェントから承認コメントが得られること。',
  participants: [
    {
      participantType: 'llm' as const,
      agentName: 'marketing',
      agentRole:
        'マーケティング担当。製品の市場投入戦略・訴求ポイント・競合分析の観点でアドバイスする。',
      provider: 'scripted',
      model: 'task-marketing',
    },
    {
      participantType: 'llm' as const,
      agentName: 'tech',
      agentRole:
        '技術担当。実装の実現可能性・技術的リスク・工数見積もりの観点でアドバイスする。',
      provider: 'scripted',
      model: 'task-tech',
    },
  ],
} as const;
