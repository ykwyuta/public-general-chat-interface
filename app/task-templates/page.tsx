'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Play, Users } from 'lucide-react';
import { useTaskTemplateStore } from '../../src/stores/taskTemplateStore';
import { useTaskStore } from '../../src/stores/taskStore';
import { TaskTemplateModal } from '../../src/components/task/TaskTemplateModal';
import type { TaskTemplate } from '../../src/types/taskTemplate';

export default function TaskTemplatesPage() {
  const router = useRouter();
  const { templates, isLoading, loadTemplates, deleteTemplate, applyTemplate } = useTaskTemplateStore();
  const { loadTasks } = useTaskStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TaskTemplate | undefined>(undefined);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { loadTemplates(); }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('このテンプレートを削除しますか？')) return;
    try {
      await deleteTemplate(id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleApply = async (id: string) => {
    setApplyingId(id);
    setError('');
    try {
      const task = await applyTemplate(id);
      await loadTasks();
      router.push(`/tasks/${task.id}`);
    } catch (e) {
      setError((e as Error).message);
      setApplyingId(null);
    }
  };

  const openCreate = () => { setEditTarget(undefined); setModalOpen(true); };
  const openEdit = (t: TaskTemplate) => { setEditTarget(t); setModalOpen(true); };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>タスクテンプレート</h1>
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
                    {t.title && (
                      <p className="text-xs mt-1 truncate" style={{ color: 'var(--text)' }}>タイトル: {t.title}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <Users size={11} />
                      <span>{t.participants.length}名</span>
                      {t.participants.slice(0, 3).map(p => (
                        <span key={p.id} className="px-1.5 py-0.5 rounded" style={{ background: 'var(--border)' }}>
                          {p.participantType === 'human' ? `@${p.username}` : `🤖 ${p.agentName}`}
                        </span>
                      ))}
                      {t.participants.length > 3 && <span>+{t.participants.length - 3}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleApply(t.id)}
                      disabled={applyingId === t.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                      style={{ background: 'var(--accent)', color: '#fff', opacity: applyingId === t.id ? 0.6 : 1 }}
                      title="このテンプレートでタスクを作成"
                    >
                      <Play size={11} />
                      {applyingId === t.id ? '作成中…' : '作成'}
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
        <TaskTemplateModal
          template={editTarget}
          onClose={() => setModalOpen(false)}
          onSaved={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
