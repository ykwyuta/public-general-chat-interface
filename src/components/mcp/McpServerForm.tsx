'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useMcpStore } from '../../stores/mcpStore';
import type { McpServerConfig } from '../../types/mcp';

interface McpServerFormProps {
  server?: McpServerConfig;
  onClose: () => void;
}

export function McpServerForm({ server, onClose }: McpServerFormProps) {
  const { addServer, updateServer } = useMcpStore();
  const [name, setName] = useState(server?.name ?? '');
  const [transport, setTransport] = useState<'stdio' | 'sse'>(server?.transport ?? 'stdio');
  const [command, setCommand] = useState(server?.command ?? '');
  const [args, setArgs] = useState((server?.args ?? []).join('\n'));
  const [env, setEnv] = useState(
    server?.env ? Object.entries(server.env).map(([k]) => `${k}=`).join('\n') : ''
  );
  const [url, setUrl] = useState(server?.url ?? '');
  const [enabled, setEnabled] = useState(server?.enabled ?? true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const parseEnv = (raw: string): Record<string, string> | undefined => {
    const lines = raw.split('\n').filter(l => l.trim() && l.includes('='));
    if (lines.length === 0) return undefined;
    return Object.fromEntries(lines.map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    }));
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('名前は必須です'); return; }
    if (transport === 'stdio' && !command.trim()) { setError('コマンドは必須です'); return; }
    if (transport === 'sse' && !url.trim()) { setError('URLは必須です'); return; }

    setSaving(true);
    setError('');
    try {
      const data = {
        name: name.trim(),
        transport,
        command: transport === 'stdio' ? command.trim() : undefined,
        args: transport === 'stdio' ? args.split('\n').map(a => a.trim()).filter(Boolean) : undefined,
        env: transport === 'stdio' ? parseEnv(env) : undefined,
        url: transport === 'sse' ? url.trim() : undefined,
        enabled,
      };

      if (server) {
        await updateServer(server.id, data);
      } else {
        await addServer(data);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    background: 'var(--sidebar-bg)',
    color: 'var(--text)',
    borderColor: 'var(--border)',
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 flex flex-col gap-4 shadow-2xl"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            {server ? 'MCPサーバーを編集' : 'MCPサーバーを追加'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md" style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <p className="text-sm px-3 py-2 rounded-lg" style={{ background: '#fee2e2', color: '#dc2626' }}>
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>名前 *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm border outline-none"
            style={inputStyle}
            placeholder="例: GitHub MCP"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>トランスポート *</label>
          <div className="flex gap-3">
            {(['stdio', 'sse'] as const).map(t => (
              <label key={t} className="flex items-center gap-2 cursor-pointer text-sm" style={{ color: 'var(--text)' }}>
                <input
                  type="radio"
                  checked={transport === t}
                  onChange={() => setTransport(t)}
                  className="accent-[var(--accent)]"
                />
                {t === 'stdio' ? 'stdio（ローカル）' : 'SSE（リモート）'}
              </label>
            ))}
          </div>
        </div>

        {transport === 'stdio' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>コマンド *</label>
              <input
                value={command}
                onChange={e => setCommand(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm border outline-none font-mono"
                style={inputStyle}
                placeholder="例: npx"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>引数（1行1つ）</label>
              <textarea
                value={args}
                onChange={e => setArgs(e.target.value)}
                rows={3}
                className="px-3 py-2 rounded-lg text-sm border outline-none resize-y font-mono"
                style={{ ...inputStyle, minHeight: 60 }}
                placeholder={"例:\n@modelcontextprotocol/server-github"}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                環境変数（KEY=VALUE 形式、1行1つ）
              </label>
              <textarea
                value={env}
                onChange={e => setEnv(e.target.value)}
                rows={3}
                className="px-3 py-2 rounded-lg text-sm border outline-none resize-y font-mono"
                style={{ ...inputStyle, minHeight: 60 }}
                placeholder={"例:\nGITHUB_TOKEN=ghp_..."}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: 'var(--text)' }}>URL *</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm border outline-none font-mono"
              style={inputStyle}
              placeholder="例: https://mcp.example.com/sse"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="mcp-enabled"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          <label htmlFor="mcp-enabled" className="text-sm" style={{ color: 'var(--text)' }}>
            有効（保存後に自動接続）
          </label>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm"
            style={{ color: 'var(--text-muted)', background: 'var(--border)' }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#fff', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
