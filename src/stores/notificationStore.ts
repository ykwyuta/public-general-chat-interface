import { create } from 'zustand';
import type { Notification } from '../types';
import { useAuthStore } from './authStore';

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;

  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ isLoading: true });
    try {
      const res = await fetch(`/api/notifications?username=${encodeURIComponent(user.username)}`);
      if (res.ok) {
        const data = await res.json() as Notification[];
        const unreadCount = data.filter(n => !n.isRead).length;
        set({ notifications: data, unreadCount });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  markAsRead: async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      if (res.ok) {
        set(state => {
          const notifications = state.notifications.map(n =>
            n.id === id ? { ...n, isRead: true } : n
          );
          return {
            notifications,
            unreadCount: notifications.filter(n => !n.isRead).length
          };
        });
      }
    } catch (e) {
      console.error(e);
    }
  }
}));
