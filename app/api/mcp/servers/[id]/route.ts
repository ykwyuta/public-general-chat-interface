import { getMcpServer, updateMcpServer, deleteMcpServer } from '@/lib/db';
import { mcpManager } from '@/lib/mcp/mcp-manager';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = getMcpServer(id);
  if (!server) return Response.json({ error: 'Not found' }, { status: 404 });

  const status = mcpManager.getStatus(id);
  return Response.json({
    ...server,
    env: server.env
      ? Object.fromEntries(Object.keys(server.env).map(k => [k, '***']))
      : undefined,
    headers: server.headers
      ? Object.fromEntries(Object.keys(server.headers).map(k => [k, '***']))
      : undefined,
    status: status.status,
    error: status.error,
    toolCount: status.toolCount,
    resourceCount: status.resourceCount,
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = getMcpServer(id);
  if (!server) return Response.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json() as Partial<{
    name: string;
    transport: 'stdio' | 'sse';
    command: string;
    args: string[];
    env: Record<string, string>;
    url: string;
    headers: Record<string, string>;
    enabled: boolean;
  }>;

  updateMcpServer(id, body);

  const updated = getMcpServer(id)!;
  await mcpManager.disconnect(id);
  if (updated.enabled) {
    mcpManager.connect(updated).catch(() => {});
  }

  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = getMcpServer(id);
  if (!server) return Response.json({ error: 'Not found' }, { status: 404 });

  await mcpManager.disconnect(id);
  deleteMcpServer(id);
  return Response.json({ ok: true });
}
