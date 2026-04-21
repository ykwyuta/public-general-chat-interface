import { getProvider } from '@/lib/providers';
import { mcpManager } from '@/lib/mcp/mcp-manager';
import { BUILTIN_FILE_OUTPUT_ID } from '@/lib/mcp/builtin-servers';
import type { StreamChatParams, ToolDefinition } from '@/lib/llm-provider';

export const runtime = 'nodejs';

/** Strip workspace_id from tool schema properties so the LLM doesn't see it. */
function stripWorkspaceIdFromSchema(schema: ToolDefinition['input_schema']): ToolDefinition['input_schema'] {
  const props = { ...(schema.properties as Record<string, unknown>) };
  delete props.workspace_id;
  const required = ((schema.required ?? []) as string[]).filter(r => r !== 'workspace_id');
  return { ...schema, properties: props, required };
}

export async function POST(req: Request) {
  const body = await req.json() as Omit<StreamChatParams, 'maxTokens'> & {
    provider?: string;
    mcpServerIds?: string[];
    sessionId?: string;
  };
  const { provider: providerId, messages, model, systemPrompt, tools, mcpServerIds, sessionId } = body;

  let provider;
  try {
    if (!providerId) {
      throw new Error('Provider is required');
    }
    provider = getProvider(providerId);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // When no specific servers are selected, use all connected servers
  const rawMcpTools = mcpServerIds?.length
    ? mcpManager.getToolsForServers(mcpServerIds)
    : mcpManager.getAllTools();
  const hasFileOutput = rawMcpTools.some(t => t.serverId === BUILTIN_FILE_OUTPUT_ID) && !!sessionId;

  // Merge static tools with MCP tools
  const mcpTools: ToolDefinition[] = rawMcpTools.map(t => {
    let schema = t.inputSchema as ToolDefinition['input_schema'];
    // Hide workspace_id from the LLM for file-output tools; the server injects it
    if (t.serverId === BUILTIN_FILE_OUTPUT_ID && sessionId) {
      schema = stripWorkspaceIdFromSchema(schema);
    }
    return {
      name: t.qualifiedName,
      description: `[MCP: ${t.serverName}] ${t.description}`,
      input_schema: schema,
    };
  });

  const allTools = [...(tools ?? []), ...mcpTools];

  // Append file-output workspace context to system prompt so the LLM knows it can save files
  let effectiveSystemPrompt = systemPrompt;
  if (hasFileOutput) {
    const workspaceNote = `\n\n---\nYou have access to a server-side file output workspace for this session. Use the File Output MCP tools to save files. The workspace is isolated to this conversation.`;
    effectiveSystemPrompt = (systemPrompt ?? '') + workspaceNote;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const gen = provider.streamChat({
          systemPrompt: effectiveSystemPrompt,
          messages,
          model,
          tools: allTools.length > 0 ? allTools : undefined,
        });
        for await (const chunk of gen) {
          // If an MCP tool was called, execute it server-side
          if (chunk.type === 'tool_use' && chunk.toolUse) {
            const { name, input } = chunk.toolUse;
            if (name.includes('__')) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));

              let callInput = input;
              // Inject workspace_id for file-output tools (LLM doesn't pass it)
              if (name.startsWith(`${BUILTIN_FILE_OUTPUT_ID}__`) && sessionId) {
                callInput = { workspace_id: sessionId, ...input };
              }

              let result: string;
              try {
                result = await mcpManager.callTool(name, callInput);
              } catch (e) {
                result = `Error: ${e instanceof Error ? e.message : String(e)}`;
              }
              const resultChunk = {
                type: 'tool_result',
                toolResult: { tool_use_id: chunk.toolUse.id, content: result },
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultChunk)}\n\n`));
              continue;
            }
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
      } catch (e) {
        const errChunk = { type: 'error', error: e instanceof Error ? e.message : String(e) };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errChunk)}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
