import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpServerConfig, McpTool, McpResource, McpConnectionStatus } from '../../types/mcp';

export class McpClient {
  private client: Client | null = null;
  private _status: McpConnectionStatus = 'disconnected';
  private _error?: string;
  private _tools: McpTool[] = [];
  private _resources: McpResource[] = [];
  private _connectedAt?: string;

  constructor(private readonly config: McpServerConfig) {}

  get status(): McpConnectionStatus { return this._status; }
  get error(): string | undefined { return this._error; }
  get tools(): McpTool[] { return this._tools; }
  get resources(): McpResource[] { return this._resources; }
  get connectedAt(): string | undefined { return this._connectedAt; }

  async connect(): Promise<void> {
    this._status = 'connecting';
    this._error = undefined;

    try {
      this.client = new Client(
        { name: 'general-chat-interface', version: '1.0.0' },
        { capabilities: {} },
      );

      let transport;
      if (this.config.transport === 'stdio') {
        if (!this.config.command) throw new Error('stdio transport requires command');
        transport = new StdioClientTransport({
          command: this.config.command,
          args: this.config.args ?? [],
          env: this.config.env ? { ...process.env, ...this.config.env } as Record<string, string> : undefined,
        });
      } else {
        if (!this.config.url) throw new Error('sse transport requires url');
        transport = new SSEClientTransport(new URL(this.config.url));
      }

      await this.client.connect(transport);
      this._status = 'connected';
      this._connectedAt = new Date().toISOString();

      await this._refreshCapabilities();
    } catch (e) {
      this._status = 'error';
      this._error = e instanceof Error ? e.message : String(e);
      this.client = null;
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try { await this.client.close(); } catch { /* ignore */ }
      this.client = null;
    }
    this._status = 'disconnected';
    this._tools = [];
    this._resources = [];
    this._connectedAt = undefined;
  }

  async refreshCapabilities(): Promise<void> {
    await this._refreshCapabilities();
  }

  private async _refreshCapabilities(): Promise<void> {
    if (!this.client) return;

    const toolsResult = await this.client.listTools().catch(() => ({ tools: [] }));
    this._tools = toolsResult.tools.map(t => ({
      serverId: this.config.id,
      serverName: this.config.name,
      name: t.name,
      qualifiedName: `${this.config.id}__${t.name}`,
      description: t.description ?? '',
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? {},
    }));

    const resourcesResult = await this.client.listResources().catch(() => ({ resources: [] }));
    this._resources = resourcesResult.resources.map(r => ({
      serverId: this.config.id,
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (!this.client) throw new Error(`MCP server "${this.config.name}" is not connected`);
    const result = await this.client.callTool({ name, arguments: args });
    const contents = result.content as Array<{ type: string; text?: string }>;
    return contents
      .filter(c => c.type === 'text')
      .map(c => c.text ?? '')
      .join('\n');
  }

  async readResource(uri: string): Promise<string> {
    if (!this.client) throw new Error(`MCP server "${this.config.name}" is not connected`);
    const result = await this.client.readResource({ uri });
    const contents = result.contents as Array<{ uri: string; text?: string; blob?: string }>;
    return contents.map(c => c.text ?? '').join('\n');
  }
}
