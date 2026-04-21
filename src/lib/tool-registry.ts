import type { ToolDefinition } from './llm-provider';

export type ToolExecutor = (input: Record<string, unknown>) => Promise<string>;

interface RegisteredTool {
  definition: ToolDefinition;
  executor: ToolExecutor;
}

const registry = new Map<string, RegisteredTool>();

/**
 * エージェントにツールを登録する。
 *
 * @example
 * registerTool(
 *   {
 *     name: 'get_weather',
 *     description: '指定した都市の現在の天気を取得する',
 *     input_schema: {
 *       type: 'object',
 *       properties: {
 *         location: { type: 'string', description: '都市名' },
 *       },
 *       required: ['location'],
 *     },
 *   },
 *   async ({ location }) => {
 *     const result = await fetchWeather(location as string);
 *     return JSON.stringify(result);
 *   }
 * );
 */
export function registerTool(definition: ToolDefinition, executor: ToolExecutor): void {
  registry.set(definition.name, { definition, executor });
}

export function unregisterTool(name: string): void {
  registry.delete(name);
}

export function getTools(): ToolDefinition[] {
  return Array.from(registry.values()).map(t => t.definition);
}

export function hasTool(name: string): boolean {
  return registry.has(name);
}

type MockExecutorFn = (name: string, input: Record<string, unknown>) => string;
let mockExecutor: MockExecutorFn | null = null;

export function setMockExecutor(fn: MockExecutorFn | null): void {
  mockExecutor = fn;
}

export async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  if (mockExecutor) return mockExecutor(name, input);
  const tool = registry.get(name);
  if (!tool) throw new Error(`Tool "${name}" not found in registry`);
  return tool.executor(input);
}
