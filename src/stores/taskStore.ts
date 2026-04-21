'use client';

import { create } from 'zustand';
import type { Task, TaskMessage, TaskStatus, AddParticipantParams, CreateTaskParams } from '../types/task';
import type { ImageAttachment } from '../types';

interface TaskStore {
  tasks: Task[];
  activeTaskId: string | null;
  taskMessages: Record<string, TaskMessage[]>;
  streamingAgents: Record<string, string>; // Not used, kept for compatibility if needed
  pendingMessageIds: Record<string, string | null>;  // taskId → 未確認のメッセージID

  loadTasks: () => Promise<void>;
  loadTask: (taskId: string) => Promise<void>;
  createTask: (params: CreateTaskParams) => Promise<string>;
  deleteTask: (taskId: string) => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  addParticipant: (taskId: string, params: AddParticipantParams) => Promise<void>;
  removeParticipant: (taskId: string, participantId: string) => Promise<void>;
  sendMessage: (taskId: string, content: string, images?: ImageAttachment[]) => Promise<void>;
  setActiveTask: (taskId: string | null) => void;
  setTaskMessages: (taskId: string, messages: TaskMessage[]) => void;
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

export const useTaskStore = create<TaskStore>()((set, get) => ({
  tasks: [],
  activeTaskId: null,
  taskMessages: {},
  streamingAgents: {},
  pendingMessageIds: {},

  setActiveTask: (taskId) => set({ activeTaskId: taskId }),

  loadTasks: async () => {
    const res = await fetch('/api/tasks', { headers: authHeaders() });
    if (!res.ok) return;
    const tasks = await res.json() as Task[];
    set({ tasks });
  },

  loadTask: async (taskId) => {
    const res = await fetch(`/api/tasks/${taskId}`, { headers: authHeaders() });
    if (!res.ok) return;
    const task = await res.json() as Task;
    set(state => ({
      tasks: state.tasks.some(t => t.id === taskId)
        ? state.tasks.map(t => t.id === taskId ? task : t)
        : [...state.tasks, task],
      taskMessages: { ...state.taskMessages, [taskId]: task.messages },
    }));
  },

  createTask: async (params) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error('タスクの作成に失敗しました');
    const task = await res.json() as Task;
    set(state => ({ tasks: [task, ...state.tasks] }));
    return task.id;
  },

  deleteTask: async (taskId) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { 'x-username': getUsername() },
    });
    if (!res.ok) throw new Error('タスクの削除に失敗しました');
    set(state => {
      const { [taskId]: _, ...restMessages } = state.taskMessages;
      void _;
      return {
        tasks: state.tasks.filter(t => t.id !== taskId),
        taskMessages: restMessages,
      };
    });
  },

  updateTaskStatus: async (taskId, status) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? '更新に失敗しました');
    }
    const task = await res.json() as Task;
    set(state => ({ tasks: state.tasks.map(t => t.id === taskId ? task : t) }));
  },

  addParticipant: async (taskId, params) => {
    const res = await fetch(`/api/tasks/${taskId}/participants`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json() as { error?: string };
      throw new Error(err.error ?? '参加者の追加に失敗しました');
    }
    await get().loadTask(taskId);
  },

  removeParticipant: async (taskId, participantId) => {
    const res = await fetch(`/api/tasks/${taskId}/participants/${participantId}`, {
      method: 'DELETE',
      headers: { 'x-username': getUsername() },
    });
    if (!res.ok) throw new Error('参加者の削除に失敗しました');
    await get().loadTask(taskId);
  },

  sendMessage: async (taskId, content, images) => {
    const res = await fetch(`/api/tasks/${taskId}/messages`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ content, images: images && images.length > 0 ? images : undefined }),
    });
    if (!res.ok) throw new Error('メッセージの送信に失敗しました');
    const message = await res.json() as TaskMessage;
    // ポーリングで取得されるまでの間、ローディング状態を保持する
    set(state => ({
      pendingMessageIds: { ...state.pendingMessageIds, [taskId]: message.id },
      taskMessages: {
        ...state.taskMessages,
        [taskId]: [...(state.taskMessages[taskId] ?? []), message].sort((a, b) => a.sortOrder - b.sortOrder),
      }
    }));
  },

  setTaskMessages: (taskId, messages) => {
    set(state => {
      const sorted = [...messages].sort((a, b) => a.sortOrder - b.sortOrder);

      const pending = state.pendingMessageIds[taskId];
      let newPending = pending;
      if (pending && sorted.some(m => m.id === pending)) {
          newPending = null;
      }

      return {
        taskMessages: { ...state.taskMessages, [taskId]: sorted },
        pendingMessageIds: { ...state.pendingMessageIds, [taskId]: newPending }
      };
    });
  }
}));
