'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { McpServerConfig, McpServerStatus } from '../types/mcp';

interface McpState {
  servers: (McpServerConfig & McpServerStatus)[];
  selectedServerIds: string[];
  isLoading: boolean;

  fetchServers: () => Promise<void>;
  addServer: (data: {
    name: string;
    transport: 'stdio' | 'sse';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    enabled?: boolean;
  }) => Promise<void>;
  updateServer: (id: string, data: Partial<McpServerConfig>) => Promise<void>;
  deleteServer: (id: string) => Promise<void>;
  connectServer: (id: string) => Promise<void>;
  disconnectServer: (id: string) => Promise<void>;
  refreshStatus: (id: string) => Promise<void>;
  toggleSelectedServer: (id: string) => void;
  setSelectedServerIds: (ids: string[]) => void;
}

export const useMcpStore = create<McpState>()(
  persist(
    (set, get) => ({
      servers: [],
      selectedServerIds: [],
      isLoading: false,

      fetchServers: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/mcp/servers');
          const data = await res.json() as { servers: (McpServerConfig & McpServerStatus)[] };
          set({ servers: data.servers });
        } finally {
          set({ isLoading: false });
        }
      },

      addServer: async (data) => {
        const res = await fetch('/api/mcp/servers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const err = await res.json() as { error: string };
          throw new Error(err.error);
        }
        await get().fetchServers();
      },

      updateServer: async (id, data) => {
        await fetch(`/api/mcp/servers/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        await get().fetchServers();
      },

      deleteServer: async (id) => {
        await fetch(`/api/mcp/servers/${id}`, { method: 'DELETE' });
        set(state => ({
          servers: state.servers.filter(s => s.id !== id),
          selectedServerIds: state.selectedServerIds.filter(sid => sid !== id),
        }));
      },

      connectServer: async (id) => {
        set(state => ({
          servers: state.servers.map(s => s.id === id ? { ...s, status: 'connecting' as const } : s),
        }));
        const res = await fetch(`/api/mcp/servers/${id}/connect`, { method: 'POST' });
        if (!res.ok) {
          const err = await res.json() as { error: string };
          set(state => ({
            servers: state.servers.map(s => s.id === id ? { ...s, status: 'error' as const, error: err.error } : s),
          }));
          throw new Error(err.error);
        }
        await get().refreshStatus(id);
      },

      disconnectServer: async (id) => {
        await fetch(`/api/mcp/servers/${id}/disconnect`, { method: 'POST' });
        set(state => ({
          servers: state.servers.map(s =>
            s.id === id ? { ...s, status: 'disconnected' as const, toolCount: 0, resourceCount: 0 } : s
          ),
        }));
      },

      refreshStatus: async (id) => {
        const res = await fetch(`/api/mcp/servers/${id}/status`);
        const status = await res.json() as McpServerStatus;
        set(state => ({
          servers: state.servers.map(s => s.id === id ? { ...s, ...status } : s),
        }));
      },

      toggleSelectedServer: (id) => {
        set(state => ({
          selectedServerIds: state.selectedServerIds.includes(id)
            ? state.selectedServerIds.filter(sid => sid !== id)
            : [...state.selectedServerIds, id],
        }));
      },

      setSelectedServerIds: (ids) => set({ selectedServerIds: ids }),
    }),
    {
      name: 'mcp-settings',
      partialize: (state) => ({ selectedServerIds: state.selectedServerIds }),
    }
  )
);
