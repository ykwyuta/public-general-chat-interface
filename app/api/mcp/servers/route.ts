import { listMcpServers, createMcpServer } from '@/lib/db';
import { mcpManager } from '@/lib/mcp/mcp-manager';

export const runtime = 'nodejs';

export async function GET() {
  const servers = listMcpServers();
  const statuses = mcpManager.getStatuses(servers.map(s => s.id));

  const result = servers.map(server => {
    const status = statuses.find(s => s.id === server.id);
    return {
      ...server,
      // mask secret values
      env: server.env
        ? Object.fromEntries(Object.keys(server.env).map(k => [k, '***']))
        : undefined,
      headers: server.headers
        ? Object.fromEntries(Object.keys(server.headers).map(k => [k, '***']))
        : undefined,
      status: status?.status ?? 'disconnected',
      error: status?.error,
      toolCount: status?.toolCount ?? 0,
      resourceCount: status?.resourceCount ?? 0,
      connectedAt: status?.connectedAt,
    };
  });

  return Response.json({ servers: result });
}

export async function POST(req: Request) {
  const body = await req.json() as {
    name: string;
    transport: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    enabled?: boolean;
  };

  if (!body.name || !body.transport) {
    return Response.json({ error: 'name and transport are required' }, { status: 400 });
  }
  if (body.transport === 'stdio' && !body.command) {
    return Response.json({ error: 'command is required for stdio transport' }, { status: 400 });
  }
  if (body.transport === 'sse' && !body.url) {
    return Response.json({ error: 'url is required for sse transport' }, { status: 400 });
  }

  const config = createMcpServer({
    id: crypto.randomUUID(),
    name: body.name,
    transport: body.transport,
    command: body.command,
    args: body.args,
    env: body.env,
    url: body.url,
    headers: body.headers,
    enabled: body.enabled ?? true,
  });

  if (config.enabled) {
    mcpManager.connect(config).catch(() => {});
  }

  return Response.json({
    id: config.id,
    name: config.name,
    transport: config.transport,
    enabled: config.enabled,
    createdAt: config.createdAt,
  }, { status: 201 });
}
