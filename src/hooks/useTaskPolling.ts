'use client';

import { useEffect, useRef } from 'react';
import { useTaskStore } from '../stores/taskStore';
import type { TaskMessage, Task } from '../types/task';

const POLL_INTERVAL_MS = 3_000;

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

export function useTaskPolling(taskId: string | null) {
  const isPolling = useRef(false);

  useEffect(() => {
    if (!taskId) return;

    async function poll() {
      if (isPolling.current) return;
      isPolling.current = true;

      try {
        const username = getUsername();
        if (!username) return;

        const store = useTaskStore.getState();
        const currentMessages = store.taskMessages[taskId!] ?? [];

        // 1. Fetch messages
        const messagesUrl = `/api/tasks/${taskId}/messages`;
        const messagesRes = await fetch(messagesUrl, { headers: { 'x-username': username } });
        if (messagesRes.ok) {
           const fetchedMessages = await messagesRes.json() as TaskMessage[];

           const latestStore = useTaskStore.getState();
           latestStore.setTaskMessages(taskId!, fetchedMessages);
        }

        // 2. Fetch task status to detect completion/cancellation
        const taskUrl = `/api/tasks/${taskId}`;
        const taskRes = await fetch(taskUrl, { headers: { 'x-username': username } });
        if (taskRes.ok) {
           const task = await taskRes.json() as Task;
           const latestStore = useTaskStore.getState();

           const existingTask = latestStore.tasks.find(t => t.id === taskId);
           if (existingTask) {
             useTaskStore.setState(state => ({
               tasks: state.tasks.map(t => t.id === taskId ? task : t),
             }));
           }
        }
      } catch {
        // ignore polling errors silently
      } finally {
        isPolling.current = false;
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    poll(); // Initial poll

    return () => clearInterval(interval);
  }, [taskId]);
}
