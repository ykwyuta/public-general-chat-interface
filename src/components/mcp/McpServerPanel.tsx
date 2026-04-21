'use client';

import { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2, Pencil, Plug, PlugZap } from 'lucide-react';
import { useMcpStore } from '../../stores/mcpStore';
import { McpServerForm } from './McpServerForm';
import type { McpServerConfig } from '../../types/mcp';

const statusColor: Record<string, string> = {
  connected: '#22c55e',
  connecting: '#f59e0b',
  disconnected: 'var(--text-muted)',
  error: '#ef4444',
};

const statusLabel: Record<string, string> = {
  connected: '接続中',
  connecting: '接続中...',
  disconnected: '未接続',
  error: 'エラー',
};

export function McpServerPanel() {
  const { servers, fetchServers, deleteServer, connectServer, disconnectServer, refreshStatus, isLoading } = useMcpStore();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<McpServerConfig | undefined>();

  useEffect(() => { fetchServers(); }, [fetchServers]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    await deleteServer(id);
  };

  const handleConnect = async (id: string) => {
    await connectServer(id).catch(() => {});
  };

  const handleDisconnect = async (id: string) => {
    await disconnectServer(id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          MCPサーバー
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => fetchServers()}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
            title="更新"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { setEditTarget(undefined); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            <Plus size={14} />
            追加
          </button>
        </div>
      </div>

      {servers.length === 0 && !isLoading && (
        <div
          className="text-center py-8 text-sm rounded-xl"
          style={{ color: 'var(--text-muted)', border: '2px dashed var(--border)' }}
        >
          <p>MCPサーバーが登録されていません</p>
          <p className="text-xs mt-1">「追加」ボタンで最初のサーバーを接続しましょう</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {servers.map(server => (
          <div
            key={server.id}
            className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: statusColor[server.status] ?? 'var(--text-muted)' }}
                  />
                  <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                    {server.name}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                    style={{ background: 'var(--border)', color: 'var(--text-muted)' }}
                  >
                    {server.transport}
                  </span>
                </div>
                <p className="text-xs font-mono truncate pl-4" style={{ color: 'var(--text-muted)' }}>
                  {server.transport === 'stdio'
                    ? `${server.command ?? ''} ${(server.args ?? []).join(' ')}`.trim()
                    : server.url ?? ''}
                </p>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {server.status === 'connected' ? (
                  <button
                    onClick={() => handleDisconnect(server.id)}
                    className="p-1.5 rounded-md"
                    style={{ color: 'var(--text-muted)' }}
                    title="切断"
                  >
                    <PlugZap size={14} />
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(server.id)}
                    className="p-1.5 rounded-md"
                    style={{ color: 'var(--text-muted)' }}
                    title="接続"
                  >
                    <Plug size={14} />
                  </button>
                )}
                <button
                  onClick={() => refreshStatus(server.id)}
                  className="p-1.5 rounded-md"
                  style={{ color: 'var(--text-muted)' }}
                  title="状態を更新"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={() => { setEditTarget(server); setShowForm(true); }}
                  className="p-1.5 rounded-md"
                  style={{ color: 'var(--text-muted)' }}
                  title="編集"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(server.id, server.name)}
                  className="p-1.5 rounded-md"
                  style={{ color: '#ef4444' }}
                  title="削除"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pl-4 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: statusColor[server.status] }}>
                {statusLabel[server.status] ?? server.status}
              </span>
              {server.status === 'connected' && (
                <>
                  <span>ツール: {server.toolCount}個</span>
                  <span>リソース: {server.resourceCount}個</span>
                </>
              )}
              {server.status === 'error' && server.error && (
                <span className="truncate" style={{ color: '#ef4444' }} title={server.error}>
                  {server.error}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <McpServerForm
          server={editTarget}
          onClose={() => { setShowForm(false); setEditTarget(undefined); }}
        />
      )}
    </div>
  );
}
