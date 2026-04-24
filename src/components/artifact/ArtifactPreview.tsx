import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ArtifactPreviewProps {
  content: string;
  kind: 'html' | 'svg' | 'markdown' | 'image';
  mimeType?: string;
}

export function ArtifactPreview({ content, kind, mimeType }: ArtifactPreviewProps) {
  if (kind === 'html') {
    return (
      <iframe
        srcDoc={content}
        sandbox="allow-scripts allow-same-origin"
        className="w-full"
        style={{ height: 360, border: 'none', borderRadius: 8, background: '#fff' }}
        title="HTML プレビュー"
      />
    );
  }

  if (kind === 'svg') {
    return (
      <div
        className="flex items-center justify-center p-4 rounded-lg"
        style={{ background: '#fff', minHeight: 120 }}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  if (kind === 'markdown') {
    return (
      <div className="markdown-body text-sm p-3 rounded-lg" style={{ background: 'var(--bg)' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  }

  if (kind === 'image') {
    const mime = mimeType ?? 'image/png';
    const src = `data:${mime};base64,${content}`;
    return (
      <div
        className="flex items-center justify-center p-4 rounded-lg"
        style={{ background: 'var(--sidebar-bg)', minHeight: 120 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="プレビュー"
          style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain', borderRadius: 6 }}
        />
      </div>
    );
  }

  return null;
}
