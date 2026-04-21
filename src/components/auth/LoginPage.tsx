'use client';

import { useEffect, useState } from 'react';
import { DemoLoginForm } from './DemoLoginForm';
import { GoogleLoginButton } from './GoogleLoginButton';

export function LoginPage() {
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then((d: { googleEnabled?: boolean }) => setGoogleEnabled(!!d.googleEnabled))
      .catch(() => {});
  }, []);

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
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text)' }}>
            General Chat Interface
          </h1>
        </div>

        <div
          className="rounded-xl p-6 border flex flex-col gap-4"
          style={{
            background: 'var(--sidebar-bg)',
            borderColor: 'var(--border)',
          }}
        >
          <DemoLoginForm />

          {googleEnabled && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  または
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>
              <GoogleLoginButton />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
