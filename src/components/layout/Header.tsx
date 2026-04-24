import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { useAvailableModels } from '../../hooks/useAvailableModels';
import { Sun, Moon, LogOut } from 'lucide-react';
import { NotificationPanel } from '../notification/NotificationPanel';

export function Header() {
  const { settings, updateSettings } = useChatStore();
  const { user, logout } = useAuthStore();
  const { models } = useAvailableModels();

  return (
    <header
      className="flex items-center justify-between px-4 py-3 border-b"
      style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}
    >
      <select
        value={JSON.stringify({ provider: settings.provider, model: settings.model })}
        onChange={e => {
          try {
            const { provider: newProvider, model: newModelId } = JSON.parse(e.target.value);
            if (newProvider && newModelId) {
              updateSettings({ model: newModelId, provider: newProvider });
            }
          } catch (error) {
            console.error('Failed to parse model selection', error);
          }
        }}
        className="text-sm px-2 py-1 rounded-md border"
        style={{
          background: 'var(--bg)',
          color: 'var(--text)',
          borderColor: 'var(--border)',
        }}
      >
        {models.map(m => (
          <option key={`${m.provider}:${m.id}`} value={JSON.stringify({ provider: m.provider, model: m.id })}>
            {m.name} ({m.provider})
          </option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <NotificationPanel />

        {user && (
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {user.displayName}
          </span>
        )}

        <button
          onClick={() => updateSettings({ theme: settings.theme === 'light' ? 'dark' : 'light' })}
          className="p-2 rounded-md transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          title="テーマ切り替え"
        >
          {settings.theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {user && (
          <button
            onClick={logout}
            className="p-2 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            title="ログアウト"
          >
            <LogOut size={18} />
          </button>
        )}
      </div>
    </header>
  );
}
