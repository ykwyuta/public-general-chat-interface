import { useCallback } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useScenarioStore } from '../stores/scenarioStore';
import { getScenario } from '../scenarios/index';
import { parseArtifacts } from '../lib/artifactParser';
import type { ScenarioOption } from '../types/scenario';

export function useScenario(conversationId: string) {
  const conversation = useChatStore(state =>
    state.conversations.find(c => c.id === conversationId)
  );
  const addMessage = useChatStore(state => state.addMessage);
  const { activeNodes, setActiveNode } = useScenarioStore();

  const scenario = conversation?.scenarioId
    ? getScenario(conversation.scenarioId)
    : undefined;

  const currentNodeId = scenario
    ? (activeNodes[conversationId] ?? scenario.start)
    : undefined;

  const currentNode = scenario && currentNodeId
    ? scenario.nodes[currentNodeId]
    : undefined;

  const selectOption = useCallback((option: ScenarioOption) => {
    if (!scenario || !option.next) return;

    const nextNode = scenario.nodes[option.next];
    if (!nextNode) return;

    addMessage(conversationId, {
      id: crypto.randomUUID(),
      role: 'user',
      content: option.label,
      artifacts: [],
      timestamp: new Date(),
    });

    setActiveNode(conversationId, option.next);

    addMessage(conversationId, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: nextNode.message,
      artifacts: parseArtifacts(nextNode.message),
      timestamp: new Date(),
    });
  }, [scenario, conversationId, addMessage, setActiveNode]);

  const restart = useCallback(() => {
    if (!scenario) return;

    const startNode = scenario.nodes[scenario.start];
    setActiveNode(conversationId, scenario.start);

    addMessage(conversationId, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: startNode.message,
      artifacts: parseArtifacts(startNode.message),
      timestamp: new Date(),
    });
  }, [scenario, conversationId, addMessage, setActiveNode]);

  const isTerminal = currentNode?.terminal ?? false;

  return { scenario, currentNode, selectOption, restart, isTerminal };
}
