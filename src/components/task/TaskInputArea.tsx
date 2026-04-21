import { useState, useRef, useEffect } from 'react';
import { Send, ImagePlus, FileText, X } from 'lucide-react';
import type { TaskParticipant, HumanParticipant } from '../../types/task';
import type { ImageAttachment } from '../../types';

interface TextAttachment {
  id: string;
  name: string;
  content: string;
}

interface Props {
  participants: TaskParticipant[];
  currentUsername: string;
  disabled?: boolean;
  isPending?: boolean;
  onSend: (content: string, images?: ImageAttachment[]) => Promise<void> | void;
}

export function TaskInputArea({ participants, currentUsername, disabled, isPending, onSend }: Props) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [textFiles, setTextFiles] = useState<TextAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  const allNames = participants.map(p =>
    p.participantType === 'human' ? (p as HumanParticipant).username : p.agentName,
  );

  useEffect(() => {
    const match = text.match(/@([a-zA-Z0-9_-]*)$/);
    if (match) {
      const prefix = match[1].toLowerCase();
      setSuggestions(allNames.filter(n => n.toLowerCase().startsWith(prefix) && n !== currentUsername));
      setSuggestionIndex(0);
    } else {
      setSuggestions([]);
    }
  }, [text]);

  const applySuggestion = (name: string) => {
    setText(prev => prev.replace(/@([a-zA-Z0-9_-]*)$/, `@${name} `));
    setSuggestions([]);
    textareaRef.current?.focus();
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newImages: ImageAttachment[] = [];
    for (const file of files) {
      const data = await readFileAsBase64(file);
      newImages.push({ id: crypto.randomUUID(), data, mediaType: file.type as ImageAttachment['mediaType'], name: file.name });
    }
    setImages(prev => [...prev, ...newImages]);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleTextFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      const content = await file.text();
      setTextFiles(prev => [...prev, { id: crypto.randomUUID(), name: file.name, content }]);
    }
    if (textInputRef.current) textInputRef.current.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestionIndex(i => (i + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSuggestionIndex(i => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applySuggestion(suggestions[suggestionIndex]); return; }
      if (e.key === 'Escape')    { setSuggestions([]); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = async () => {
    const canSend = text.trim() || images.length > 0 || textFiles.length > 0;
    if (!canSend || disabled || sending || isPending) return;
    setSending(true);

    // テキストファイルの内容をメッセージ本文に追記
    let finalContent = text.trim();
    for (const tf of textFiles) {
      finalContent += `\n\n--- ${tf.name} ---\n${tf.content}`;
    }

    const imagesToSend = images.slice();
    setText('');
    setImages([]);
    setTextFiles([]);
    try {
      await onSend(finalContent, imagesToSend.length > 0 ? imagesToSend : undefined);
    } finally {
      setSending(false);
    }
  };

  const canSend = (text.trim().length > 0 || images.length > 0 || textFiles.length > 0) && !disabled && !isPending && !sending;

  return (
    <div className="p-4 border-t relative" style={{ borderColor: 'var(--border)' }}>
      {suggestions.length > 0 && (
        <div
          className="absolute bottom-full left-4 right-4 mb-1 rounded-lg overflow-hidden shadow-lg border"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)', zIndex: 10 }}
        >
          {suggestions.map((name, i) => (
            <button
              key={name}
              className="w-full text-left px-3 py-2 text-sm flex items-center gap-2"
              style={{ background: i === suggestionIndex ? 'var(--border)' : 'transparent', color: 'var(--text)' }}
              onMouseEnter={() => setSuggestionIndex(i)}
              onClick={() => applySuggestion(name)}
            >
              @{name}
            </button>
          ))}
        </div>
      )}

      {/* 添付ファイルプレビュー */}
      {(images.length > 0 || textFiles.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {images.map(img => (
            <div key={img.id} className="relative group/thumb">
              <img
                src={`data:${img.mediaType};base64,${img.data}`}
                alt={img.name}
                className="w-14 h-14 object-cover rounded-lg"
                style={{ border: '1px solid var(--border)' }}
              />
              <button
                onClick={() => setImages(prev => prev.filter(x => x.id !== img.id))}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity text-xs"
                style={{ background: 'var(--text)', color: 'var(--bg)' }}
              >
                <X size={9} />
              </button>
            </div>
          ))}
          {textFiles.map(tf => (
            <div
              key={tf.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs group/file"
              style={{ background: 'var(--border)', color: 'var(--text)' }}
            >
              <FileText size={11} />
              <span className="max-w-24 truncate">{tf.name}</span>
              <button
                onClick={() => setTextFiles(prev => prev.filter(x => x.id !== tf.id))}
                className="opacity-0 group-hover/file:opacity-100 transition-opacity"
                style={{ color: '#EF4444' }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className="flex items-end gap-2 rounded-xl border px-3 py-2"
        style={{ borderColor: 'var(--border)', background: 'var(--input-bg)' }}
      >
        {/* 画像添付 */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0 p-1 rounded transition-colors"
          style={{ color: disabled ? 'var(--border)' : 'var(--text-muted)' }}
          title="画像を添付"
          onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = disabled ? 'var(--border)' : 'var(--text-muted)'; }}
        >
          <ImagePlus size={15} />
        </button>

        {/* テキストファイル添付 */}
        <input
          ref={textInputRef}
          type="file"
          accept=".txt,.md,.csv,.json,.yaml,.yml,.xml,.html,.css,.js,.ts,.py,.sh,.sql,.log"
          multiple
          className="hidden"
          onChange={handleTextFileSelect}
        />
        <button
          onClick={() => textInputRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0 p-1 rounded transition-colors"
          style={{ color: disabled ? 'var(--border)' : 'var(--text-muted)' }}
          title="テキストファイルを添付"
          onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = disabled ? 'var(--border)' : 'var(--text-muted)'; }}
        >
          <FileText size={15} />
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="メッセージを入力… (@名前 で宛先を指定)"
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm outline-none"
          style={{ color: 'var(--text)', maxHeight: 120, overflowY: 'auto' }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="p-1.5 rounded-lg transition-colors flex-shrink-0"
          style={{
            background: canSend ? 'var(--accent)' : 'var(--border)',
            color: canSend ? '#fff' : 'var(--text-muted)',
          }}
        >
          {sending || isPending ? (
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
