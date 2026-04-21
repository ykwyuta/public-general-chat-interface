import { useEffect, useRef } from 'react';
import { TaskMessageItem } from './TaskMessageItem';
import type { TaskMessage } from '../../types/task';

interface Props {
  messages: TaskMessage[];
  currentUsername: string;
  isPending?: boolean;
}

export function TaskMessageList({ messages, currentUsername, isPending }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isPending]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.length === 0 && (
        <p className="text-sm text-center py-12" style={{ color: 'var(--text-muted)' }}>
          メッセージがありません。@名前 で宛先を指定して送信してください。
        </p>
      )}

      {messages.map(msg => (
        <TaskMessageItem key={msg.id} message={msg} currentUsername={currentUsername} />
      ))}

      {isPending && (
        <div className="flex gap-2 mb-3 flex-row-reverse">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {currentUsername[0]?.toUpperCase()}
          </div>
          <div className="max-w-[70%] items-end flex flex-col gap-0.5">
            <div
              className="px-3 py-2 rounded-2xl text-sm flex items-center gap-1.5"
              style={{ background: 'var(--accent)', color: '#fff', borderTopRightRadius: 4, opacity: 0.6 }}
            >
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
