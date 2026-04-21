'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { signOut as nextAuthSignOut } from 'next-auth/react';
import type { AuthUser, AuthState } from '../types/auth';
import { useChatStore } from './chatStore';
import { useScenarioStore } from './scenarioStore';

interface AuthStore extends AuthState {
  login: (user: AuthUser, mode: AuthState['authMode']) => Promise<void>;
  logout: () => void;
}

const ssrSafeSessionStorage =
  typeof window !== 'undefined'
    ? sessionStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      };

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      sessionToken: null,
      isAuthenticated: false,
      authMode: null,

      login: async (user, mode) => {
        set({ user, isAuthenticated: true, authMode: mode });
        try {
          await useChatStore.getState().loadConversations();
        } catch {
          // offline fallback: show empty state
        }
      },

      logout: () => {
        const currentMode = get().authMode;
        if (typeof window !== 'undefined') {
          localStorage.removeItem('scenario-storage');
        }
        useChatStore.setState({ conversations: [], activeConversationId: null });
        useScenarioStore.setState({ activeNodes: {} });
        set({ user: null, sessionToken: null, isAuthenticated: false, authMode: null });
        if (currentMode === 'google') {
          nextAuthSignOut({ redirect: false });
        }
      },
    }),
    {
      name: 'general-chat-auth',
      storage: createJSONStorage(() => ssrSafeSessionStorage),
      skipHydration: true,
    }
  )
);
