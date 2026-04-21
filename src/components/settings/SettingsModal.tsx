'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { AVAILABLE_MODELS } from '../../types';
import { McpServerPanel } from '../mcp/McpServerPanel';

type Tab = 'general' | 'mcp';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useChatStore();
  const [tab, setTab] = useState<Tab>('general');
  const [provider, setProvider] = useState(settings.provider);
  const [systemPrompt, setSystemPrompt] = useState(settings.systemPrompt);
  const [model, setModel] = useState(settings.model);

  const availableModelsForProvider = AVAILABLE_MODELS.filter(m => m.provider === provider);

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProvider = e.target.value;
    setProvider(newProvider);

    const newAvailableModels = AVAILABLE_MODELS.filter(m => m.provider === newProvider);
    if (!newAvailableModels.find(m => m.id === model)) {
      if (newAvailableModels.length > 0) {
        setModel(newAvailableModels[0].id);
      }
    }
  };

  const handleSave = () => {
    updateSettings({ provider, systemPrompt, model });
    onClose();
  };

  const tabStyle = (active: boolean) => ({
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    border: 'none',
  });

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 flex flex-col gap-5 shadow-2xl"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>設定</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--sidebar-bg)' }}>
          <button style={tabStyle(tab === 'general')} onClick={() => setTab('general')}>
            一般
          </button>
          <button style={tabStyle(tab === 'mcp')} onClick={() => setTab('mcp')}>
            MCPサーバー
          </button>
        </div>

        {tab === 'general' && (
          <>
            {/* Provider */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                プロバイダー
              </label>
              <select
                value={provider}
                onChange={handleProviderChange}
                className="px-3 py-2 rounded-lg text-sm border outline-none"
                style={{
                  background: 'var(--sidebar-bg)',
                  color: 'var(--text)',
                  borderColor: 'var(--border)',
                }}
              >
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
                <option value="bedrock">AWS Bedrock</option>
              </select>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                APIキーはサーバー側の環境変数で管理されています
              </p>
            </div>

            {/* Model */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                モデル
              </label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm border outline-none"
                style={{
                  background: 'var(--sidebar-bg)',
                  color: 'var(--text)',
                  borderColor: 'var(--border)',
                }}
              >
                {availableModelsForProvider.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {/* System Prompt */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                システムプロンプト
              </label>
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                rows={5}
                className="px-3 py-2 rounded-lg text-sm border outline-none resize-y"
                style={{
                  background: 'var(--sidebar-bg)',
                  color: 'var(--text)',
                  borderColor: 'var(--border)',
                  minHeight: 80,
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
            </div>

            {/* Theme */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                テーマ
              </label>
              <div className="flex gap-2">
                {(['light', 'dark'] as const).map(theme => (
                  <button
                    key={theme}
                    onClick={() => updateSettings({ theme })}
                    className="flex-1 px-3 py-2 rounded-lg text-sm border transition-colors"
                    style={{
                      background: settings.theme === theme ? 'var(--accent)' : 'var(--sidebar-bg)',
                      color: settings.theme === theme ? '#fff' : 'var(--text)',
                      borderColor: settings.theme === theme ? 'var(--accent)' : 'var(--border)',
                    }}
                  >
                    {theme === 'light' ? 'ライト' : 'ダーク'}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm transition-colors"
                style={{ color: 'var(--text-muted)', background: 'var(--border)' }}
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                保存
              </button>
            </div>
          </>
        )}

        {tab === 'mcp' && <McpServerPanel />}
      </div>
    </div>
  );
}
