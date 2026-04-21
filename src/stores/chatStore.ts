'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { parseArtifacts } from '../lib/artifactParser';
import type { Conversation, Message, Settings, Artifact } from '../types';
import { getScenario } from '../scenarios/index';
import { useScenarioStore } from './scenarioStore';

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  settings: Settings;
  isStreaming: boolean;
  streamingMessageId: string | null;
  isLoading: boolean;

  // Async conversation actions (sync with server)
  loadConversations: () => Promise<void>;
  loadConversationMessages: (id: string) => Promise<void>;
  createConversation: () => Promise<string>;
  createScenarioConversation: (scenarioId: string) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  setActiveConversation: (id: string | null) => void;
  updateConversationTitle: (id: string, title: string) => Promise<void>;

  // Local-only actions (for streaming UI updates)
  addMessage: (conversationId: string, message: Message) => void;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => void;
  deleteMessagesFrom: (conversationId: string, messageId: string) => void;

  // Artifact actions
  toggleArtifactExpanded: (conversationId: string, messageId: string, artifactId: string) => void;

  // Settings actions (persisted locally, no apiKey)
  updateSettings: (updates: Partial<Settings>) => void;

  // Streaming state
  setStreaming: (isStreaming: boolean, messageId?: string | null) => void;

  // Computed
  getActiveConversation: () => Conversation | undefined;
}

const DEFAULT_SETTINGS: Settings = {
  systemPrompt: 'You are a helpful assistant.',
  model: 'claude-sonnet-4-6',
  provider: 'anthropic',
  theme: 'light',
};

// Tracks which conversations have had messages loaded to avoid redundant fetches
const loadedConversations = new Set<string>();

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      settings: DEFAULT_SETTINGS,
      isStreaming: false,
      streamingMessageId: null,
      isLoading: false,

      loadConversations: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/conversations');
          const data = await res.json() as Conversation[];
          // Restore Date objects
          const conversations = data.map(c => ({
            ...c,
            createdAt: new Date(c.createdAt),
            updatedAt: new Date(c.updatedAt),
            messages: (c.messages ?? []).map(m => ({
              ...m,
              timestamp: new Date(m.timestamp),
            })),
          }));
          set({ conversations });
        } finally {
          set({ isLoading: false });
        }
      },

      loadConversationMessages: async (id: string) => {
        if (loadedConversations.has(id)) return;
        loadedConversations.add(id);
        try {
          const res = await fetch(`/api/conversations/${id}`);
          if (!res.ok) return;
          const data = await res.json() as Conversation;
          const messages = (data.messages ?? []).map(m => ({
            ...m,
            timestamp: new Date(m.timestamp),
          }));
          set(state => ({
            conversations: state.conversations.map(c =>
              c.id === id ? { ...c, messages } : c
            ),
          }));
        } catch {
          loadedConversations.delete(id);
        }
      },

      createConversation: async () => {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: '新しいチャット' }),
        });
        const conversation = await res.json() as Conversation;
        const conv: Conversation = {
          ...conversation,
          createdAt: new Date(conversation.createdAt),
          updatedAt: new Date(conversation.updatedAt),
          messages: [],
        };
        loadedConversations.add(conv.id);
        set(state => ({
          conversations: [conv, ...state.conversations],
          activeConversationId: conv.id,
        }));
        return conv.id;
      },

      createScenarioConversation: async (scenarioId: string) => {
        const scenario = getScenario(scenarioId);
        if (!scenario) throw new Error(`Scenario "${scenarioId}" not found`);

        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: `デモ: ${scenario.name}`, scenarioId }),
        });
        const conversation = await res.json() as Conversation;
        const convId = conversation.id;

        const now = new Date();
        const startNode = scenario.nodes[scenario.start];
        const firstMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: startNode.message,
          artifacts: parseArtifacts(startNode.message),
          timestamp: now,
        };

        // Persist the initial assistant message
        await fetch(`/api/conversations/${convId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(firstMessage),
        });

        const conv: Conversation = {
          ...conversation,
          createdAt: new Date(conversation.createdAt),
          updatedAt: new Date(conversation.updatedAt),
          messages: [firstMessage],
          scenarioId,
        };
        loadedConversations.add(convId);
        set(state => ({
          conversations: [conv, ...state.conversations],
          activeConversationId: convId,
        }));
        useScenarioStore.getState().setActiveNode(convId, scenario.start);
        return convId;
      },

      deleteConversation: async (id: string) => {
        await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
        loadedConversations.delete(id);
        set(state => {
          const filtered = state.conversations.filter(c => c.id !== id);
          const nextActive =
            state.activeConversationId === id
              ? (filtered[0]?.id ?? null)
              : state.activeConversationId;
          return { conversations: filtered, activeConversationId: nextActive };
        });
      },

      setActiveConversation: (id) => set({ activeConversationId: id }),

      updateConversationTitle: async (id: string, title: string) => {
        await fetch(`/api/conversations/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        set(state => ({
          conversations: state.conversations.map(c =>
            c.id === id ? { ...c, title } : c
          ),
        }));
      },

      addMessage: (conversationId, message) => {
        set(state => ({
          conversations: state.conversations.map(c =>
            c.id === conversationId
              ? { ...c, messages: [...c.messages, message], updatedAt: new Date() }
              : c
          ),
        }));
      },

      updateMessage: (conversationId, messageId, updates) => {
        set(state => ({
          conversations: state.conversations.map(c =>
            c.id === conversationId
              ? {
                  ...c,
                  messages: c.messages.map(m =>
                    m.id === messageId ? { ...m, ...updates } : m
                  ),
                  updatedAt: new Date(),
                }
              : c
          ),
        }));
      },

      deleteMessagesFrom: (conversationId, messageId) => {
        set(state => ({
          conversations: state.conversations.map(c => {
            if (c.id !== conversationId) return c;
            const idx = c.messages.findIndex(m => m.id === messageId);
            if (idx === -1) return c;
            return { ...c, messages: c.messages.slice(0, idx), updatedAt: new Date() };
          }),
        }));
      },

      toggleArtifactExpanded: (conversationId, messageId, artifactId) => {
        set(state => ({
          conversations: state.conversations.map(c =>
            c.id !== conversationId
              ? c
              : {
                  ...c,
                  messages: c.messages.map(m =>
                    m.id !== messageId
                      ? m
                      : {
                          ...m,
                          artifacts: m.artifacts.map((a: Artifact) =>
                            a.id === artifactId ? { ...a, isExpanded: !a.isExpanded } : a
                          ),
                        }
                  ),
                }
          ),
        }));
      },

      updateSettings: (updates) => {
        set(state => ({ settings: { ...state.settings, ...updates } }));
      },

      setStreaming: (isStreaming, messageId = null) => {
        set({ isStreaming, streamingMessageId: messageId ?? null });
      },

      getActiveConversation: () => {
        const { conversations, activeConversationId } = get();
        return conversations.find(c => c.id === activeConversationId);
      },
    }),
    {
      name: 'general-chat-settings',
      // Only persist user preferences, not conversation data
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
