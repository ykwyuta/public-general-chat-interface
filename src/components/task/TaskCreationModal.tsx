import { useState, useEffect } from 'react';
import { X, Plus, Trash2, FlaskConical, Layers } from 'lucide-react';
import { useTaskStore } from '../../stores/taskStore';
import { useTaskTemplateStore } from '../../stores/taskTemplateStore';
import { useMcpStore } from '../../stores/mcpStore';
import { AVAILABLE_MODELS } from '../../types';
import type { AddParticipantParams } from '../../types/task';
import { DEMO_TASK_TEMPLATE } from '../../lib/demo-task-template';

interface Props {
  currentUsername: string;
  onClose: () => void;
  onCreated: (taskId: string) => void;
}

type PendingParticipant = AddParticipantParams & { key: string };

export function TaskCreationModal({ currentUsername, onClose, onCreated }: Props) {
  const { createTask, addParticipant } = useTaskStore();
  const { templates, loadTemplates } = useTaskTemplateStore();
  const { servers, fetchServers } = useMcpStore();
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [completionCondition, setCompletionCondition] = useState('');
  const [participants, setParticipants] = useState<PendingParticipant[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);

  useEffect(() => { loadTemplates(); fetchServers(); }, []);

  const [addType, setAddType] = useState<'human' | 'llm'>('human');
  const [humanUsername, setHumanUsername] = useState('');
  const [humanCanTerminate, setHumanCanTerminate] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const [agentProvider, setAgentProvider] = useState('anthropic');
  const [agentModel, setAgentModel] = useState('claude-sonnet-4-6');
  const [agentMcpServerIds, setAgentMcpServerIds] = useState<string[]>([]);

  const loadDemo = () => {
    setTitle(DEMO_TASK_TEMPLATE.title);
    setPurpose(DEMO_TASK_TEMPLATE.purpose);
    setCompletionCondition(DEMO_TASK_TEMPLATE.completionCondition);
    setParticipants(
      DEMO_TASK_TEMPLATE.participants.map(p => ({ ...p, key: crypto.randomUUID() }))
    );
    setError('');
  };

  const loadTemplate = (templateId: string) => {
    const t = templates.find(x => x.id === templateId);
    if (!t) return;
    setTitle(t.title);
    setPurpose(t.purpose);
    setCompletionCondition(t.completionCondition);
    setParticipants(
      t.participants.map(p => {
        if (p.participantType === 'human') {
          return { key: crypto.randomUUID(), participantType: 'human' as const, username: p.username, canTerminate: p.canTerminate };
        }
        return { key: crypto.randomUUID(), participantType: 'llm' as const, agentName: p.agentName, agentRole: p.agentRole, provider: p.provider, model: p.model, mcpServerIds: p.mcpServerIds ?? [] };
      })
    );
    setError('');
    setTemplateMenuOpen(false);
  };

  const addPending = () => {
    if (addType === 'human') {
      if (!humanUsername.trim()) return;
      if (humanUsername === currentUsername) { setError('自分自身は自動的に追加されます'); return; }
      if (participants.some(p => p.participantType === 'human' && p.username === humanUsername)) {
        setError('すでに追加済みです'); return;
      }
      setParticipants(prev => [...prev, {
        key: crypto.randomUUID(), participantType: 'human',
        username: humanUsername.trim(), canTerminate: humanCanTerminate,
      }]);
      setHumanUsername(''); setHumanCanTerminate(false);
    } else {
      if (!agentName.trim()) return;
      if (!/^[a-zA-Z0-9_-]{1,32}$/.test(agentName)) {
        setError('エージェント名は半角英数字・ハイフン・アンダースコアのみ、32文字以内');
        return;
      }
      if (participants.some(p => p.participantType === 'llm' && p.agentName === agentName)) {
        setError('同名のエージェントがすでに追加済みです'); return;
      }
      setParticipants(prev => [...prev, {
        key: crypto.randomUUID(), participantType: 'llm',
        agentName: agentName.trim(), agentRole: agentRole.trim(), provider: agentProvider, model: agentModel,
        mcpServerIds: agentMcpServerIds,
      }]);
      setAgentName(''); setAgentRole(''); setAgentMcpServerIds([]);
    }
    setError('');
  };

  const handleSubmit = async () => {
    if (!title.trim() || !purpose.trim() || !completionCondition.trim()) {
      setError('タイトル・目的・完了条件はすべて必須です'); return;
    }
    setSubmitting(true);
    setError('');
    try {
      const taskId = await createTask({ title, purpose, completionCondition });
      for (const p of participants) {
        const { key: _, ...params } = p;
        void _;
        await addParticipant(taskId, params);
      }
      onCreated(taskId);
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  const availableModels = AVAILABLE_MODELS.filter(m => m.provider === agentProvider);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
      <div
        className="w-full max-w-lg mx-4 rounded-xl shadow-2xl flex flex-col max-h-[90vh]"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>新しいタスクを作成</h2>
          <div className="flex items-center gap-2">
            {templates.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setTemplateMenuOpen(v => !v)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors"
                  style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'transparent' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                  title="テンプレートから読み込む"
                >
                  <Layers size={12} />
                  テンプレート
                </button>
                {templateMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-1 w-56 rounded-lg shadow-lg z-10 py-1"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                  >
                    {templates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => loadTemplate(t.id)}
                        className="w-full text-left px-3 py-2 text-xs transition-colors"
                        style={{ color: 'var(--text)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div className="font-medium truncate">{t.name}</div>
                        {t.description && <div className="truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.description}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={loadDemo}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', background: 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              title="デモ用設定を自動入力します"
            >
              <FlaskConical size={12} />
              デモで試す
            </button>
            <button onClick={onClose} style={{ color: 'var(--text-muted)' }}><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">{error}</p>}

          <Field label="タイトル *">
            <input className="input-base" value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 機能設計レビュー" />
          </Field>
          <Field label="タスクの目的 *">
            <textarea className="input-base" rows={2} value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="このタスクで何を達成するか" />
          </Field>
          <Field label="完了条件 *">
            <textarea className="input-base" rows={2} value={completionCondition} onChange={e => setCompletionCondition(e.target.value)} placeholder="どうなったらタスクが完了か" />
          </Field>

          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-muted)' }}>参加者を追加</label>
            <div className="flex gap-2 mb-2">
              {(['human', 'llm'] as const).map(t => (
                <button key={t} onClick={() => setAddType(t)}
                  className="px-3 py-1 rounded text-xs font-medium border transition-colors"
                  style={{
                    background: addType === t ? 'var(--accent)' : 'transparent',
                    color: addType === t ? '#fff' : 'var(--text)',
                    borderColor: addType === t ? 'var(--accent)' : 'var(--border)',
                  }}>
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
                  <select className="input-base flex-1" value={agentProvider} onChange={e => { setAgentProvider(e.target.value); setAgentModel(AVAILABLE_MODELS.find(m => m.provider === e.target.value)?.id ?? ''); }}>
                    {['anthropic', 'gemini', 'bedrock'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select className="input-base flex-1" value={agentModel} onChange={e => setAgentModel(e.target.value)}>
                    {availableModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                {servers.length > 0 && (
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>MCPサーバー（任意）</label>
                    <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                      {servers.map(s => (
                        <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={agentMcpServerIds.includes(s.id)}
                            onChange={e => setAgentMcpServerIds(prev =>
                              e.target.checked ? [...prev, s.id] : prev.filter(x => x !== s.id)
                            )}
                          />
                          <span style={{ color: 'var(--text)' }}>{s.name}</span>
                          {!s.enabled && <span style={{ color: 'var(--text-muted)' }}>(無効)</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <button onClick={addPending} className="flex items-center gap-1 justify-center px-3 py-1.5 rounded-lg text-sm" style={{ background: 'var(--accent)', color: '#fff' }}>
                  <Plus size={14} /> 追加
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>参加者</span>
            {/* 開始者は常に参加者として表示（削除不可） */}
            <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs" style={{ background: 'var(--border)', color: 'var(--text)' }}>
              <span>@{currentUsername}</span>
              <span style={{ color: 'var(--text-muted)' }}>（開始者・終了権限）</span>
            </div>
          </div>

          {participants.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>追加予定の参加者</span>
              {participants.map(p => (
                <div key={p.key} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs" style={{ background: 'var(--border)', color: 'var(--text)' }}>
                  <span>{p.participantType === 'human' ? `@${p.username}` : `🤖 @${p.agentName}`}</span>
                  {p.participantType === 'human' && p.canTerminate && <span style={{ color: 'var(--text-muted)' }}>（終了権限）</span>}
                  {p.participantType === 'llm' && p.mcpServerIds && p.mcpServerIds.length > 0 && (
                    <span style={{ color: 'var(--text-muted)' }}>
                      MCP: {p.mcpServerIds.map(id => servers.find(s => s.id === id)?.name ?? id).join(', ')}
                    </span>
                  )}
                  <button onClick={() => setParticipants(prev => prev.filter(x => x.key !== p.key))} className="ml-auto" style={{ color: '#EF4444' }}><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: 'var(--border)', color: 'var(--text)' }}>キャンセル</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? '作成中…' : 'タスクを作成'}
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
