import fs from 'fs';
import { resolveWorkspaceDir, resolveSafePath } from '@/lib/workspace';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const { searchParams } = new URL(req.url);
  const filePath = searchParams.get('path');

  let workspaceDir: string;
  try {
    workspaceDir = resolveWorkspaceDir(sessionId);
  } catch {
    return Response.json({ error: 'Invalid sessionId' }, { status: 400 });
  }

  if (!filePath) {
    return Response.json({ error: 'path parameter is required' }, { status: 400 });
  }

  let resolvedPath: string;
  try {
    resolvedPath = resolveSafePath(sessionId, filePath);
  } catch {
    return Response.json({ error: 'Path traversal detected' }, { status: 400 });
  }

  if (!fs.existsSync(resolvedPath)) {
    return Response.json({ error: 'File not found' }, { status: 404 });
  }

  const stat = fs.statSync(resolvedPath);
  if (stat.isDirectory()) {
    return Response.json({ error: `"${filePath}" is a directory, not a file` }, { status: 400 });
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');

  return Response.json({
    path: filePath,
    content,
    size: stat.size,
  });
}
