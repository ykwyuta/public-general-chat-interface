import type { TaskParticipant, HumanParticipant } from '../../types/task';

interface Props {
  participants: TaskParticipant[];
  createdBy: string;
  currentUsername: string;
  onRemove?: (participantId: string) => void;
  embedded?: boolean;
}

export function TaskParticipantPanel({ participants, createdBy, currentUsername, onRemove, embedded }: Props) {
  return (
    <aside
      className={`flex flex-col h-full ${embedded ? '' : 'border-l'}`}
      style={embedded
        ? { background: 'var(--sidebar-bg)' }
        : { width: 200, background: 'var(--sidebar-bg)', borderColor: 'var(--border)', flexShrink: 0 }}
    >
      {!embedded && (
        <div className="p-3 border-b text-sm font-medium" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>
          参加者 ({participants.length})
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
        {participants.map(p => {
          const name = p.participantType === 'human' ? (p as HumanParticipant).username : p.agentName;
          const displayName = p.participantType === 'human' ? (p as HumanParticipant).displayName : p.agentName;
          const isLlm = p.participantType === 'llm';
          const isCreator = p.participantType === 'human' && (p as HumanParticipant).username === createdBy;
          const isSelf = p.participantType === 'human' && (p as HumanParticipant).username === currentUsername;
          const canDelete = currentUsername === createdBy && !isCreator;

          return (
            <div
              key={p.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg group"
              style={{ background: isSelf ? 'var(--border)' : 'transparent' }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                style={{ background: isLlm ? '#7C3AED' : '#6B7280', color: '#fff' }}
              >
                {isLlm ? '🤖' : displayName[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: 'var(--text)' }} title={displayName}>
                  {displayName}
                  {isCreator && <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>👑</span>}
                </div>
                {p.canTerminate && (
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>終了権限あり</div>
                )}
                {isLlm && (
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }} title={p.agentRole}>
                    {p.provider}
                  </div>
                )}
              </div>
              {canDelete && onRemove && (
                <button
                  onClick={() => onRemove(p.id)}
                  className="text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: '#EF4444' }}
                  title={`${name} を削除`}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
