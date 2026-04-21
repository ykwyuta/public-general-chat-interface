import { getMcpServer } from '@/lib/db';
import { mcpManager } from '@/lib/mcp/mcp-manager';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = getMcpServer(id);
  if (!server) return Response.json({ error: 'Not found' }, { status: 404 });

  try {
    await mcpManager.connect(server);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
