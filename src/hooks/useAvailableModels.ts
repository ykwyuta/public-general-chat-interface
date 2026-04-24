import { useState, useEffect } from 'react';
import { useChatStore } from '../stores/chatStore';

export function useAvailableModels() {
  const [models, setModels] = useState<{ id: string; name: string; provider: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const updateSettings = useChatStore(s => s.updateSettings);
  const settings = useChatStore(s => s.settings);

  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then((data: { id: string; name: string; provider: string }[]) => {
        setModels(data);
        setLoading(false);

        // 現在の設定が利用不可能なモデル/プロバイダーを参照している場合、
        // 利用可能な最初のモデルに自動フォールバックする
        if (data.length > 0) {
          const currentModelAvailable = data.some(m => m.id === settings.model);
          if (!currentModelAvailable) {
            const fallback = data[0];
            console.warn(
              `[useAvailableModels] Model "${settings.model}" (provider: "${settings.provider}") is not available. ` +
              `Falling back to "${fallback.id}" (provider: "${fallback.provider}").`
            );
            updateSettings({ model: fallback.id, provider: fallback.provider });
          }
        }
      })
      .catch(err => {
        console.error('Failed to fetch models:', err);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { models, loading };
}
