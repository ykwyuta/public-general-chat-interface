import { useChatStore } from '../stores/chatStore';

export function useConversations() {
  const {
    conversations,
    activeConversationId,
    isLoading,
    loadConversations,
    loadConversationMessages,
    createConversation,
    deleteConversation,
    setActiveConversation,
    getActiveConversation,
  } = useChatStore();

  return {
    conversations,
    activeConversationId,
    activeConversation: getActiveConversation(),
    isLoading,
    loadConversations,
    loadConversationMessages,
    createConversation,
    deleteConversation,
    setActiveConversation,
  };
}
