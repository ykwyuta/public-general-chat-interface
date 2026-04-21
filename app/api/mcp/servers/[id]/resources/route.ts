import { getMcpServer } from '@/lib/db';
import { mcpManager } from '@/lib/mcp/mcp-manager';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = getMcpServer(id);
  if (!server) return Response.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const uri = url.searchParams.get('uri');

  if (uri) {
    try {
      const content = await mcpManager.readResource(id, uri);
      return Response.json({ uri, content });
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
    }
  }

  const resources = mcpManager.getResourcesForServer(id);
  return Response.json({ resources });
}
