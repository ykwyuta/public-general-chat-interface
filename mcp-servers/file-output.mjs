#!/usr/bin/env node
/**
 * File Output MCP Server
 *
 * Provides file I/O tools scoped to per-session workspaces.
 * Workspace root is set via MCP_WORKSPACE_ROOT env var (default: ./workspaces).
 * Each session is isolated under {WORKSPACE_ROOT}/{workspace_id}/.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';

const WORKSPACE_ROOT = process.env.MCP_WORKSPACE_ROOT
  ? path.resolve(process.env.MCP_WORKSPACE_ROOT)
  : path.resolve('workspaces');

fs.mkdirSync(WORKSPACE_ROOT, { recursive: true });

function validateWorkspaceId(id) {
  if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new Error(`Invalid workspace_id: "${id}". Must be alphanumeric with hyphens/underscores only.`);
  }
}

function getWorkspaceDir(workspaceId) {
  validateWorkspaceId(workspaceId);
  return path.join(WORKSPACE_ROOT, workspaceId);
}

function resolveSafePath(workspaceId, filePath) {
  const workspaceDir = getWorkspaceDir(workspaceId);
  const normalized = path.normalize(filePath);
  const resolved = path.resolve(workspaceDir, normalized);
  // Prevent path traversal outside the workspace
  if (!resolved.startsWith(workspaceDir + path.sep) && resolved !== workspaceDir) {
    throw new Error(`Path traversal detected: "${filePath}" escapes the workspace boundary.`);
  }
  return resolved;
}

function listRecursive(baseDir, currentDir, maxDepth = 6, depth = 0) {
  if (depth >= maxDepth) return [];
  const entries = [];
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      entries.push(`${relPath}/`);
      entries.push(...listRecursive(baseDir, fullPath, maxDepth, depth + 1));
    } else {
      const stat = fs.statSync(fullPath);
      entries.push(`${relPath} (${stat.size} bytes)`);
    }
  }
  return entries;
}

const TOOLS = [
  {
    name: 'write_file',
    description: 'Write (or overwrite) a file in the session workspace. Parent directories are created automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: {
          type: 'string',
          description: 'Session workspace ID (automatically provided by the server).',
        },
        path: {
          type: 'string',
          description: 'Relative file path within the workspace (e.g. "report.md" or "src/main.py").',
        },
        content: {
          type: 'string',
          description: 'Text content to write to the file.',
        },
      },
      required: ['workspace_id', 'path', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file from the session workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: {
          type: 'string',
          description: 'Session workspace ID (automatically provided by the server).',
        },
        path: {
          type: 'string',
          description: 'Relative file path within the workspace.',
        },
      },
      required: ['workspace_id', 'path'],
    },
  },
  {
    name: 'list_files',
    description: 'List all files and directories in the session workspace (or a subdirectory).',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: {
          type: 'string',
          description: 'Session workspace ID (automatically provided by the server).',
        },
        path: {
          type: 'string',
          description: 'Relative directory path to list (default: workspace root ".").',
        },
      },
      required: ['workspace_id'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file or directory (recursively) from the session workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: {
          type: 'string',
          description: 'Session workspace ID (automatically provided by the server).',
        },
        path: {
          type: 'string',
          description: 'Relative path of the file or directory to delete.',
        },
      },
      required: ['workspace_id', 'path'],
    },
  },
  {
    name: 'create_directory',
    description: 'Create a directory (and any missing parent directories) in the session workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: {
          type: 'string',
          description: 'Session workspace ID (automatically provided by the server).',
        },
        path: {
          type: 'string',
          description: 'Relative directory path to create.',
        },
      },
      required: ['workspace_id', 'path'],
    },
  },
  {
    name: 'get_workspace_info',
    description: 'Get the absolute path and file listing of the session workspace.',
    inputSchema: {
      type: 'object',
      properties: {
        workspace_id: {
          type: 'string',
          description: 'Session workspace ID (automatically provided by the server).',
        },
      },
      required: ['workspace_id'],
    },
  },
];

const server = new Server(
  { name: 'file-output', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'write_file': {
        const workspaceDir = getWorkspaceDir(args.workspace_id);
        fs.mkdirSync(workspaceDir, { recursive: true });
        const filePath = resolveSafePath(args.workspace_id, args.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, args.content, 'utf-8');
        const relPath = path.relative(WORKSPACE_ROOT, filePath);
        return {
          content: [{ type: 'text', text: `Written: ${relPath} (${Buffer.byteLength(args.content, 'utf-8')} bytes)` }],
        };
      }

      case 'read_file': {
        const filePath = resolveSafePath(args.workspace_id, args.path);
        if (!fs.existsSync(filePath)) {
          throw new Error(`File not found: ${args.path}`);
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          throw new Error(`"${args.path}" is a directory, not a file.`);
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        return { content: [{ type: 'text', text: content }] };
      }

      case 'list_files': {
        const dirPath = resolveSafePath(args.workspace_id, args.path ?? '.');
        if (!fs.existsSync(dirPath)) {
          return { content: [{ type: 'text', text: '(workspace does not exist yet — no files written)' }] };
        }
        const entries = listRecursive(dirPath, dirPath);
        return {
          content: [{ type: 'text', text: entries.length > 0 ? entries.join('\n') : '(empty)' }],
        };
      }

      case 'delete_file': {
        const filePath = resolveSafePath(args.workspace_id, args.path);
        if (!fs.existsSync(filePath)) {
          throw new Error(`Not found: ${args.path}`);
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
        return { content: [{ type: 'text', text: `Deleted: ${args.path}` }] };
      }

      case 'create_directory': {
        const workspaceDir = getWorkspaceDir(args.workspace_id);
        fs.mkdirSync(workspaceDir, { recursive: true });
        const dirPath = resolveSafePath(args.workspace_id, args.path);
        fs.mkdirSync(dirPath, { recursive: true });
        return { content: [{ type: 'text', text: `Directory created: ${args.path}` }] };
      }

      case 'get_workspace_info': {
        const workspaceDir = getWorkspaceDir(args.workspace_id);
        if (!fs.existsSync(workspaceDir)) {
          return {
            content: [{
              type: 'text',
              text: `Workspace path: ${workspaceDir}\nStatus: not yet created (no files written)`,
            }],
          };
        }
        const entries = listRecursive(workspaceDir, workspaceDir);
        return {
          content: [{
            type: 'text',
            text: `Workspace path: ${workspaceDir}\nFiles (${entries.length}):\n${entries.join('\n') || '(empty)'}`,
          }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return {
      content: [{ type: 'text', text: `Error: ${e.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
