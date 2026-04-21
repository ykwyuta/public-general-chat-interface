import type { TaskMessage } from '../../types/task';
import { stripArtifactBlocks } from '../../lib/artifactParser';

interface Props {
  message: TaskMessage;
  currentUsername: string;
}

export function TaskMessageItem({ message, currentUsername }: Props) {
  if (message.senderType === 'system') {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs px-3 py-1 rounded-full" style={{ color: 'var(--text-muted)', background: 'var(--border)' }}>
          {message.content}
        </span>
      </div>
    );
  }

  const isSelf = message.senderType === 'human' && message.senderName === currentUsername;
  const isLlm = message.senderType === 'llm';
  const displayContent = isLlm ? stripArtifactBlocks(message.content) : message.content;

  return (
    <div className={`flex gap-2 mb-3 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-1"
        style={{
          background: isLlm ? '#7C3AED' : isSelf ? 'var(--accent)' : '#6B7280',
          color: '#fff',
        }}
        title={message.senderName}
      >
        {isLlm ? '🤖' : message.senderName[0]?.toUpperCase()}
      </div>

      <div className={`max-w-[70%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          {!isSelf && <span className="font-medium">{message.senderName}</span>}
          {message.toName && (
            <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--border)' }}>
              → @{message.toName.replace(',', ', @')}
            </span>
          )}
        </div>
        <div
          className="rounded-2xl text-sm overflow-hidden"
          style={{
            background: isLlm
              ? 'rgba(124, 58, 237, 0.1)'
              : isSelf
                ? 'var(--accent)'
                : 'var(--border)',
            color: isSelf ? '#fff' : 'var(--text)',
            borderTopRightRadius: isSelf ? 4 : undefined,
            borderTopLeftRadius: isSelf ? undefined : 4,
          }}
        >
          {message.images && message.images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2">
              {message.images.map(img => (
                <img
                  key={img.id}
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={img.name}
                  className="rounded-lg object-contain"
                  style={{ maxWidth: 180, maxHeight: 180 }}
                />
              ))}
            </div>
          )}
          {(displayContent || (!isLlm && !message.images?.length)) && (
            <div className="px-3 py-2 whitespace-pre-wrap break-words">
              {displayContent || (isLlm ? <span style={{ opacity: 0.5 }}>(アーティファクトのみ)</span> : null)}
            </div>
          )}
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {new Date(message.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
