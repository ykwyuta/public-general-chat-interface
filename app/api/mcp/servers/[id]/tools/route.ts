import { getMcpServer } from '@/lib/db';
import { mcpManager } from '@/lib/mcp/mcp-manager';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = getMcpServer(id);
  if (!server) return Response.json({ error: 'Not found' }, { status: 404 });

  const tools = mcpManager.getToolsForServers([id]);
  return Response.json({ tools });
}
