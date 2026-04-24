import { create } from 'zustand';
import type { ChatTemplate, CreateChatTemplateParams, UpdateChatTemplateParams } from '../types/chatTemplate';

function getUsername(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = sessionStorage.getItem('general-chat-auth');
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { state?: { user?: { username?: string } } };
    return parsed.state?.user?.username ?? '';
  } catch {
    return '';
  }
}

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-username': getUsername() };
}

interface ChatTemplateStore {
  templates: ChatTemplate[];
  isLoading: boolean;
  selectedTemplateId: string | null;

  loadTemplates: () => Promise<void>;
  createTemplate: (params: CreateChatTemplateParams) => Promise<ChatTemplate>;
  updateTemplate: (id: string, params: UpdateChatTemplateParams) => Promise<ChatTemplate>;
  deleteTemplate: (id: string) => Promise<void>;
  setSelectedTemplateId: (id: string | null) => void;
  applyTemplate: (id: string, conversationId: string) => Promise<{ welcomeMessage: string, systemPrompt: string, mcpServers: string[] }>;
}

export const useChatTemplateStore = create<ChatTemplateStore>((set, get) => ({
  templates: [],
  isLoading: false,
  selectedTemplateId: null,

  loadTemplates: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/chat-templates', { headers: { 'x-username': getUsername() } });
      if (!res.ok) throw new Error('Failed to load chat templates');
      const data = await res.json();
      // Date strings to objects
      const parsedData = data.map((t: any) => ({
        ...t,
        createdAt: new Date(t.createdAt),
        updatedAt: new Date(t.updatedAt),
      }));
      set({ templates: parsedData });
    } catch (e) {
      console.error(e);
    } finally {
      set({ isLoading: false });
    }
  },

  createTemplate: async (params) => {
    const res = await fetch('/api/chat-templates', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Failed to create chat template');
    const newTemplate = await res.json();
    const parsed = {
      ...newTemplate,
      createdAt: new Date(newTemplate.createdAt),
      updatedAt: new Date(newTemplate.updatedAt),
    };
    set((state) => ({ templates: [parsed, ...state.templates] }));
    return parsed;
  },

  updateTemplate: async (id, params) => {
    const res = await fetch(`/api/chat-templates/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('Failed to update chat template');
    const updated = await res.json();
    const parsed = {
      ...updated,
      createdAt: new Date(updated.createdAt),
      updatedAt: new Date(updated.updatedAt),
    };
    set((state) => ({
      templates: state.templates.map((t) => (t.id === id ? parsed : t)),
    }));
    return parsed;
  },

  deleteTemplate: async (id) => {
    const res = await fetch(`/api/chat-templates/${id}`, {
      method: 'DELETE',
      headers: { 'x-username': getUsername() },
    });
    if (!res.ok) throw new Error('Failed to delete chat template');
    set((state) => ({
      templates: state.templates.filter((t) => t.id !== id),
      selectedTemplateId: state.selectedTemplateId === id ? null : state.selectedTemplateId,
    }));
  },

  setSelectedTemplateId: (id) => {
    set({ selectedTemplateId: id });
  },

  applyTemplate: async (id, conversationId) => {
    const res = await fetch(`/api/chat-templates/${id}/apply`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ conversationId }),
    });
    if (!res.ok) throw new Error('Failed to apply chat template');
    return res.json();
  },
}));
