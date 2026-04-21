import type { TaskMessage } from '../types/task';
import type { ChatMessage, MessageContentBlock } from './llm-provider';

export function buildMessagesForAgent(messages: TaskMessage[], agentName: string): ChatMessage[] {
  return messages
    .filter(m => m.senderType !== 'system')
    .map(m => {
      const prefix = m.toName ? `[${m.senderName} → @${m.toName}] ` : `[${m.senderName}] `;
      const role = m.senderName === agentName ? 'assistant' : 'user';

      // 画像がある場合はコンテンツブロック形式で渡す（user メッセージのみ）
      if (role === 'user' && m.images && m.images.length > 0) {
        const blocks: MessageContentBlock[] = [
          ...m.images.map(img => ({
            type: 'image' as const,
            media_type: img.mediaType,
            data: img.data,
          })),
          { type: 'text' as const, text: prefix + m.content },
        ];
        return { role, content: blocks } satisfies ChatMessage;
      }

      return {
        role,
        content: prefix + m.content,
      } satisfies ChatMessage;
    });
}
