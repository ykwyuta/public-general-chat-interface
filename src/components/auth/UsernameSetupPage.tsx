'use client';

import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  email: string;
  googleDisplayName: string;
  suggestedUsername: string;
}

export function UsernameSetupPage({ email, googleDisplayName, suggestedUsername }: Props) {
  const [username, setUsername] = useState(suggestedUsername);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);

  const validate = (value: string) => {
    if (value.length < 2) return '2文字以上で入力してください';
    if (value.length > 30) return '30文字以内で入力してください';
    if (!/^[a-z0-9_]+$/.test(value)) return '半角英小文字・数字・アンダースコアのみ使用できます';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(username);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/google-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, displayName: googleDisplayName }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'エラーが発生しました');
        return;
      }
      await login({ username, displayName: googleDisplayName, email }, 'google');
    } catch {
      setError('ネットワークエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex h-screen items-center justify-center"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-sm px-4">
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            ✦
          </div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text)' }}>
            ようこそ
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {googleDisplayName} さん（{email}）
          </p>
        </div>

        <div
          className="rounded-xl p-6 border"
          style={{ background: 'var(--sidebar-bg)', borderColor: 'var(--border)' }}
        >
          <p className="text-sm mb-5" style={{ color: 'var(--text-muted)' }}>
            メンションなどに使うユーザー名を設定してください。あとから変更することはできません。
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                ユーザー名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase());
                  setError('');
                }}
                autoComplete="username"
                autoFocus
                placeholder="例: tanaka_taro"
                className="px-3 py-2 rounded-lg border text-sm"
                style={{
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  borderColor: error ? '#EF4444' : 'var(--border)',
                  outline: 'none',
                }}
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = error ? '#EF4444' : 'var(--accent)')
                }
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = error ? '#EF4444' : 'var(--border)')
                }
              />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                2〜30文字・半角英小文字・数字・アンダースコア
              </p>
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
              {loading ? '設定中...' : 'この名前で始める'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
