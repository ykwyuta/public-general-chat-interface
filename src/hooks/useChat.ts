import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useMcpStore } from '../stores/mcpStore';
import { parseArtifacts } from '../lib/artifactParser';
import { getTools, executeTool } from '../lib/tool-registry';
import type { StreamChunk, ChatMessage, MessageContentBlock } from '../lib/llm-provider';

import { useAuthStore } from '../stores/authStore';
import type { Message, ImageAttachment } from '../types';


type ExtendedStreamChunk = StreamChunk | {
  type: 'tool_result';
  toolResult: { tool_use_id: string; content: string };
};

async function saveMessage(conversationId: string, message: Message): Promise<void> {
  await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
}

async function deleteMessagesFromDb(conversationId: string, fromMessageId: string): Promise<void> {
  await fetch(
    `/api/conversations/${conversationId}/messages?fromMessageId=${encodeURIComponent(fromMessageId)}`,
    { method: 'DELETE' },
  );
}

async function* readSSE(response: Response): AsyncGenerator<ExtendedStreamChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        yield JSON.parse(data) as ExtendedStreamChunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function useChat() {
  const store = useChatStore();

  const sendMessage = useCallback(async (
    text: string,
    conversationId?: string,
    images?: ImageAttachment[],
  ) => {
    const { settings, addMessage, updateMessage,
            updateConversationTitle, setStreaming, createConversation } = store;
    const { selectedServerIds } = useMcpStore.getState();

    let convId = conversationId ?? store.activeConversationId;
    if (!convId) {
      convId = await createConversation();
    }


    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      images: images && images.length > 0 ? images : undefined,
      artifacts: [],
      timestamp: new Date(),
    };
    addMessage(convId, userMsg);
    await saveMessage(convId, userMsg);

    // Extract mentions and artifacts for notifications
    const mentionRegex = /@([\w\d_-]+)/g;
    const artifactRegex = /#([\w\d_.-]+)/g;

    const mentions = Array.from(text.matchAll(mentionRegex)).map(m => m[1]);
    const requestedArtifacts = Array.from(text.matchAll(artifactRegex)).map(m => m[1]);

    const currentUser = useAuthStore.getState().user;

    if (currentUser && mentions.length > 0 && requestedArtifacts.length > 0) {
      const activeConv = useChatStore.getState().conversations.find(c => c.id === convId);
      if (activeConv) {
        // Find the matching artifact by filename in the current conversation
        const allArtifacts = activeConv.messages.flatMap(m => m.artifacts);
        const artifactIds = requestedArtifacts.map(filename => {
           const found = allArtifacts.find(a => a.filename === filename);
           return found ? found.id : null;
        }).filter(Boolean);

        if (artifactIds.length > 0) {
           const artifactId = artifactIds[0]; // just use the first matched one for now

           for (const username of mentions) {
             // Avoid sending notification to self
             if (username === currentUser.username) continue;

             await fetch('/api/notifications', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                 userUsername: username,
                 senderUsername: currentUser.username,
                 message: text,
                 artifactId,
                 sourceConvId: convId,
               })
             }).catch(console.error);
           }
        }
      }
    }

    const assistantMsgId = crypto.randomUUID();

    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      artifacts: [],
      timestamp: new Date(),
    };
    addMessage(convId, assistantMsg);
    setStreaming(true, assistantMsgId);

    try {
      const conversation = useChatStore.getState().conversations.find(c => c.id === convId);

      const history: ChatMessage[] = (conversation?.messages ?? [])
        .filter(m => m.id !== assistantMsgId)
        .map(m => {
          if (m.role === 'user' && m.images && m.images.length > 0) {
            const blocks: MessageContentBlock[] = [
              ...m.images.map(img => ({
                type: 'image' as const,
                media_type: img.mediaType,
                data: img.data,
              })),
              { type: 'text', text: m.content },
            ];
            return { role: 'user' as const, content: blocks };
          }
          return { role: m.role as 'user' | 'assistant', content: m.content };
        });

      const tools = getTools();
      let continueLoop = true;
      let finalText = '';

      while (continueLoop) {
        continueLoop = false;
        const toolUses: Array<{ id: string; name: string; input: Record<string, unknown>; thought_signature?: string }> = [];
        let fullText = '';

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: history,
            model: settings.model,
            provider: settings.provider,
            systemPrompt: settings.systemPrompt,
            tools: tools.length > 0 ? tools : undefined,
            mcpServerIds: selectedServerIds.length > 0 ? selectedServerIds : undefined,
            sessionId: convId,
          }),
        });

        if (!response.ok) {
          updateMessage(convId!, assistantMsgId, { content: `エラー: HTTP ${response.status}` });
          return;
        }

        // MCP tool results come pre-resolved from the server (tool_result chunks)
        const mcpResultMap = new Map<string, string>();

        for await (const chunk of readSSE(response)) {
          if (chunk.type === 'text' && chunk.text) {
            fullText += chunk.text;
            updateMessage(convId!, assistantMsgId, { content: fullText });
          } else if (chunk.type === 'tool_use' && chunk.toolUse) {
            toolUses.push(chunk.toolUse);
          } else if (chunk.type === 'tool_result' && 'toolResult' in chunk) {
            mcpResultMap.set(chunk.toolResult.tool_use_id, chunk.toolResult.content);
          } else if (chunk.type === 'error') {
            updateMessage(convId!, assistantMsgId, { content: `エラー: ${chunk.error}` });
            return;
          }
        }

        if (toolUses.length > 0) {
          continueLoop = true;

          const assistantBlocks: MessageContentBlock[] = [];
          if (fullText) assistantBlocks.push({ type: 'text', text: fullText });
          for (const tu of toolUses) {
            assistantBlocks.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input, thought_signature: tu.thought_signature });
          }
          history.push({ role: 'assistant', content: assistantBlocks });

          const resultBlocks: MessageContentBlock[] = [];
          for (const tu of toolUses) {
            let result: string;
            if (mcpResultMap.has(tu.id)) {
              result = mcpResultMap.get(tu.id)!;
            } else {
              try {
                result = await executeTool(tu.name, tu.input);
              } catch (e) {
                result = `Error: ${e instanceof Error ? e.message : String(e)}`;
              }
            }
            resultBlocks.push({ type: 'tool_result', tool_use_id: tu.id, content: result });
          }
          history.push({ role: 'user', content: resultBlocks });

          updateMessage(convId!, assistantMsgId, { content: '' });
        } else {
          finalText = fullText;
        }
      }

      const artifacts = parseArtifacts(finalText);
      const finalAssistantMsg: Message = {
        ...assistantMsg,
        content: finalText,
        artifacts,
      };
      if (artifacts.length > 0) {
        updateMessage(convId!, assistantMsgId, { artifacts });
      }

      // Persist final assistant message to DB
      await saveMessage(convId!, finalAssistantMsg);

      const conv = useChatStore.getState().conversations.find(c => c.id === convId);
      if (conv && conv.title === '新しいチャット' && conv.messages.length <= 3) {
        // Generate title via server (async, don't await)
        fetch(`/api/conversations/${convId}/title`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstMessage: text, provider: settings.provider }),
        })
          .then(r => r.json())
          .then((data: { title?: string }) => {
            if (data.title) updateConversationTitle(convId!, data.title);
          })
          .catch(() => {});
      }
    } finally {
      setStreaming(false, null);
    }
  }, [store]);

  const regenerateMessage = useCallback(async (messageId: string) => {
    const { activeConversationId, deleteMessagesFrom } = store;
    if (!activeConversationId) return;

    const conv = store.getActiveConversation();
    if (!conv) return;

    const msgIdx = conv.messages.findIndex(m => m.id === messageId);
    if (msgIdx <= 0) return;

    const prevUserMsg = conv.messages[msgIdx - 1];
    if (!prevUserMsg || prevUserMsg.role !== 'user') return;

    deleteMessagesFrom(activeConversationId, messageId);
    await deleteMessagesFromDb(activeConversationId, messageId);
    await sendMessage(prevUserMsg.content, activeConversationId, prevUserMsg.images);
  }, [store, sendMessage]);

  const editAndResend = useCallback(async (messageId: string, newContent: string) => {
    const { activeConversationId, deleteMessagesFrom } = store;
    if (!activeConversationId) return;

    deleteMessagesFrom(activeConversationId, messageId);
    await deleteMessagesFromDb(activeConversationId, messageId);
    await sendMessage(newContent, activeConversationId);
  }, [store, sendMessage]);

  return { sendMessage, regenerateMessage, editAndResend };
}
