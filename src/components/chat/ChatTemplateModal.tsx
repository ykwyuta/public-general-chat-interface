import { useState, useRef } from 'react';
import { X, Plus, Trash2, FileText, Bot } from 'lucide-react';
import { useChatTemplateStore } from '../../stores/chatTemplateStore';
import { useMcpStore } from '../../stores/mcpStore';
import type { ChatTemplate, ChatTemplateFile, CreateChatTemplateParams } from '../../types/chatTemplate';

interface Props {
  template?: ChatTemplate;
  onClose: () => void;
  onSaved: (template: ChatTemplate) => void;
}

export function ChatTemplateModal({ template, onClose, onSaved }: Props) {
  const { createTemplate, updateTemplate } = useChatTemplateStore();
  const servers = useMcpStore(s => s.servers);

  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [welcomeMessage, setWelcomeMessage] = useState(template?.welcomeMessage ?? '');
  const [systemPrompt, setSystemPrompt] = useState(template?.systemPrompt ?? '');
  const [mcpServers, setMcpServers] = useState<string[]>(template?.mcpServers ?? []);

  const [files, setFiles] = useState<Omit<ChatTemplateFile, 'id' | 'templateId'>[]>(
    template?.files?.map(f => ({
      filename: f.filename,
      content: f.content,
      mediaType: f.mediaType
    })) ?? []
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('テンプレート名は必須です');
      return;
    }

    setIsSaving(true);
    setError('');

    const params: CreateChatTemplateParams = {
      name,
      description,
      welcomeMessage,
      systemPrompt,
      mcpServers,
      files,
    };

    try {
      let saved;
      if (template) {
        saved = await updateTemplate(template.id, params);
      } else {
        saved = await createTemplate(params);
      }
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
      setIsSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    Array.from(selectedFiles).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          // Check if base64 or text
          if (result.startsWith('data:')) {
            const [, data] = result.split(',');
            setFiles(prev => [...prev, {
              filename: file.name,
              mediaType: file.type || 'application/octet-stream',
              content: data
            }]);
          } else {
            setFiles(prev => [...prev, {
              filename: file.name,
              mediaType: file.type || 'text/plain',
              content: result
            }]);
          }
        }
      };

      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const toggleMcpServer = (id: string) => {
    setMcpServers(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-2xl max-h-[90vh] rounded-xl flex flex-col shadow-2xl"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-semibold text-lg" style={{ color: 'var(--text)' }}>
            {template ? 'テンプレートを編集' : '新しいテンプレート'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10">
            <X size={20} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">{error}</p>}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>テンプレート名 *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                placeholder="例: コードレビュー設定"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>説明</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                placeholder="例: フロントエンドコードをレビューするための設定"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>ウェルカムメッセージ</label>
              <textarea
                value={welcomeMessage}
                onChange={e => setWelcomeMessage(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 min-h-[80px]"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                placeholder="開始時にアシスタントから送信されるメッセージ"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>システムプロンプト</label>
              <textarea
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 min-h-[100px]"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
                placeholder="LLMに設定するカスタムプロンプト"
              />
            </div>
          </div>

          <hr style={{ borderColor: 'var(--border)' }} />

          <div>
            <div className="flex items-center gap-2 mb-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
              <Bot size={16} /> デフォルト有効MCPサーバー
            </div>
            {servers.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>利用可能なMCPサーバーがありません</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {servers.map(server => {
                  const isActive = mcpServers.includes(server.id);
                  return (
                    <button
                      key={server.id}
                      onClick={() => toggleMcpServer(server.id)}
                      className="px-3 py-1.5 rounded-lg text-sm border transition-colors flex items-center gap-1.5"
                      style={{
                        background: isActive ? 'var(--accent)' : 'transparent',
                        color: isActive ? '#fff' : 'var(--text)',
                        borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                      }}
                    >
                      {server.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <hr style={{ borderColor: 'var(--border)' }} />

          <div>
            <div className="flex items-center justify-between mb-3 text-sm font-medium" style={{ color: 'var(--text)' }}>
              <div className="flex items-center gap-2">
                <FileText size={16} /> コンテキストコンテンツ
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                style={{ color: 'var(--text)' }}
              >
                <Plus size={12} /> 追加
              </button>
              <input
                type="file"
                ref={fileInputRef}
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              テンプレートからチャットを開始した際、セッション毎のワークスペースに自動的にコピーされるファイルです。
            </p>

            <div className="space-y-2">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded border" style={{ borderColor: 'var(--border)', background: 'var(--sidebar-bg)' }}>
                  <div className="text-sm truncate mr-4" style={{ color: 'var(--text)' }}>{file.filename} <span className="text-xs" style={{ color: 'var(--text-muted)' }}>({file.mediaType})</span></div>
                  <button onClick={() => removeFile(i)} className="p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {files.length === 0 && (
                <div className="text-center py-4 border border-dashed rounded text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  ファイルが追加されていません
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text)' }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            {isSaving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
