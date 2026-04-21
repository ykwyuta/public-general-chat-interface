import { mcpManager } from '@/lib/mcp/mcp-manager';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const status = mcpManager.getStatus(id);
  return Response.json(status);
}
