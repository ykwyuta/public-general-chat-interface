import { useEffect, useRef } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { MessageItem } from './MessageItem';
import { useChat } from '../../hooks/useChat';

interface MessageListProps {
  conversationId: string;
}

export function MessageList({ conversationId }: MessageListProps) {
  const { conversations, isStreaming } = useChatStore();
  const { regenerateMessage, editAndResend } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversation = conversations.find(c => c.id === conversationId);
  const messages = conversation?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
        <p className="text-sm">メッセージを送信してください</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {messages.map((msg, idx) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isLast={idx === messages.length - 1}
            onRegenerate={
              msg.role === 'assistant' && idx === messages.length - 1
                ? () => regenerateMessage(msg.id)
                : undefined
            }
            onEdit={
              msg.role === 'user'
                ? (newContent) => editAndResend(msg.id, newContent)
                : undefined
            }
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
