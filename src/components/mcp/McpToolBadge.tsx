'use client';

import { Wrench, CheckCircle, XCircle, Loader } from 'lucide-react';

interface McpToolBadgeProps {
  toolName: string;
  status: 'running' | 'success' | 'error';
  result?: string;
}

export function McpToolBadge({ toolName, status, result }: McpToolBadgeProps) {
  const [serverId, localName] = toolName.includes('__')
    ? toolName.split('__', 2)
    : ['', toolName];

  const Icon = status === 'running' ? Loader
    : status === 'success' ? CheckCircle
    : XCircle;

  const borderColor = status === 'running' ? 'var(--border)'
    : status === 'success' ? '#86efac'
    : '#fca5a5';

  const iconColor = status === 'running' ? 'var(--text-muted)'
    : status === 'success' ? '#22c55e'
    : '#ef4444';

  return (
    <div
      className="rounded-xl p-3 flex flex-col gap-2 my-1 text-sm"
      style={{ background: 'var(--sidebar-bg)', border: `1px solid ${borderColor}` }}
    >
      <div className="flex items-center gap-2">
        <Icon
          size={14}
          style={{ color: iconColor, flexShrink: 0 }}
          className={status === 'running' ? 'animate-spin' : ''}
        />
        <Wrench size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span className="font-mono font-medium" style={{ color: 'var(--text)' }}>
          {localName}
        </span>
        {serverId && (
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: 'var(--border)', color: 'var(--text-muted)' }}
          >
            MCP: {serverId}
          </span>
        )}
      </div>
      {result && status !== 'running' && (
        <pre
          className="text-xs rounded-lg px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-words"
          style={{ background: 'var(--bg)', color: 'var(--text-muted)', maxHeight: 120 }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}
