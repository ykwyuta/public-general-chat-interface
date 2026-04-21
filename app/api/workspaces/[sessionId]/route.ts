import fs from 'fs';
import { resolveWorkspaceDir, listWorkspaceEntries, getWorkspaceRoot } from '@/lib/workspace';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  let workspaceDir: string;
  try {
    workspaceDir = resolveWorkspaceDir(sessionId);
  } catch {
    return Response.json({ error: 'Invalid sessionId' }, { status: 400 });
  }

  if (!fs.existsSync(workspaceDir)) {
    return Response.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const entries = listWorkspaceEntries(workspaceDir);

  return Response.json({
    sessionId,
    workspacePath: workspaceDir,
    entries,
  });
}
