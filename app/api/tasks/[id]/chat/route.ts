import { NextResponse } from 'next/server';
import { getTask, listMessages, addTaskMessage } from '@/lib/taskDb';
import { getProvider } from '@/lib/providers/index';
import { buildSystemPrompt } from '@/lib/taskSystemPrompt';
import { buildMessagesForAgent } from '@/lib/taskMessageAdapter';
import { mcpManager } from '@/lib/mcp/mcp-manager';
import { BUILTIN_FILE_OUTPUT_ID } from '@/lib/mcp/builtin-servers';
import type { LlmParticipant } from '@/types/task';
import type { ToolDefinition, ChatMessage, MessageContentBlock } from '@/lib/llm-provider';

export const runtime = 'nodejs';

function stripWorkspaceIdFromSchema(schema: ToolDefinition['input_schema']): ToolDefinition['input_schema'] {
  const props = { ...(schema.properties as Record<string, unknown>) };
  delete props.workspace_id;
  const required = ((schema.required ?? []) as string[]).filter(r => r !== 'workspace_id');
  return { ...schema, properties: props, required };
}

function buildMcpTools(serverIds: string[]): ToolDefinition[] {
  if (serverIds.length === 0) return [];
  return mcpManager.getToolsForServers(serverIds).map(t => ({
    name: t.qualifiedName,
    description: `[MCP: ${t.serverName}] ${t.description}`,
    input_schema: t.serverId === BUILTIN_FILE_OUTPUT_ID
      ? stripWorkspaceIdFromSchema(t.inputSchema as ToolDefinition['input_schema'])
      : (t.inputSchema as ToolDefinition['input_schema']),
  }));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const username = req.headers.get('x-username');
  if (!username) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const task = getTask(id);
  if (!task) return new Response('Not found', { status: 404 });
  if (task.status !== 'active') return new Response('Task is not active', { status: 400 });

  const { agentName, triggerMessageId } = await req.json() as {
    agentName: string;
    triggerMessageId: string;
  };

  const agent = task.participants.find(
    p => p.participantType === 'llm' && p.agentName === agentName,
  ) as LlmParticipant | undefined;

  if (!agent) return new Response(`エージェント "${agentName}" が見つかりません`, { status: 404 });

  const allMessages = listMessages(id);
  const triggerMessage = allMessages.find(m => m.id === triggerMessageId);
  const callerName = triggerMessage?.senderName;

  const baseSystemPrompt = buildSystemPrompt(task, agentName, callerName);
  const agentMcpServerIds = agent.mcpServerIds ?? [];
  const mcpTools = buildMcpTools(agentMcpServerIds);
  const hasMcpTools = mcpTools.length > 0;
  const hasFileOutput = agentMcpServerIds.includes(BUILTIN_FILE_OUTPUT_ID);

  const effectiveSystemPrompt = hasFileOutput
    ? baseSystemPrompt + `\n\n---\nYou have access to a server-side file output workspace for this task. Use the File Output MCP tools to save files. The workspace is isolated to this task.`
    : baseSystemPrompt;

  const provider = getProvider(agent.provider);

  try {
    const conversationMessages: ChatMessage[] = buildMessagesForAgent(allMessages, agentName);
    let fullText = '';
    let continueLoop = true;

    while (continueLoop) {
      continueLoop = false;
      const toolUses: Array<{ id: string; name: string; input: Record<string, unknown>; thought_signature?: string }> = [];
      let loopText = '';

      for await (const chunk of provider.streamChat({
        systemPrompt: effectiveSystemPrompt,
        messages: conversationMessages,
        model: agent.model,
        tools: hasMcpTools ? mcpTools : undefined,
      })) {
        if (chunk.type === 'text' && chunk.text) {
          loopText += chunk.text;
          fullText += chunk.text;
        } else if (chunk.type === 'tool_use' && chunk.toolUse) {
          toolUses.push(chunk.toolUse);
        } else if (chunk.type === 'done') {
          break;
        } else if (chunk.type === 'error') {
          const errId = crypto.randomUUID();
          const errText = `[${agentName}] 応答エラー: ${chunk.error ?? '不明なエラー'}`;
          const saved = addTaskMessage(errId, id, 'system', agentName, errText, null);
          return NextResponse.json(saved);
        }
      }

      if (toolUses.length > 0) {
        continueLoop = true;
        const assistantBlocks: MessageContentBlock[] = [];
        if (loopText) assistantBlocks.push({ type: 'text', text: loopText });
        for (const tu of toolUses) {
          assistantBlocks.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input, thought_signature: tu.thought_signature });
        }
        conversationMessages.push({ role: 'assistant', content: assistantBlocks });

        const resultBlocks: MessageContentBlock[] = [];
        for (const tu of toolUses) {
          let callInput = tu.input;
          if (tu.name.startsWith(`${BUILTIN_FILE_OUTPUT_ID}__`)) {
            callInput = { workspace_id: id, ...tu.input };
          }
          let result: string;
          try {
            result = await mcpManager.callTool(tu.name, callInput);
          } catch (e) {
            result = `Error: ${e instanceof Error ? e.message : String(e)}`;
          }
          resultBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
        }
        conversationMessages.push({ role: 'user', content: resultBlocks });
      }
    }

    const msgId = crypto.randomUUID();
    const saved = addTaskMessage(msgId, id, 'llm', agentName, fullText, null);
    return NextResponse.json(saved);
  } catch (err) {
    const errId = crypto.randomUUID();
    const errText = `[${agentName}] 応答エラー: ${(err as Error)?.message ?? '不明なエラー'}`;
    const saved = addTaskMessage(errId, id, 'system', agentName, errText, null);
    return NextResponse.json(saved, { status: 500 });
  }
}
