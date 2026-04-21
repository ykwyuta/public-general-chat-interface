import yaml from 'js-yaml';
import type { Scenario } from '../types/scenario';

export function parseScenario(yamlString: string): Scenario {
  const parsed = yaml.load(yamlString) as Scenario;

  if (!parsed?.id || !parsed?.name || !parsed?.start || !parsed?.nodes) {
    throw new Error('Invalid scenario YAML: missing required fields (id, name, start, nodes)');
  }
  if (!parsed.nodes[parsed.start]) {
    throw new Error(`Scenario start node "${parsed.start}" not found in nodes`);
  }

  return parsed;
}
