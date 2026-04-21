import { mcpManager } from '@/lib/mcp/mcp-manager';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await mcpManager.disconnect(id);
  return Response.json({ ok: true });
}
