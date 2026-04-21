export interface ScenarioOption {
  label: string;
  next: string | null;
}

export interface ScenarioNode {
  message: string;
  options: ScenarioOption[];
  terminal?: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  start: string;
  nodes: Record<string, ScenarioNode>;
}
