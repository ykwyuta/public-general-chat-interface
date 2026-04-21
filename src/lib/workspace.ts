import path from 'path';
import fs from 'fs';

const WORKSPACE_ROOT = process.env.MCP_WORKSPACE_ROOT
  ? path.resolve(process.env.MCP_WORKSPACE_ROOT)
  : path.resolve('workspaces');

const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function getWorkspaceRoot(): string {
  return WORKSPACE_ROOT;
}

export function resolveWorkspaceDir(sessionId: string): string {
  if (!WORKSPACE_ID_PATTERN.test(sessionId)) {
    throw new Error(`Invalid sessionId: "${sessionId}"`);
  }
  return path.join(WORKSPACE_ROOT, sessionId);
}

export function resolveSafePath(sessionId: string, filePath: string): string {
  const workspaceDir = resolveWorkspaceDir(sessionId);
  const resolved = path.resolve(workspaceDir, path.normalize(filePath));
  if (!resolved.startsWith(workspaceDir + path.sep) && resolved !== workspaceDir) {
    throw new Error(`Path traversal detected: "${filePath}"`);
  }
  return resolved;
}

export interface WorkspaceEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

export function listWorkspaceEntries(workspaceDir: string, baseDir: string = workspaceDir, depth = 0): WorkspaceEntry[] {
  if (depth > 6) return [];
  const entries: WorkspaceEntry[] = [];
  for (const entry of fs.readdirSync(workspaceDir, { withFileTypes: true })) {
    const fullPath = path.join(workspaceDir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      entries.push({ path: relPath, type: 'directory' });
      entries.push(...listWorkspaceEntries(fullPath, baseDir, depth + 1));
    } else {
      const stat = fs.statSync(fullPath);
      entries.push({ path: relPath, type: 'file', size: stat.size });
    }
  }
  return entries;
}
