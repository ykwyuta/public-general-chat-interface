import { McpClient } from './mcp-client';
import type { McpServerConfig, McpServerStatus, McpTool, McpResource } from '../../types/mcp';

class McpManager {
  private clients = new Map<string, McpClient>();

  async initialize(configs: McpServerConfig[]): Promise<void> {
    const enabled = configs.filter(c => c.enabled);
    await Promise.allSettled(enabled.map(c => this.connect(c)));
  }

  async connect(config: McpServerConfig): Promise<void> {
    const existing = this.clients.get(config.id);
    if (existing) {
      await existing.disconnect().catch(() => {});
    }
    const client = new McpClient(config);
    this.clients.set(config.id, client);
    await client.connect();
  }

  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect().catch(() => {});
      this.clients.delete(serverId);
    }
  }

  getStatus(serverId: string): McpServerStatus {
    const client = this.clients.get(serverId);
    if (!client) return { id: serverId, status: 'disconnected', toolCount: 0, resourceCount: 0 };
    return {
      id: serverId,
      status: client.status,
      error: client.error,
      toolCount: client.tools.length,
      resourceCount: client.resources.length,
      connectedAt: client.connectedAt,
    };
  }

  getStatuses(serverIds: string[]): McpServerStatus[] {
    return serverIds.map(id => this.getStatus(id));
  }

  getAllTools(): McpTool[] {
    return Array.from(this.clients.values()).flatMap(c => c.tools);
  }

  getToolsForServers(serverIds: string[]): McpTool[] {
    return serverIds.flatMap(id => this.clients.get(id)?.tools ?? []);
  }

  getAllResources(): McpResource[] {
    return Array.from(this.clients.values()).flatMap(c => c.resources);
  }

  getResourcesForServer(serverId: string): McpResource[] {
    return this.clients.get(serverId)?.resources ?? [];
  }

  async callTool(qualifiedName: string, args: Record<string, unknown>): Promise<string> {
    const idx = qualifiedName.indexOf('__');
    if (idx === -1) throw new Error(`Invalid MCP tool name: ${qualifiedName}`);
    const serverId = qualifiedName.slice(0, idx);
    const toolName = qualifiedName.slice(idx + 2);
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server "${serverId}" not found or not connected`);
    return client.callTool(toolName, args);
  }

  async readResource(serverId: string, uri: string): Promise<string> {
    const client = this.clients.get(serverId);
    if (!client) throw new Error(`MCP server "${serverId}" not found or not connected`);
    return client.readResource(uri);
  }

  async refreshServer(config: McpServerConfig): Promise<void> {
    const client = this.clients.get(config.id);
    if (client?.status === 'connected') {
      await client.refreshCapabilities().catch(() => {});
    }
  }
}

// Use global to share the singleton across Next.js module instances
// (instrumentation.ts and API routes can load separate module copies)
const g = global as typeof global & { __mcpManager?: McpManager };
if (!g.__mcpManager) g.__mcpManager = new McpManager();
export const mcpManager: McpManager = g.__mcpManager;
