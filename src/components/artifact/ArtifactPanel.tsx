import { useRef } from 'react';
import type { Artifact, Message } from '../../types';
import { ArtifactItem } from './ArtifactItem';

interface ArtifactPanelProps {
  artifacts: Artifact[];
  conversationId: string;
  messages: Message[];
}

export function ArtifactPanel({ artifacts, conversationId, messages }: ArtifactPanelProps) {
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToArtifact = (artifactId: string) => {
    itemRefs.current[artifactId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Build a map from artifactId -> messageId for toggle actions
  const artifactToMessage: Record<string, string> = {};
  for (const msg of messages) {
    for (const art of msg.artifacts) {
      artifactToMessage[art.id] = msg.id;
    }
  }

  return (
    <div
      className="flex flex-col h-full border-l overflow-hidden"
      style={{
        width: 420,
        flexShrink: 0,
        borderColor: 'var(--border)',
        background: 'var(--bg)',
      }}
    >
      {/* Panel header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--sidebar-bg)' }}
      >
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          アーティファクト ({artifacts.length})
        </span>
      </div>

      {/* File list navigation */}
      {artifacts.length > 1 && (
        <div
          className="px-3 py-2 border-b flex flex-wrap gap-1"
          style={{ borderColor: 'var(--border)', background: 'var(--sidebar-bg)' }}
        >
          {artifacts.map(art => (
            <button
              key={art.id}
              onClick={() => scrollToArtifact(art.id)}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{
                background: 'var(--border)',
                color: 'var(--text-muted)',
                fontFamily: 'ui-monospace, monospace',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              {art.filename}
            </button>
          ))}
        </div>
      )}

      {/* Artifact list */}
      <div className="flex-1 overflow-y-auto p-3">
        {artifacts.map(art => (
          <div
            key={art.id}
            ref={el => { itemRefs.current[art.id] = el; }}
          >
            <ArtifactItem
              artifact={art}
              conversationId={conversationId}
              messageId={artifactToMessage[art.id] ?? ''}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
