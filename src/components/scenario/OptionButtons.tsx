import { RotateCcw } from 'lucide-react';
import { useScenario } from '../../hooks/useScenario';
import type { ScenarioOption } from '../../types/scenario';

interface OptionButtonsProps {
  conversationId: string;
}

export function OptionButtons({ conversationId }: OptionButtonsProps) {
  const { currentNode, selectOption, restart, isTerminal } = useScenario(conversationId);

  if (!currentNode) return null;

  const handleOption = (option: ScenarioOption) => {
    if (option.next === null) {
      restart();
    } else {
      selectOption(option);
    }
  };

  return (
    <div className="px-4 pb-4 pt-2" style={{ background: 'var(--bg)' }}>
      <div className="max-w-3xl mx-auto">
        {isTerminal && (
          <p className="text-xs mb-3 text-center" style={{ color: 'var(--text-muted)' }}>
            会話が終了しました
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {currentNode.options.map((option, i) => {
            const isRestart = option.next === null || (isTerminal && option.label.includes('やり直す'));
            return (
              <button
                key={i}
                onClick={() => handleOption(option)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all border"
                style={{
                  background: isRestart ? 'transparent' : 'var(--accent)',
                  color: isRestart ? 'var(--text-muted)' : '#fff',
                  borderColor: isRestart ? 'var(--border)' : 'var(--accent)',
                }}
                onMouseEnter={e => {
                  if (isRestart) {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.color = 'var(--accent)';
                  } else {
                    e.currentTarget.style.opacity = '0.85';
                  }
                }}
                onMouseLeave={e => {
                  if (isRestart) {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  } else {
                    e.currentTarget.style.opacity = '1';
                  }
                }}
              >
                {isRestart && <RotateCcw size={12} />}
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
          デモエージェント — 選択肢をクリックして会話を進めてください
        </p>
      </div>
    </div>
  );
}
