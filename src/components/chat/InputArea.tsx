'use client';

import { useRef, useState, useEffect } from 'react';
import { Send, Square, ImagePlus, X, Wrench, ChevronDown, Settings } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import { useChatStore } from '../../stores/chatStore';
import { useMcpStore } from '../../stores/mcpStore';

import { useAuthStore } from '../../stores/authStore';
import type { ImageAttachment, Artifact } from '../../types';
import type { GoogleUser } from '../../lib/db';


interface InputAreaProps {
  conversationId: string;
}

export function InputArea({ conversationId }: InputAreaProps) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [showMcpMenu, setShowMcpMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mcpMenuRef = useRef<HTMLDivElement>(null);
  const { sendMessage } = useChat();
  const { isStreaming, getActiveConversation } = useChatStore();
  const { servers, selectedServerIds, toggleSelectedServer, fetchServers } = useMcpStore();

  const [mentionQuery, setMentionQuery] = useState<{ type: 'user' | 'artifact'; text: string; startIndex: number } | null>(null);
  const [users, setUsers] = useState<GoogleUser[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => setUsers(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const conv = getActiveConversation();
    if (conv) {
      const allArtifacts = conv.messages.flatMap(m => m.artifacts);
      setArtifacts(allArtifacts);
    }
  }, [getActiveConversation]);

  const connectedServers = servers.filter(s => s.status === 'connected');
  const activeCount = selectedServerIds.filter(id =>
    connectedServers.some(s => s.id === id)
  ).length;

  useEffect(() => { fetchServers(); }, [fetchServers]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mcpMenuRef.current && !mcpMenuRef.current.contains(e.target as Node)) {
        setShowMcpMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setText(newText);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
    }

    if (ta) {
      const cursor = ta.selectionStart;
      const textBeforeCursor = newText.slice(0, cursor);

      const lastAt = textBeforeCursor.lastIndexOf('@');
      const lastHash = textBeforeCursor.lastIndexOf('#');

      let newQuery = null;

      if (lastAt !== -1 && lastAt > lastHash && (lastAt === 0 || textBeforeCursor[lastAt - 1] === ' ')) {
        const queryText = textBeforeCursor.slice(lastAt + 1);
        if (!/\s/.test(queryText)) {
          newQuery = { type: 'user' as const, text: queryText, startIndex: lastAt };
        }
      } else if (lastHash !== -1 && lastHash > lastAt && (lastHash === 0 || textBeforeCursor[lastHash - 1] === ' ')) {
        const queryText = textBeforeCursor.slice(lastHash + 1);
        if (!/\s/.test(queryText)) {
          newQuery = { type: 'artifact' as const, text: queryText, startIndex: lastHash };
        }
      }

      setMentionQuery(newQuery);
    }
  };

  const insertMention = (value: string) => {
    if (!mentionQuery) return;
    const prefix = text.slice(0, mentionQuery.startIndex);
    const suffix = text.slice(textareaRef.current?.selectionStart ?? text.length);
    const symbol = mentionQuery.type === 'user' ? '@' : '#';
    const newText = `${prefix}${symbol}${value} ${suffix}`;
    setText(newText);
    setMentionQuery(null);
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Need a small timeout to let React update the textarea value before moving cursor
      setTimeout(() => {
        const newCursorPos = prefix.length + 1 + value.length + 1;
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newImages: ImageAttachment[] = [];
    for (const file of files) {
      const data = await readFileAsBase64(file);
      newImages.push({
        id: crypto.randomUUID(),
        data,
        mediaType: file.type as ImageAttachment['mediaType'],
        name: file.name,
      });
    }
    setImages(prev => [...prev, ...newImages]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (id: string) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleSubmit = async () => {
    const msg = text.trim();
    if ((!msg && images.length === 0) || isStreaming) return;
    const imagesToSend = images;
    setText('');
    setImages([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await sendMessage(msg, conversationId, imagesToSend.length > 0 ? imagesToSend : undefined);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery) {
      if (e.key === 'Escape') {
        setMentionQuery(null);
        e.preventDefault();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      if (mentionQuery) {
        // Simple enter to submit while mention is open is confusing, but we don't have full kb nav here.
        // Let's just prevent default if they were trying to autocomplete (ideally we'd select first match)
        e.preventDefault();
        const filtered = mentionQuery.type === 'user'
          ? users.filter(u => u.username.toLowerCase().includes(mentionQuery.text.toLowerCase()) || u.displayName.toLowerCase().includes(mentionQuery.text.toLowerCase()))
          : artifacts.filter(a => a.filename.toLowerCase().includes(mentionQuery.text.toLowerCase()));

        if (filtered.length > 0) {
          const val = mentionQuery.type === 'user' ? (filtered[0] as GoogleUser).username : (filtered[0] as Artifact).filename;
          insertMention(val);
        }
        return;
      }

      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = (text.trim().length > 0 || images.length > 0) && !isStreaming;

  return (
    <div className="px-4 pb-4 pt-2" style={{ background: 'var(--bg)' }}>
      <div
        className="max-w-3xl mx-auto rounded-2xl border"
        style={{
          background: 'var(--bg)',
          borderColor: 'var(--border)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {images.map(img => (
              <div key={img.id} className="relative group/thumb">
                <img
                  src={`data:${img.mediaType};base64,${img.data}`}
                  alt={img.name}
                  className="w-16 h-16 object-cover rounded-lg"
                  style={{ border: '1px solid var(--border)' }}
                />
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                  style={{ background: 'var(--text)', color: 'var(--bg)' }}
                  title="削除"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 px-4 py-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isStreaming}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: isStreaming ? 'var(--border)' : 'var(--text-muted)' }}
            title="画像を添付"
          >
            <ImagePlus size={16} />
          </button>

          {/* MCP server selector */}
          <div className="relative flex-shrink-0" ref={mcpMenuRef}>
            <button
              onClick={() => setShowMcpMenu(v => !v)}
              disabled={isStreaming}
              className="flex items-center gap-1 px-2 h-8 rounded-lg text-xs transition-colors"
              style={{
                color: activeCount > 0 ? 'var(--accent)' : 'var(--text-muted)',
                background: activeCount > 0 ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                border: activeCount > 0 ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : '1px solid transparent',
              }}
              title="MCPサーバーを選択"
            >
              <Wrench size={13} />
              {activeCount > 0 && <span>{activeCount}</span>}
              <ChevronDown size={11} />
            </button>

            {showMcpMenu && (
              <div
                className="absolute bottom-full mb-1 left-0 rounded-xl shadow-lg z-10 min-w-48"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
              >
                <div className="px-3 py-2 text-xs font-medium" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  MCPサーバー
                </div>
                {connectedServers.length === 0 ? (
                  <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    接続中のサーバーがありません
                  </div>
                ) : (
                  connectedServers.map(server => {
                    const isSelected = selectedServerIds.includes(server.id);
                    return (
                      <button
                        key={server.id}
                        onClick={() => toggleSelectedServer(server.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors"
                        style={{ color: 'var(--text)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span
                          className="w-4 h-4 rounded flex items-center justify-center text-xs flex-shrink-0"
                          style={{
                            background: isSelected ? 'var(--accent)' : 'var(--border)',
                            color: isSelected ? '#fff' : 'transparent',
                          }}
                        >
                          ✓
                        </span>
                        <span className="flex-1 truncate">{server.name}</span>
                        <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {server.toolCount}ツール
                        </span>
                      </button>
                    );
                  })
                )}
                <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={() => {
                      setShowMcpMenu(false);
                      document.querySelector<HTMLButtonElement>('[data-settings-btn]')?.click();
                    }}
                    className="flex items-center gap-1.5 text-xs w-full"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Settings size={11} />
                    サーバーを管理...
                  </button>
                </div>
              </div>
            )}
          </div>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="メッセージを入力..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 resize-none text-sm outline-none bg-transparent"
            style={{
              color: 'var(--text)',
              minHeight: 24,
              maxHeight: 240,
              lineHeight: '1.5',
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{
              background: canSend ? 'var(--accent)' : 'var(--border)',
              color: canSend ? '#fff' : 'var(--text-muted)',
            }}
            title="送信 (Enter)"
          >
            {isStreaming ? <Square size={14} /> : <Send size={14} />}
          </button>
        </div>
      </div>
      <p className="text-center text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
        Enter で送信、Shift+Enter で改行
      </p>
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
