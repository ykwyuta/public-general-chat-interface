'use client';

import { create } from 'zustand';
import type { TaskTemplate, CreateTaskTemplateParams, UpdateTaskTemplateParams } from '../types/taskTemplate';
import type { Task } from '../types/task';

interface TaskTemplateStore {
  templates: TaskTemplate[];
  isLoading: boolean;

  loadTemplates: () => Promise<void>;
  createTemplate: (params: CreateTaskTemplateParams) => Promise<TaskTemplate>;
  updateTemplate: (id: string, params: UpdateTaskTemplateParams) => Promise<TaskTemplate>;
  deleteTemplate: (id: string) => Promise<void>;
  applyTemplate: (id: string, overrides?: { title?: string; purpose?: string; completionCondition?: string }) => Promise<Task>;
}

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

export const useTaskTemplateStore = create<TaskTemplateStore>()((set) => ({
  templates: [],
  isLoading: false,

  loadTemplates: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/task-templates', { headers: authHeaders() });
      if (!res.ok) return;
      const templates = await res.json() as TaskTemplate[];
      set({ templates });
    } finally {
      set({ isLoading: false });
    }
  },

  createTemplate: async (params) => {
    const res = await fetch('/api/task-templates', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('テンプレートの作成に失敗しました');
    const template = await res.json() as TaskTemplate;
    set(state => ({ templates: [template, ...state.templates] }));
    return template;
  },

  updateTemplate: async (id, params) => {
    const res = await fetch(`/api/task-templates/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('テンプレートの更新に失敗しました');
    const template = await res.json() as TaskTemplate;
    set(state => ({ templates: state.templates.map(t => t.id === id ? template : t) }));
    return template;
  },

  deleteTemplate: async (id) => {
    const res = await fetch(`/api/task-templates/${id}`, {
      method: 'DELETE',
      headers: { 'x-username': getUsername() },
    });
    if (!res.ok) throw new Error('テンプレートの削除に失敗しました');
    set(state => ({ templates: state.templates.filter(t => t.id !== id) }));
  },

  applyTemplate: async (id, overrides) => {
    const res = await fetch(`/api/task-templates/${id}/apply`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(overrides ?? {}),
    });
    if (!res.ok) throw new Error('テンプレートの適用に失敗しました');
    return await res.json() as Task;
  },
}));
