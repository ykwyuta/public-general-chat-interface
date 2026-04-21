import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, Check, RefreshCw, Pencil } from 'lucide-react';
import type { Message } from '../../types';
import { useChatStore } from '../../stores/chatStore';
import { stripArtifactBlocks } from '../../lib/artifactParser';

interface MessageItemProps {
  message: Message;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
  isLast?: boolean;
}

export function MessageItem({ message, onRegenerate, onEdit, isLast }: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const { isStreaming, streamingMessageId } = useChatStore();
  const isCurrentlyStreaming = isStreaming && streamingMessageId === message.id;

  const displayContent = message.role === 'assistant'
    ? stripArtifactBlocks(message.content)
    : message.content;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEditSubmit = () => {
    if (editText.trim() && onEdit) {
      onEdit(editText.trim());
    }
    setEditing(false);
  };

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-4 group">
        <div className="max-w-[80%] relative">
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl text-sm resize-none"
                style={{
                  background: 'var(--user-msg-bg)',
                  color: 'var(--text)',
                  border: '2px solid var(--accent)',
                  minWidth: 240,
                  minHeight: 80,
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
                  if (e.key === 'Escape') setEditing(false);
                }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-1 text-xs rounded-md"
                  style={{ color: 'var(--text-muted)', background: 'var(--border)' }}
                >
                  キャンセル
                </button>
                <button
                  onClick={handleEditSubmit}
                  className="px-3 py-1 text-xs rounded-md"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  送信
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                style={{ background: 'var(--user-msg-bg)', color: 'var(--text)' }}
              >
                {message.images && message.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {message.images.map(img => (
                      <img
                        key={img.id}
                        src={`data:${img.mediaType};base64,${img.data}`}
                        alt={img.name}
                        className="rounded-lg object-contain"
                        style={{ maxWidth: 200, maxHeight: 200 }}
                      />
                    ))}
                  </div>
                )}
                {message.content && (
                  <span className="whitespace-pre-wrap">{message.content}</span>
                )}
              </div>
              <div className="absolute -left-16 top-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onEdit && (
                  <button
                    onClick={() => { setEditing(true); setEditText(message.content); }}
                    className="p-1.5 rounded-md transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    title="編集"
                  >
                    <Pencil size={14} />
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  title="コピー"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="mb-4 group">
      <div className="flex items-start gap-3">
        <div
          className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          ✦
        </div>
        <div className="flex-1 min-w-0">
          {isCurrentlyStreaming && displayContent === '' ? (
            <div className="flex gap-1 items-center py-2">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    background: 'var(--text-muted)',
                    animationDelay: `${i * 0.15}s`,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="markdown-body text-sm leading-relaxed">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  pre: ({ children, ...props }) => (
                    <div className="relative group/code">
                      <pre
                        {...props}
                        style={{ background: '#1e1e2e', borderRadius: 8, padding: '1em', overflowX: 'auto' }}
                      >
                        {children}
                      </pre>
                    </div>
                  ),
                  code: ({ className, children, ...props }: React.ComponentProps<'code'> & { inline?: boolean }) => {
                    const isBlock = className?.includes('language-');
                    if (!isBlock) {
                      return (
                        <code
                          {...props}
                          className={className}
                          style={{
                            background: 'rgba(0,0,0,0.08)',
                            borderRadius: 3,
                            padding: '0.1em 0.3em',
                            fontSize: '0.875em',
                            fontFamily: 'ui-monospace, monospace',
                          }}
                        >
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code {...props} className={className}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {displayContent}
              </ReactMarkdown>
            </div>
          )}

          {!isCurrentlyStreaming && (
            <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-md transition-colors flex items-center gap-1 text-xs"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="コピー"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
              {isLast && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  className="p-1.5 rounded-md transition-colors flex items-center gap-1 text-xs"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  title="再生成"
                >
                  <RefreshCw size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
