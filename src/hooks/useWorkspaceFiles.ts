import { useState, useEffect, useCallback } from 'react';
import type { Artifact, ArtifactKind } from '../types';

interface WorkspaceEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

export function useWorkspaceFiles(sessionId: string | undefined) {
  const [workspaceArtifacts, setWorkspaceArtifacts] = useState<Artifact[]>([]);

  const fetchWorkspace = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/workspaces/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();

      const files = data.entries.filter((e: WorkspaceEntry) => e.type === 'file');

      const artifacts: Artifact[] = await Promise.all(files.map(async (f: WorkspaceEntry) => {
        const contentRes = await fetch(`/api/workspaces/${sessionId}/files?path=${encodeURIComponent(f.path)}`);
        if (!contentRes.ok) return null;
        const contentData = await contentRes.json();

        const ext = f.path.split('.').pop()?.toLowerCase() || '';
        let kind: ArtifactKind = 'code';
        if (['html'].includes(ext)) kind = 'html';
        else if (['svg'].includes(ext)) kind = 'svg';
        else if (['md', 'markdown'].includes(ext)) kind = 'markdown';

        return {
          id: `ws-${f.path}`,
          filename: f.path,
          language: ext,
          kind,
          content: contentData.content,
          isExpanded: false,
        };
      }));

      setWorkspaceArtifacts(artifacts.filter(Boolean) as Artifact[]);
    } catch (e) {
      console.error('Failed to fetch workspace files:', e);
    }
  }, [sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    fetchWorkspace();
    const interval = setInterval(fetchWorkspace, 5000);
    return () => clearInterval(interval);
  }, [fetchWorkspace]);

  return workspaceArtifacts;
}
