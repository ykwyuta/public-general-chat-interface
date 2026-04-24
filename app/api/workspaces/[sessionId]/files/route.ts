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

  const IMAGE_EXTS: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    tiff: 'image/tiff',
    tif: 'image/tiff',
  };

  const ext = (filePath.split('.').pop() ?? '').toLowerCase();
  const mimeType = IMAGE_EXTS[ext];

  if (mimeType) {
    // 画像ファイルはbase64エンコードして返す
    const buffer = fs.readFileSync(resolvedPath);
    const base64 = buffer.toString('base64');
    return Response.json({
      path: filePath,
      content: base64,
      size: stat.size,
      isImage: true,
      mimeType,
    });
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');

  return Response.json({
    path: filePath,
    content,
    size: stat.size,
    isImage: false,
  });
}
