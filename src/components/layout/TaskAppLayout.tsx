'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/authStore';
import { LoginPage } from '../auth/LoginPage';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SettingsModal } from '../settings/SettingsModal';
import { ScenarioSelector } from '../scenario/ScenarioSelector';
import type { ScenarioStartPayload } from '../scenario/ScenarioSelector';
import { useChatStore } from '../../stores/chatStore';
import { getScript, createMockExecutorFromScript } from '../../scenarios/scripts/index';
import { setMockExecutor } from '../../lib/tool-registry';

export function TaskAppLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scenarioSelectorOpen, setScenarioSelectorOpen] = useState(false);
  const router = useRouter();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const { settings, createScenarioConversation, createConversation, updateSettings } = useChatStore();
  const prevProviderRef = useRef<{ provider: string; model: string } | null>(null);

  useEffect(() => {
    useAuthStore.persist.rehydrate();
    setMounted(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>読み込み中...</div>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginPage />;

  const handleStartDemo = (payload: ScenarioStartPayload) => {
    if (payload.type === 'scenario') {
      createScenarioConversation(payload.id);
    } else {
      prevProviderRef.current = { provider: settings.provider, model: settings.model };
      updateSettings({ provider: 'scripted', model: payload.scriptId });
      const script = getScript(payload.scriptId);
      if (script) setMockExecutor(createMockExecutorFromScript(script));
      createConversation();
    }
    setScenarioSelectorOpen(false);
  };

  const handleNewChat = () => {
    if (settings.provider === 'scripted') {
      updateSettings(prevProviderRef.current ?? { provider: 'anthropic', model: 'claude-sonnet-4-6' });
      setMockExecutor(null);
      prevProviderRef.current = null;
    }
    createConversation();
    router.push('/');
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <Sidebar
        onSettingsClick={() => setSettingsOpen(true)}
        onNewChat={handleNewChat}
        onDemoAgentClick={() => setScenarioSelectorOpen(true)}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <div className="flex-1 min-h-0 overflow-hidden">
          {children}
        </div>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {scenarioSelectorOpen && (
        <ScenarioSelector
          onClose={() => setScenarioSelectorOpen(false)}
          onStart={handleStartDemo}
        />
      )}
    </div>
  );
}
