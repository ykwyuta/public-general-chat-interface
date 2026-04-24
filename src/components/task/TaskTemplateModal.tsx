import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { useTaskTemplateStore } from '../../stores/taskTemplateStore';
import { useAvailableModels } from '../../hooks/useAvailableModels';
import type { TaskTemplate, CreateTemplateParticipantParams } from '../../types/taskTemplate';

interface Props {
  template?: TaskTemplate;
  onClose: () => void;
  onSaved: (template: TaskTemplate) => void;
}

type PendingParticipant = CreateTemplateParticipantParams & { key: string };

export function TaskTemplateModal({ template, onClose, onSaved }: Props) {
  const { createTemplate, updateTemplate } = useTaskTemplateStore();
  const { models: availableModels } = useAvailableModels();

  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [title, setTitle] = useState(template?.title ?? '');
  const [purpose, setPurpose] = useState(template?.purpose ?? '');
  const [completionCondition, setCompletionCondition] = useState(template?.completionCondition ?? '');
  const [participants, setParticipants] = useState<PendingParticipant[]>(
    template?.participants.map(p => {
      if (p.participantType === 'human') {
        return { key: crypto.randomUUID(), participantType: 'human', username: p.username, canTerminate: p.canTerminate };
      }
      return { key: crypto.randomUUID(), participantType: 'llm', agentName: p.agentName, agentRole: p.agentRole, provider: p.provider, model: p.model };
    }) ?? []
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [addType, setAddType] = useState<'human' | 'llm'>('human');
  const [humanUsername, setHumanUsername] = useState('');
  const [humanCanTerminate, setHumanCanTerminate] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const [agentProvider, setAgentProvider] = useState('anthropic');
  const [agentModel, setAgentModel] = useState('claude-sonnet-4-6');

  const addPending = () => {
    if (addType === 'human') {
      if (!humanUsername.trim()) return;
      if (participants.some(p => p.participantType === 'human' && p.username === humanUsername)) {
        setError('すでに追加済みです'); return;
      }
      setParticipants(prev => [...prev, { key: crypto.randomUUID(), participantType: 'human', username: humanUsername.trim(), canTerminate: humanCanTerminate }]);
      setHumanUsername(''); setHumanCanTerminate(false);
    } else {
      if (!agentName.trim()) return;
      if (!/^[a-zA-Z0-9_-]{1,32}$/.test(agentName)) {
        setError('エージェント名は半角英数字・ハイフン・アンダースコアのみ、32文字以内'); return;
      }
      if (participants.some(p => p.participantType === 'llm' && p.agentName === agentName)) {
        setError('同名のエージェントがすでに追加済みです'); return;
      }
      setParticipants(prev => [...prev, { key: crypto.randomUUID(), participantType: 'llm', agentName: agentName.trim(), agentRole: agentRole.trim(), provider: agentProvider, model: agentModel }]);
      setAgentName(''); setAgentRole('');
    }
    setError('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('テンプレート名は必須です'); return; }
    setSubmitting(true); setError('');
    try {
      const participantParams = participants.map(({ key: _, ...p }) => { void _; return p as CreateTemplateParticipantParams; });
      let saved: TaskTemplate;
      if (template) {
        saved = await updateTemplate(template.id, { name, description, title, purpose, completionCondition, participants: participantParams });
      } else {
        saved = await createTemplate({ name, description, title, purpose, completionCondition, participants: participantParams });
      }
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  const availableProviders = [...new Set(availableModels.map(m => m.provider))];
  const modelsForProvider = availableModels.filter(m => m.provider === agentProvider);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div className="w-full max-w-lg mx-4 rounded-xl shadow-2xl flex flex-col max-h-[90vh]" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            {template ? 'テンプレートを編集' : '新しいテンプレート'}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">{error}</p>}

          <Field label="テンプレート名 *">
            <input className="input-base" value={name} onChange={e => setName(e.target.value)} placeholder="例: 週次レビュー" />
          </Field>
          <Field label="説明">
            <input className="input-base" value={description} onChange={e => setDescription(e.target.value)} placeholder="テンプレートの用途など（任意）" />
          </Field>

          <hr style={{ borderColor: 'var(--border)' }} />

          <Field label="タイトル（雛形）">
            <input className="input-base" value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 機能設計レビュー" />
          </Field>
          <Field label="タスクの目的（雛形）">
            <textarea className="input-base" rows={2} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="このタスクで何を達成するか" />
          </Field>
          <Field label="完了条件（雛形）">
            <textarea className="input-base" rows={2} value={completionCondition} onChange={e => setCompletionCondition(e.target.value)} placeholder="どうなったらタスクが完了か" />
          </Field>

          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>参加者を追加</label>
            <div className="flex gap-2 mb-2">
              {(['human', 'llm'] as const).map(t => (
                <button key={t} onClick={() => setAddType(t)}
                  className="px-3 py-1 rounded text-xs font-medium border transition-colors"
                  style={{ background: addType === t ? 'var(--accent)' : 'transparent', color: addType === t ? '#fff' : 'var(--text)', borderColor: addType === t ? 'var(--accent)' : 'var(--border)' }}>
                  {t === 'human' ? '人間ユーザー' : 'LLMエージェント'}
                </button>
              ))}
            </div>

            {addType === 'human' ? (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <input className="input-base" value={humanUsername} onChange={e => setHumanUsername(e.target.value)} placeholder="username" />
                </div>
                <label className="flex items-center gap-1 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                  <input type="checkbox" checked={humanCanTerminate} onChange={e => setHumanCanTerminate(e.target.checked)} />
                  終了権限
                </label>
                <button onClick={addPending} className="p-2 rounded-lg" style={{ background: 'var(--accent)', color: '#fff' }}><Plus size={14} /></button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input className="input-base" value={agentName} onChange={e => setAgentName(e.target.value)} placeholder="エージェント名 (英数字)" />
                <input className="input-base" value={agentRole} onChange={e => setAgentRole(e.target.value)} placeholder="役割の説明" />
                <div className="flex gap-2">
                  <select className="input-base flex-1" value={agentProvider} onChange={e => { setAgentProvider(e.target.value); setAgentModel(availableModels.find(m => m.provider === e.target.value)?.id ?? ''); }}>
                    {availableProviders.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select className="input-base flex-1" value={agentModel} onChange={e => setAgentModel(e.target.value)}>
                    {modelsForProvider.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <button onClick={addPending} className="flex items-center gap-1 justify-center px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--accent)', color: '#fff' }}>
                  <Plus size={14} /> 追加
                </button>
              </div>
            )}
          </div>

          {participants.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>参加者</span>
              {participants.map(p => (
                <div key={p.key} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs" style={{ background: 'var(--border)', color: 'var(--text)' }}>
                  <span>{p.participantType === 'human' ? `@${p.username}` : `🤖 @${p.agentName}`}</span>
                  {p.participantType === 'human' && p.canTerminate && <span style={{ color: 'var(--text-muted)' }}>（終了権限）</span>}
                  <button onClick={() => setParticipants(prev => prev.filter(x => x.key !== p.key))} className="ml-auto" style={{ color: '#EF4444' }}><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>キャンセル</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
}
