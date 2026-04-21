'use client';

import { useState } from 'react';
import { authenticateDemo } from '../../lib/auth/demoAuth';
import { useAuthStore } from '../../stores/authStore';

export function DemoLoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await authenticateDemo(username, password);
      if (!user) {
        setError('ユーザー名またはパスワードが正しくありません');
        setPassword('');
      } else {
        await login(user, 'demo');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(message || '設定エラー: 管理者に連絡してください');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          ユーザー名
        </label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
          className="px-3 py-2 rounded-lg border text-sm"
          style={{
            background: 'var(--bg)',
            color: 'var(--text)',
            borderColor: 'var(--border)',
            outline: 'none',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          パスワード
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="px-3 py-2 rounded-lg border text-sm"
          style={{
            background: 'var(--bg)',
            color: 'var(--text)',
            borderColor: 'var(--border)',
            outline: 'none',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
      </div>

      {error && (
        <p className="text-sm" style={{ color: '#EF4444' }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity"
        style={{
          background: 'var(--accent)',
          color: '#fff',
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'ログイン中...' : 'ログイン'}
      </button>
    </form>
  );
}
