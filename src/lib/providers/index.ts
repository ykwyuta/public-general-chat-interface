import type { LLMProvider } from '../llm-provider';
import { AnthropicProvider } from '../anthropic';
import { GeminiProvider } from './gemini';
import { BedrockProvider } from './bedrock';
import { ScriptedProvider, registerScript } from './scripted';
import { SCRIPTS } from '../../scenarios/scripts/index';

// スクリプトをレジストリに登録（モジュール初期化時に1度だけ実行）
for (const script of SCRIPTS) {
  registerScript(script);
}

export function getProvider(providerId: string): LLMProvider {
  switch (providerId) {
    case 'scripted':
      return new ScriptedProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'bedrock':
      return new BedrockProvider();
    case 'anthropic':
    default:
      if (providerId !== 'anthropic') {
        console.warn(`Unknown provider "${providerId}", falling back to "anthropic"`);
      }
      return new AnthropicProvider();
  }
}

export { AnthropicProvider, GeminiProvider, BedrockProvider, ScriptedProvider };
