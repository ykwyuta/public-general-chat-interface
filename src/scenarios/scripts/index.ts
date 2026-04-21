import yaml from 'js-yaml';
import type { ProviderScript } from '../../lib/providers/scripted';
import { createMockExecutorFromScript } from '../../lib/providers/scripted';

import toolSingleRaw from './tool-single.yaml';
import toolMultipleRaw from './tool-multiple.yaml';
import toolErrorRaw from './tool-error.yaml';
import uiStreamingRaw from './ui-streaming.yaml';
import taskMarketingRaw from './task-marketing.yaml';
import taskTechRaw from './task-tech.yaml';

function parseScript(raw: string): ProviderScript {
  return yaml.load(raw) as ProviderScript;
}

export const SCRIPTS: ProviderScript[] = [
  parseScript(toolSingleRaw),
  parseScript(toolMultipleRaw),
  parseScript(toolErrorRaw),
  parseScript(uiStreamingRaw),
  parseScript(taskMarketingRaw),
  parseScript(taskTechRaw),
];

export function getScript(id: string): ProviderScript | undefined {
  return SCRIPTS.find(s => s.id === id);
}

/** ScenarioSelector に表示するスクリプト一覧（task カテゴリは除外） */
export function getSelectorScripts(): ProviderScript[] {
  return SCRIPTS.filter(s => s.category !== 'task');
}

/** タスク用デモエージェントのスクリプト一覧 */
export function getTaskScripts(): ProviderScript[] {
  return SCRIPTS.filter(s => s.category === 'task');
}

/** スクリプトの mock_result から MockExecutor を生成する */
export { createMockExecutorFromScript };
