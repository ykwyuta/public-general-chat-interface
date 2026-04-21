import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import hljs from 'highlight.js';

interface ArtifactCodeViewProps {
  code: string;
  language: string;
}

export function ArtifactCodeView({ code, language }: ArtifactCodeViewProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  let highlighted = code;
  try {
    const lang = hljs.getLanguage(language) ? language : 'plaintext';
    highlighted = hljs.highlight(code, { language: lang }).value;
  } catch {
    highlighted = hljs.highlightAuto(code).value;
  }

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#ccc' }}
        title="コピー"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
      <pre
        style={{
          background: '#1e1e2e',
          borderRadius: 8,
          padding: '1em',
          overflowX: 'auto',
          margin: 0,
          fontSize: '0.8125em',
          lineHeight: '1.6',
        }}
      >
        <code
          className={`hljs language-${language}`}
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}
