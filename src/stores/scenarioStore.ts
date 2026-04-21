import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ScenarioStoreState {
  activeNodes: Record<string, string>;

  setActiveNode: (conversationId: string, nodeId: string) => void;
  getActiveNode: (conversationId: string) => string | undefined;
  clearNode: (conversationId: string) => void;
}

export const useScenarioStore = create<ScenarioStoreState>()(
  persist(
    (set, get) => ({
      activeNodes: {},

      setActiveNode: (conversationId, nodeId) => {
        set(state => ({
          activeNodes: { ...state.activeNodes, [conversationId]: nodeId },
        }));
      },

      getActiveNode: (conversationId) => {
        return get().activeNodes[conversationId];
      },

      clearNode: (conversationId) => {
        set(state => {
          const next = { ...state.activeNodes };
          delete next[conversationId];
          return { activeNodes: next };
        });
      },
    }),
    {
      name: 'scenario-storage',
    }
  )
);
