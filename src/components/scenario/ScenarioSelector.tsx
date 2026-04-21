'use client';

import { X, Bot, ChevronRight } from 'lucide-react';
import { SCENARIOS } from '../../scenarios/index';
import { getSelectorScripts } from '../../scenarios/scripts/index';
import type { ProviderScript } from '../../lib/providers/scripted';

export type ScenarioStartPayload =
  | { type: 'scenario'; id: string }
  | { type: 'scripted'; scriptId: string };

interface ScenarioSelectorProps {
  onClose: () => void;
  onStart: (payload: ScenarioStartPayload) => void;
}

export function ScenarioSelector({ onClose, onStart }: ScenarioSelectorProps) {
  const scriptedItems = getSelectorScripts();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-xl overflow-hidden"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Bot size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
              デモエージェント
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scenario list */}
        <div className="p-4 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
          <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
            APIキー不要で動作するデモ用チャットボットです。シナリオを選んで開始してください。
          </p>

          {/* 既存シナリオ（選択肢ボタン方式） */}
          {SCENARIOS.map(scenario => (
            <DemoCard
              key={scenario.id}
              icon={scenarioEmoji(scenario.id)}
              iconBg="var(--accent)"
              name={scenario.name}
              description={scenario.description}
              badge={null}
              onClick={() => onStart({ type: 'scenario', id: scenario.id })}
            />
          ))}

          {/* ScriptedProvider シナリオ（通常テキスト入力方式） */}
          {scriptedItems.length > 0 && (
            <>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
                <span className="text-xs px-2" style={{ color: 'var(--text-muted)' }}>動作確認</span>
                <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
              </div>
              {scriptedItems.map(script => (
                <DemoCard
                  key={script.id}
                  icon={scriptedIcon(script)}
                  iconBg={script.category === 'tool' ? '#059669' : '#7c3aed'}
                  name={script.name}
                  description={script.description}
                  badge="テキスト入力"
                  onClick={() => onStart({ type: 'scripted', scriptId: script.id })}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DemoCard({
  icon, iconBg, name, description, badge, onClick,
}: {
  icon: string;
  iconBg: string;
  name: string;
  description: string;
  badge: string | null;
  onClick: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 p-4 rounded-xl border transition-colors cursor-pointer"
      style={{ borderColor: 'var(--border)', background: 'transparent' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--sidebar-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      onClick={onClick}
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
        style={{ background: iconBg, color: '#fff' }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {name}
          </span>
          {badge && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: 'var(--border)', color: 'var(--text-muted)' }}
            >
              {badge}
            </span>
          )}
        </div>
        <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
          {description}
        </div>
      </div>
      <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    </div>
  );
}

function scenarioEmoji(id: string): string {
  const map: Record<string, string> = {
    'customer-support': '🎧',
    'restaurant-order': '🍽️',
    'ui-markdown': '📝',
    'ui-code': '💻',
    'ui-artifact': '🎨',
  };
  return map[id] ?? '🤖';
}

function scriptedIcon(script: ProviderScript): string {
  if (script.category === 'tool') return '🔧';
  if (script.category === 'ui') return '🖥️';
  return '🤖';
}
