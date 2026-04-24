import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check, Download } from 'lucide-react';
import type { Artifact } from '../../types';
import { ArtifactCodeView } from './ArtifactCodeView';
import { ArtifactPreview } from './ArtifactPreview';
import { useChatStore } from '../../stores/chatStore';

interface ArtifactItemProps {
  artifact: Artifact;
  conversationId: string;
  messageId: string;
}

export function ArtifactItem({ artifact, conversationId, messageId }: ArtifactItemProps) {
  const [viewMode, setViewMode] = useState<'code' | 'preview'>(
    artifact.kind === 'image' ? 'preview' : 'code'
  );
  const [copied, setCopied] = useState(false);
  const [localExpanded, setLocalExpanded] = useState(false);
  const { toggleArtifactExpanded } = useChatStore();

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    let blob: Blob;
    if (artifact.kind === 'image' && artifact.mimeType) {
      // base64 → バイナリに復元
      const byteChars = atob(artifact.content);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      blob = new Blob([byteArray], { type: artifact.mimeType });
    } else {
      blob = new Blob([artifact.content], { type: 'text/plain' });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasPreview = artifact.kind === 'html' || artifact.kind === 'svg' || artifact.kind === 'markdown' || artifact.kind === 'image';

  return (
    <div
      className="border rounded-lg overflow-hidden mb-2"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        style={{ background: 'var(--sidebar-bg)' }}
        onClick={() => {
          if (artifact.id.startsWith('ws-')) {
            setLocalExpanded(!localExpanded);
          } else {
            toggleArtifactExpanded(conversationId, messageId, artifact.id);
          }
        }}
      >
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          {(artifact.id.startsWith('ws-') ? localExpanded : artifact.isExpanded) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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

      {/* Body */}
      {(artifact.id.startsWith('ws-') ? localExpanded : artifact.isExpanded) && (
        <div>
          {/* View toggle for HTML/SVG/Markdown */}
          {hasPreview && (
            <div
              className="flex border-b text-xs"
              style={{ borderColor: 'var(--border)', background: 'var(--sidebar-bg)' }}
            >
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
              <ArtifactPreview
                content={artifact.content}
                kind={artifact.kind as 'html' | 'svg' | 'markdown' | 'image'}
                mimeType={artifact.mimeType}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
