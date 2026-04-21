export type McpTransportType = 'stdio' | 'sse';

export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransportType;
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface McpServerStatus {
  id: string;
  status: McpConnectionStatus;
  error?: string;
  toolCount: number;
  resourceCount: number;
  connectedAt?: string;
}

export interface McpTool {
  serverId: string;
  serverName: string;
  name: string;
  qualifiedName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResource {
  serverId: string;
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}
