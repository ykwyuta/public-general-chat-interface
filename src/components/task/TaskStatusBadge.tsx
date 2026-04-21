import type { TaskStatus } from '../../types/task';

const STATUS_LABEL: Record<TaskStatus, string> = {
  draft: '準備中',
  active: '進行中',
  completed: '完了',
  cancelled: 'キャンセル',
};

const STATUS_COLOR: Record<TaskStatus, string> = {
  draft: '#6B7280',
  active: '#10B981',
  completed: '#3B82F6',
  cancelled: '#EF4444',
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
      style={{ background: STATUS_COLOR[status] }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
