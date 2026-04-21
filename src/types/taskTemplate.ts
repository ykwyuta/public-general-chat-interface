export interface HumanTemplateParticipant {
  id: string;
  templateId: string;
  participantType: 'human';
  username: string;
  displayName: string;
  canTerminate: boolean;
}

export interface LlmTemplateParticipant {
  id: string;
  templateId: string;
  participantType: 'llm';
  agentName: string;
  agentRole: string;
  provider: string;
  model: string;
  mcpServerIds: string[];
  canTerminate: false;
}

export type TaskTemplateParticipant = HumanTemplateParticipant | LlmTemplateParticipant;

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  title: string;
  purpose: string;
  completionCondition: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  participants: TaskTemplateParticipant[];
}

export type CreateTemplateParticipantParams =
  | { participantType: 'human'; username: string; canTerminate?: boolean }
  | { participantType: 'llm'; agentName: string; agentRole: string; provider: string; model: string; mcpServerIds?: string[] };

export interface CreateTaskTemplateParams {
  name: string;
  description?: string;
  title?: string;
  purpose?: string;
  completionCondition?: string;
  participants?: CreateTemplateParticipantParams[];
}

export interface UpdateTaskTemplateParams {
  name?: string;
  description?: string;
  title?: string;
  purpose?: string;
  completionCondition?: string;
  participants?: CreateTemplateParticipantParams[];
}
