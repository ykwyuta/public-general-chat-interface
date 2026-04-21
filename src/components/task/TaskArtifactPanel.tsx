'use client';

import { useState, useRef } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Download } from 'lucide-react';
import type { TaskMessage } from '../../types/task';
import type { Artifact } from '../../types';
import { parseArtifacts } from '../../lib/artifactParser';
import { ArtifactCodeView } from '../artifact/ArtifactCodeView';
import { ArtifactPreview } from '../artifact/ArtifactPreview';
import { useWorkspaceFiles } from '../../hooks/useWorkspaceFiles';
import { useParams } from 'next/navigation';

interface MessageArtifact extends Artifact {
  messageId: string;
  senderName: string;
}

interface TaskArtifactPanelProps {
  messages: TaskMessage[];
}

function TaskArtifactItem({ artifact }: { artifact: MessageArtifact }) {
  const [expanded, setExpanded] = useState(true);
  const [viewMode, setViewMode] = useState<'code' | 'preview'>('code');
  const [copied, setCopied] = useState(false);

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasPreview = artifact.kind === 'html' || artifact.kind === 'svg' || artifact.kind === 'markdown';

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border rounded-lg overflow-hidden mb-2" style={{ borderColor: 'var(--border)' }}>
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        style={{ background: 'var(--sidebar-bg)' }}
        onClick={() => setExpanded(v => !v)}
      >
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text)', fontFamily: 'ui-monospace, monospace' }}>
          {artifact.filename}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>
          {artifact.language}
        </span>
        <button
          onClick={handleCopy}
          className="p-1 rounded transition-colors flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          title="コピー"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button
          onClick={handleDownload}
          className="p-1 rounded transition-colors flex-shrink-0"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          title="ダウンロード"
        >
          <Download size={13} />
        </button>
      </div>

      {expanded && (
        <div>
          {hasPreview && (
            <div className="flex border-b text-xs" style={{ borderColor: 'var(--border)', background: 'var(--sidebar-bg)' }}>
              <button
                onClick={() => setViewMode('code')}
                className="px-3 py-1.5 transition-colors"
                style={{
                  color: viewMode === 'code' ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: viewMode === 'code' ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                コード
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className="px-3 py-1.5 transition-colors"
                style={{
                  color: viewMode === 'preview' ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: viewMode === 'preview' ? '2px solid var(--accent)' : '2px solid transparent',
                }}
              >
                プレビュー
              </button>
            </div>
          )}
          <div className="p-2">
            {viewMode === 'code' || !hasPreview ? (
              <ArtifactCodeView code={artifact.content} language={artifact.language} />
            ) : (
              <ArtifactPreview content={artifact.content} kind={artifact.kind as 'html' | 'svg' | 'markdown'} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TaskArtifactPanel({ messages }: TaskArtifactPanelProps) {
  const params = useParams<{ id: string }>();
  const workspaceFiles = useWorkspaceFiles(params?.id);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const artifacts: MessageArtifact[] = messages
    .filter(m => m.senderType === 'llm')
    .flatMap(m =>
      parseArtifacts(m.content).map(a => ({
        ...a,
        messageId: m.id,
        senderName: m.senderName,
      })),
    );

  const allArtifacts = [
    ...artifacts,
    ...workspaceFiles.map(w => ({
      ...w,
      messageId: 'workspace',
      senderName: 'Workspace'
    } as MessageArtifact))
  ];

  const scrollToArtifact = (artifactId: string) => {
    itemRefs.current[artifactId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >

      {allArtifacts.length > 1 && (
        <div className="px-3 py-2 border-b flex flex-wrap gap-1" style={{ borderColor: 'var(--border)', background: 'var(--sidebar-bg)' }}>
          {allArtifacts.map(art => (
            <button
              key={art.id}
              onClick={() => scrollToArtifact(art.id)}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{ background: 'var(--border)', color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {art.filename}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        {allArtifacts.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
            アーティファクトはありません
          </p>
        ) : (
          allArtifacts.map(art => (
            <div key={art.id} ref={el => { itemRefs.current[art.id] = el; }}>
              <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                🤖 {art.senderName}
              </p>
              <TaskArtifactItem artifact={art} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
