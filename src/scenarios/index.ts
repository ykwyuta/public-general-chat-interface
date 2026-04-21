import { parseScenario } from '../lib/scenarioParser';
import type { Scenario } from '../types/scenario';

// Imported as raw strings via webpack asset/source rule in next.config.ts
import customerSupportRaw from './customer-support.yaml';
import restaurantOrderRaw from './restaurant-order.yaml';
import uiMarkdownRaw from './ui-markdown.yaml';
import uiCodeRaw from './ui-code.yaml';
import uiArtifactRaw from './ui-artifact.yaml';

export const SCENARIOS: Scenario[] = [
  parseScenario(customerSupportRaw),
  parseScenario(restaurantOrderRaw),
  parseScenario(uiMarkdownRaw),
  parseScenario(uiCodeRaw),
  parseScenario(uiArtifactRaw),
];

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find(s => s.id === id);
}
