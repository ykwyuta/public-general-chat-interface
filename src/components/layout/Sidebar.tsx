import { useState } from 'react';
import { MessageSquare, Plus, Trash2, Settings, Bot, ListTodo, Layers } from 'lucide-react';
import { useConversations } from '../../hooks/useConversations';
import { useRouter, usePathname } from 'next/navigation';
import type { Conversation } from '../../types';

interface SidebarProps {
  onSettingsClick: () => void;
  onNewChat: () => void;
  onDemoAgentClick: () => void;
}

export function Sidebar({ onSettingsClick, onNewChat, onDemoAgentClick }: SidebarProps) {
  const { conversations, activeConversationId, deleteConversation, setActiveConversation } =
    useConversations();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteConversation(id);
  };

  const grouped = groupByDate(conversations);

  return (
    <aside
      className="flex flex-col h-full select-none"
      style={{ width: 240, background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border)', flexShrink: 0 }}
    >
      <div className="p-3 flex flex-col gap-1">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ color: 'var(--text)', background: 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Plus size={16} />
          新しいチャット
        </button>
        <button
          onClick={onDemoAgentClick}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ color: 'var(--text)', background: 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Bot size={16} style={{ color: 'var(--accent)' }} />
          デモエージェント
        </button>
        <button
          onClick={() => router.push('/tasks')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            color: 'var(--text)',
            background: pathname === '/tasks' || pathname?.startsWith('/tasks/') ? 'var(--border)' : 'transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => {
            if (pathname !== '/tasks' && !pathname?.startsWith('/tasks/')) e.currentTarget.style.background = 'transparent';
          }}
        >
          <ListTodo size={16} style={{ color: 'var(--accent)' }} />
          タスク
        </button>
        <button
          onClick={() => router.push('/task-templates')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            color: 'var(--text)',
            background: pathname?.startsWith('/task-templates') ? 'var(--border)' : 'transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => {
            if (!pathname?.startsWith('/task-templates')) e.currentTarget.style.background = 'transparent';
          }}
        >
          <Layers size={16} style={{ color: 'var(--accent)' }} />
          テンプレート
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {grouped.map(([label, convs]) => (
          <div key={label}>
            <div
              className="px-2 py-1 text-xs font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              {label}
            </div>
            {convs.map((conv: Conversation) => (
              <div
                key={conv.id}
                className="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mb-0.5 transition-colors relative"
                style={{
                  background: activeConversationId === conv.id ? 'var(--border)' : 'transparent',
                  color: 'var(--text)',
                }}
                onMouseEnter={e => {
                  setHoveredId(conv.id);
                  if (activeConversationId !== conv.id)
                    e.currentTarget.style.background = 'rgba(0,0,0,0.04)';
                }}
                onMouseLeave={e => {
                  setHoveredId(null);
                  if (activeConversationId !== conv.id)
                    e.currentTarget.style.background = 'transparent';
                }}
                onClick={() => {
                  setActiveConversation(conv.id);
                  if (pathname?.startsWith('/tasks')) router.push('/');
                }}
              >
                {conv.scenarioId ? (
                  <Bot size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                ) : (
                  <MessageSquare size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                )}
                <span
                  className="flex-1 text-sm truncate"
                  title={conv.title}
                >
                  {conv.title}
                </span>
                {hoveredId === conv.id && (
                  <button
                    onClick={e => handleDelete(e, conv.id)}
                    className="flex-shrink-0 p-1 rounded transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    title="削除"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
        {conversations.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
            会話がありません
          </p>
        )}
      </div>

      <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          onClick={onSettingsClick}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
          style={{ color: 'var(--text)', background: 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Settings size={16} />
          設定
        </button>
      </div>
    </aside>
  );
}

function groupByDate(conversations: Conversation[]): [string, Conversation[]][] {
  const now = new Date();
  const today: Conversation[] = [];
  const yesterday: Conversation[] = [];
  const week: Conversation[] = [];
  const older: Conversation[] = [];

  for (const c of conversations) {
    const d = new Date(c.updatedAt);
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) today.push(c);
    else if (diff < 172800000) yesterday.push(c);
    else if (diff < 604800000) week.push(c);
    else older.push(c);
  }

  const result: [string, Conversation[]][] = [];
  if (today.length) result.push(['今日', today]);
  if (yesterday.length) result.push(['昨日', yesterday]);
  if (week.length) result.push(['過去7日間', week]);
  if (older.length) result.push(['それ以前', older]);
  return result;
}
