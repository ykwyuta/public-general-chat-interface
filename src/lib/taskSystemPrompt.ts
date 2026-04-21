import type { Task, LlmParticipant, HumanParticipant } from '../types/task';

export function buildSystemPrompt(task: Task, agentName: string, callerName?: string): string {
  const agent = task.participants.find(
    p => p.participantType === 'llm' && p.agentName === agentName,
  ) as LlmParticipant | undefined;

  const participantList = task.participants
    .map(p => {
      if (p.participantType === 'human') return `- @${(p as HumanParticipant).username}（人間）`;
      return `- @${p.agentName}（AIエージェント: ${p.agentRole}）`;
    })
    .join('\n');

  const callerSection = callerName
    ? `\n## 現在の指示者\n@${callerName} からの指示に応答してください。\n`
    : '';

  return `## タスク概要
${task.purpose}

## 完了条件
${task.completionCondition}

## あなたの役割
${agent?.agentRole ?? ''}

## 参加者一覧
${participantList}
${callerSection}
## 行動規則
- メッセージには @名前 で宛先を指定してください
- 宛先を指定しない場合は全参加者への発言になります
- タスクの完了条件を意識して会話を進めてください
- 各メッセージの先頭にある [送信者名] の表記で誰が発言したかを確認できます`;
}
