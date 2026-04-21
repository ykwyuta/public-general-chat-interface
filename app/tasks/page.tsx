'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useTaskStore } from '../../src/stores/taskStore';
import { useAuthStore } from '../../src/stores/authStore';
import { TaskStatusBadge } from '../../src/components/task/TaskStatusBadge';
import { TaskCreationModal } from '../../src/components/task/TaskCreationModal';

export default function TaskListPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { tasks, loadTasks } = useTaskStore();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => { loadTasks(); }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-base font-semibold" style={{ color: 'var(--text)' }}>タスク一覧</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          <Plus size={14} /> 新しいタスク
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tasks.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>タスクがありません</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>「新しいタスク」ボタンで作成してください</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-w-2xl mx-auto">
            {tasks.map(task => (
              <button
                key={task.id}
                onClick={() => router.push(`/tasks/${task.id}`)}
                className="w-full text-left px-4 py-3 rounded-xl border transition-colors"
                style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm flex-1 truncate">{task.title}</span>
                  <TaskStatusBadge status={task.status} />
                </div>
                <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{task.purpose}</p>
                <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>参加者 {task.participants.length}名</span>
                  <span>作成者: {task.createdBy}</span>
                  <span>{new Date(task.updatedAt).toLocaleDateString('ja-JP')}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <TaskCreationModal
          currentUsername={user?.username ?? ''}
          onClose={() => setModalOpen(false)}
          onCreated={(id) => { setModalOpen(false); router.push(`/tasks/${id}`); }}
        />
      )}
    </div>
  );
}
