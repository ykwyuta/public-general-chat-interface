'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, FileText, Bot, MessageSquarePlus } from 'lucide-react';
import { useChatTemplateStore } from '@/stores/chatTemplateStore';
import { useChatStore } from '@/stores/chatStore';
import { useMcpStore } from '@/stores/mcpStore';
import { useConversations } from '@/hooks/useConversations';
import { ChatTemplateModal } from '@/components/chat/ChatTemplateModal';
import type { ChatTemplate } from '@/types/chatTemplate';

export default function ChatTemplatesPage() {
  const router = useRouter();
  const { templates, isLoading, loadTemplates, deleteTemplate, applyTemplate } = useChatTemplateStore();
  const { createConversation } = useConversations();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ChatTemplate | undefined>(undefined);
  const [error, setError] = useState('');
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const handleDelete = async (id: string) => {
    if (!confirm('このテンプレートを削除しますか？')) return;
    try {
      await deleteTemplate(id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleStartChat = async (templateId: string) => {
    setStartingId(templateId);
    setError('');
    try {
      const convId = await createConversation();
      const { welcomeMessage, systemPrompt, mcpServers } = await applyTemplate(templateId, convId);

      useChatStore.getState().updateSettings({ systemPrompt });
      useMcpStore.getState().setSelectedServerIds(mcpServers ?? []);

      if (welcomeMessage) {
        useChatStore.getState().addMessage(convId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          artifacts: [],
          timestamp: new Date(),
          content: welcomeMessage,
        });
      }

      router.push('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStartingId(null);
    }
  };

  const openCreate = () => { setEditTarget(undefined); setModalOpen(true); };
  const openEdit = (t: ChatTemplate) => { setEditTarget(t); setModalOpen(true); };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>チャットテンプレート</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Plus size={14} /> 新しいテンプレート
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded mb-3">{error}</p>}

        {isLoading ? (
          <p className="text-sm text-center py-20" style={{ color: 'var(--text-muted)' }}>読み込み中…</p>
        ) : templates.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>テンプレートがありません</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>「新しいテンプレート」ボタンで作成してください</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-w-2xl mx-auto">
            {templates.map(t => (
              <div
                key={t.id}
                className="px-4 py-3 rounded-xl border"
                style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm" style={{ color: 'var(--text)' }}>{t.name}</div>
                    {t.description && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <div className="flex items-center gap-1">
                        <Bot size={12} />
                        <span>MCP: {t.mcpServers?.length || 0}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText size={12} />
                        <span>ファイル: {t.files?.length || 0}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Start chat button */}
                    <button
                      onClick={() => handleStartChat(t.id)}
                      disabled={startingId === t.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity"
                      style={{
                        background: 'var(--accent)',
                        color: '#fff',
                        opacity: startingId === t.id ? 0.6 : 1,
                      }}
                      title="このテンプレートでチャットを開始"
                    >
                      <MessageSquarePlus size={13} />
                      {startingId === t.id ? '開始中…' : 'チャット開始'}
                    </button>
                    <button
                      onClick={() => openEdit(t)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                      title="編集"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: 'var(--text-muted)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                      title="削除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <ChatTemplateModal
          template={editTarget}
          onClose={() => setModalOpen(false)}
          onSaved={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
