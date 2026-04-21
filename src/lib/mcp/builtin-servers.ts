import path from 'path';
import { listMcpServers, getMcpServer, createMcpServer, updateMcpServer } from '@/lib/db';
import { mcpManager } from './mcp-manager';

export const BUILTIN_FILE_OUTPUT_ID = 'builtin-file-output';
export const BUILTIN_BRAVE_SEARCH_ID = 'builtin-brave-search';
export const BUILTIN_MLIT_GEOSPATIAL_ID = 'builtin-mlit-geospatial';

/**
 * Ensures the built-in file-output MCP server is registered in the DB and connected.
 * Called once at server startup via instrumentation.ts.
 */
export async function initBuiltinMcpServers(): Promise<void> {
  // --- User-defined servers (connect all enabled servers from DB) ---
  const BUILTIN_IDS = new Set([BUILTIN_FILE_OUTPUT_ID, BUILTIN_BRAVE_SEARCH_ID, BUILTIN_MLIT_GEOSPATIAL_ID]);
  const userServers = listMcpServers().filter(s => !BUILTIN_IDS.has(s.id) && s.enabled);
  await Promise.allSettled(
    userServers.map(s =>
      mcpManager.connect(s).catch(e => {
        console.error(`[mcp] Failed to connect "${s.name}":`, e);
      }),
    ),
  );

  // --- File Output ---
  const fileOutputScriptPath = path.join(process.cwd(), 'mcp-servers', 'file-output.mjs');

  const existingFileOutput = getMcpServer(BUILTIN_FILE_OUTPUT_ID);

  if (!existingFileOutput) {
    createMcpServer({
      id: BUILTIN_FILE_OUTPUT_ID,
      name: 'File Output',
      transport: 'stdio',
      command: 'node',
      args: [fileOutputScriptPath],
      // MCP_WORKSPACE_ROOT is inherited from the parent process environment
      enabled: true,
    });
  } else if (existingFileOutput.args?.[0] !== fileOutputScriptPath) {
    // Update script path if the project was moved
    updateMcpServer(BUILTIN_FILE_OUTPUT_ID, { args: [fileOutputScriptPath] });
  }

  const fileOutputConfig = getMcpServer(BUILTIN_FILE_OUTPUT_ID)!;
  if (fileOutputConfig.enabled) {
    await mcpManager.connect(fileOutputConfig).catch(e => {
      console.error('[builtin-file-output] Failed to connect:', e);
    });
  }

  // --- Brave Search (only when BRAVE_API_KEY is configured) ---
  const braveApiKey = process.env.BRAVE_API_KEY;
  if (braveApiKey) {
    const braveScriptPath = path.join(process.cwd(), 'mcp-servers', 'brave-search.mjs');
    const existingBrave = getMcpServer(BUILTIN_BRAVE_SEARCH_ID);

    if (!existingBrave) {
      createMcpServer({
        id: BUILTIN_BRAVE_SEARCH_ID,
        name: 'Brave Search',
        transport: 'stdio',
        command: 'node',
        args: [braveScriptPath],
        env: { BRAVE_API_KEY: braveApiKey },
        enabled: true,
      });
    } else {
      // Keep script path and API key up to date
      const updates: Parameters<typeof updateMcpServer>[1] = {};
      if (existingBrave.args?.[0] !== braveScriptPath) updates.args = [braveScriptPath];
      if (existingBrave.env?.BRAVE_API_KEY !== braveApiKey) updates.env = { BRAVE_API_KEY: braveApiKey };
      if (Object.keys(updates).length > 0) updateMcpServer(BUILTIN_BRAVE_SEARCH_ID, updates);
    }

    const braveConfig = getMcpServer(BUILTIN_BRAVE_SEARCH_ID)!;
    if (braveConfig.enabled) {
      await mcpManager.connect(braveConfig).catch(e => {
        console.error('[builtin-brave-search] Failed to connect:', e);
      });
    }
  }

  // --- MLIT Geospatial (only when MLIT_LIBRARY_API_KEY is configured) ---
  const mlitApiKey = process.env.MLIT_LIBRARY_API_KEY;
  if (mlitApiKey) {
    const mlitScriptPath = path.join(process.cwd(), 'mcp-servers', 'mlit-geospatial.mjs');
    const existingMlit = getMcpServer(BUILTIN_MLIT_GEOSPATIAL_ID);

    if (!existingMlit) {
      createMcpServer({
        id: BUILTIN_MLIT_GEOSPATIAL_ID,
        name: 'MLIT Geospatial',
        transport: 'stdio',
        command: 'node',
        args: [mlitScriptPath],
        env: { MLIT_LIBRARY_API_KEY: mlitApiKey },
        enabled: true,
      });
    } else {
      const updates: Parameters<typeof updateMcpServer>[1] = {};
      if (existingMlit.args?.[0] !== mlitScriptPath) updates.args = [mlitScriptPath];
      if (existingMlit.env?.MLIT_LIBRARY_API_KEY !== mlitApiKey) updates.env = { MLIT_LIBRARY_API_KEY: mlitApiKey };
      if (Object.keys(updates).length > 0) updateMcpServer(BUILTIN_MLIT_GEOSPATIAL_ID, updates);
    }

    const mlitConfig = getMcpServer(BUILTIN_MLIT_GEOSPATIAL_ID)!;
    if (mlitConfig.enabled) {
      await mcpManager.connect(mlitConfig).catch(e => {
        console.error('[builtin-mlit-geospatial] Failed to connect:', e);
      });
    }
  }
}
