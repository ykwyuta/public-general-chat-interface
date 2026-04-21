export type TaskStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type ParticipantType = 'human' | 'llm';
export type MessageSenderType = 'human' | 'llm' | 'system';

export interface HumanParticipant {
  id: string;
  taskId: string;
  participantType: 'human';
  username: string;
  displayName: string;
  canTerminate: boolean;
  joinedAt: Date;
}

export interface LlmParticipant {
  id: string;
  taskId: string;
  participantType: 'llm';
  agentName: string;
  agentRole: string;
  provider: string;
  model: string;
  mcpServerIds: string[];
  canTerminate: false;
  joinedAt: Date;
}

export type TaskParticipant = HumanParticipant | LlmParticipant;

export interface TaskMessage {
  id: string;
  taskId: string;
  senderType: MessageSenderType;
  senderName: string;
  toName: string | null;
  content: string;
  images?: import('./index').ImageAttachment[];
  timestamp: Date;
  sortOrder: number;
}

export interface Task {
  id: string;
  title: string;
  purpose: string;
  completionCondition: string;
  status: TaskStatus;
  createdBy: string;
  systemPrompt: string;
  createdAt: Date;
  updatedAt: Date;
  participants: TaskParticipant[];
  messages: TaskMessage[];
}

export interface CreateTaskParams {
  title: string;
  purpose: string;
  completionCondition: string;
}

export interface AddHumanParticipantParams {
  participantType: 'human';
  username: string;
  canTerminate?: boolean;
}

export interface AddLlmParticipantParams {
  participantType: 'llm';
  agentName: string;
  agentRole: string;
  provider: string;
  model: string;
  mcpServerIds?: string[];
}

export type AddParticipantParams = AddHumanParticipantParams | AddLlmParticipantParams;

export type TaskEvent =
  | { type: 'message'; message: TaskMessage }
  | { type: 'streaming'; agentName: string; chunk: string }
  | { type: 'stream_end'; agentName: string; messageId: string }
  | { type: 'participant_joined'; participant: TaskParticipant }
  | { type: 'participant_left'; participantName: string }
  | { type: 'status_changed'; status: TaskStatus };
