'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useAuthStore } from '../../stores/authStore';
import { LoginPage } from './LoginPage';
import { UsernameSetupPage } from './UsernameSetupPage';
import { AppLayout } from '../layout/AppLayout';

type AuthFlow = 'loading' | 'unauthenticated' | 'setup-username' | 'authenticated';

interface GoogleSetupInfo {
  email: string;
  googleDisplayName: string;
  suggestedUsername: string;
}

export function AuthGuard() {
  const [flow, setFlow] = useState<AuthFlow>('loading');
  const [setupInfo, setSetupInfo] = useState<GoogleSetupInfo | null>(null);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);
  const { data: session, status } = useSession();

  // Rehydrate Zustand on mount
  useEffect(() => {
    useAuthStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (status === 'loading') return;

    // Already authenticated via demo auth (Zustand sessionStorage)
    if (isAuthenticated) {
      setFlow('authenticated');
      return;
    }

    // No NextAuth session → show login
    if (!session?.user?.email) {
      setFlow('unauthenticated');
      return;
    }

    // NextAuth session exists → look up or set up username
    const email = session.user.email;
    fetch(`/api/auth/google-user?email=${encodeURIComponent(email)}`)
      .then((res) => res.json())
      .then(async (data: { exists?: boolean; username?: string; displayName?: string; suggestedUsername?: string }) => {
        if (data.exists && data.username && data.displayName) {
          await login(
            { username: data.username, displayName: data.displayName, email },
            'google',
          );
          setFlow('authenticated');
        } else {
          setSetupInfo({
            email,
            googleDisplayName: session.user?.name ?? email,
            suggestedUsername: data.suggestedUsername ?? email.split('@')[0],
          });
          setFlow('setup-username');
        }
      })
      .catch(() => setFlow('unauthenticated'));
  }, [status, isAuthenticated, session, login]);

  // After username setup, authStore.login() is called inside UsernameSetupPage
  // Watch isAuthenticated to transition to authenticated state
  useEffect(() => {
    if (isAuthenticated && flow === 'setup-username') {
      setFlow('authenticated');
    }
  }, [isAuthenticated, flow]);

  if (flow === 'loading') {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: 'var(--bg)' }}
      >
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          読み込み中...
        </div>
      </div>
    );
  }

  if (flow === 'setup-username' && setupInfo) {
    return (
      <UsernameSetupPage
        email={setupInfo.email}
        googleDisplayName={setupInfo.googleDisplayName}
        suggestedUsername={setupInfo.suggestedUsername}
      />
    );
  }

  if (flow === 'authenticated') {
    return <AppLayout />;
  }

  return <LoginPage />;
}
