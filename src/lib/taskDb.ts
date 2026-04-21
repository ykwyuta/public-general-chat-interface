import db from './db';
import type {
  Task,
  TaskParticipant,
  TaskMessage,
  TaskStatus,
  HumanParticipant,
  LlmParticipant,
} from '../types/task';
import type { ImageAttachment } from '../types';

// ---- Raw DB row types ----

interface DbTask {
  id: string;
  title: string;
  purpose: string;
  completion_condition: string;
  status: TaskStatus;
  created_by: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

interface DbParticipant {
  id: string;
  task_id: string;
  participant_type: 'human' | 'llm';
  username: string | null;
  display_name: string | null;
  agent_name: string | null;
  agent_role: string | null;
  provider: string | null;
  model: string | null;
  mcp_server_ids_json: string | null;
  can_terminate: number;
  joined_at: string;
}

interface DbTaskMessage {
  id: string;
  task_id: string;
  sender_type: 'human' | 'llm' | 'system';
  sender_name: string;
  to_name: string | null;
  content: string;
  images_json: string;
  timestamp: string;
  sort_order: number;
}

// ---- Converters ----

function toParticipant(row: DbParticipant): TaskParticipant {
  if (row.participant_type === 'human') {
    return {
      id: row.id,
      taskId: row.task_id,
      participantType: 'human',
      username: row.username!,
      displayName: row.display_name ?? row.username!,
      canTerminate: row.can_terminate === 1,
      joinedAt: new Date(row.joined_at),
    } satisfies HumanParticipant;
  }
  return {
    id: row.id,
    taskId: row.task_id,
    participantType: 'llm',
    agentName: row.agent_name!,
    agentRole: row.agent_role ?? '',
    provider: row.provider!,
    model: row.model!,
    mcpServerIds: row.mcp_server_ids_json ? (JSON.parse(row.mcp_server_ids_json) as string[]) : [],
    canTerminate: false,
    joinedAt: new Date(row.joined_at),
  } satisfies LlmParticipant;
}

function toTaskMessage(row: DbTaskMessage): TaskMessage {
  const images: ImageAttachment[] = JSON.parse(row.images_json ?? '[]');
  return {
    id: row.id,
    taskId: row.task_id,
    senderType: row.sender_type,
    senderName: row.sender_name,
    toName: row.to_name,
    content: row.content,
    images: images.length > 0 ? images : undefined,
    timestamp: new Date(row.timestamp),
    sortOrder: row.sort_order,
  };
}

function toTask(row: DbTask, participants: TaskParticipant[], messages: TaskMessage[]): Task {
  return {
    id: row.id,
    title: row.title,
    purpose: row.purpose,
    completionCondition: row.completion_condition,
    status: row.status,
    createdBy: row.created_by,
    systemPrompt: row.system_prompt,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    participants,
    messages,
  };
}

// ---- Query helpers ----

export function listTasksForUser(username: string): Task[] {
  const rows = db.prepare(`
    SELECT t.* FROM tasks t
    INNER JOIN task_participants tp ON tp.task_id = t.id
    WHERE tp.username = ? OR t.created_by = ?
    GROUP BY t.id
    ORDER BY t.updated_at DESC
  `).all(username, username) as DbTask[];

  return rows.map(r => {
    const participants = listParticipants(r.id);
    return toTask(r, participants, []);
  });
}

export function getTask(id: string): Task | undefined {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as DbTask | undefined;
  if (!row) return undefined;
  const participants = listParticipants(id);
  const messages = listMessages(id);
  return toTask(row, participants, messages);
}

export function createTask(
  id: string,
  title: string,
  purpose: string,
  completionCondition: string,
  createdBy: string,
): Task {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, title, purpose, completion_condition, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, purpose, completionCondition, createdBy, now, now);

  return getTask(id)!;
}

export function updateTask(
  id: string,
  updates: Partial<{ title: string; purpose: string; completionCondition: string; status: TaskStatus; systemPrompt: string }>,
): void {
  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (updates.title !== undefined)             { fields.push('title = ?');              values.push(updates.title); }
  if (updates.purpose !== undefined)           { fields.push('purpose = ?');            values.push(updates.purpose); }
  if (updates.completionCondition !== undefined) { fields.push('completion_condition = ?'); values.push(updates.completionCondition); }
  if (updates.status !== undefined)            { fields.push('status = ?');             values.push(updates.status); }
  if (updates.systemPrompt !== undefined)      { fields.push('system_prompt = ?');      values.push(updates.systemPrompt); }

  values.push(id);
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteTask(id: string): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

// ---- Participants ----

export function listParticipants(taskId: string): TaskParticipant[] {
  const rows = db.prepare('SELECT * FROM task_participants WHERE task_id = ? ORDER BY joined_at ASC').all(taskId) as DbParticipant[];
  return rows.map(toParticipant);
}

export function addHumanParticipant(
  id: string,
  taskId: string,
  username: string,
  displayName: string,
  canTerminate: boolean,
): TaskParticipant {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO task_participants (id, task_id, participant_type, username, display_name, can_terminate, joined_at)
    VALUES (?, ?, 'human', ?, ?, ?, ?)
  `).run(id, taskId, username, displayName, canTerminate ? 1 : 0, now);

  return toParticipant(
    db.prepare('SELECT * FROM task_participants WHERE id = ?').get(id) as DbParticipant,
  );
}

export function addLlmParticipant(
  id: string,
  taskId: string,
  agentName: string,
  agentRole: string,
  provider: string,
  model: string,
  mcpServerIds: string[] = [],
): TaskParticipant {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO task_participants (id, task_id, participant_type, agent_name, agent_role, provider, model, mcp_server_ids_json, can_terminate, joined_at)
    VALUES (?, ?, 'llm', ?, ?, ?, ?, ?, 0, ?)
  `).run(id, taskId, agentName, agentRole, provider, model, JSON.stringify(mcpServerIds), now);

  return toParticipant(
    db.prepare('SELECT * FROM task_participants WHERE id = ?').get(id) as DbParticipant,
  );
}

export function removeParticipant(participantId: string): void {
  db.prepare('DELETE FROM task_participants WHERE id = ?').run(participantId);
}

export function getParticipant(participantId: string): TaskParticipant | undefined {
  const row = db.prepare('SELECT * FROM task_participants WHERE id = ?').get(participantId) as DbParticipant | undefined;
  return row ? toParticipant(row) : undefined;
}

// ---- Messages ----

export function listMessages(taskId: string, sinceId?: string): TaskMessage[] {
  if (sinceId) {
    const since = db.prepare('SELECT sort_order FROM task_messages WHERE id = ? AND task_id = ?').get(sinceId, taskId) as { sort_order: number } | undefined;
    if (since) {
      const rows = db.prepare('SELECT * FROM task_messages WHERE task_id = ? AND sort_order > ? ORDER BY sort_order ASC').all(taskId, since.sort_order) as DbTaskMessage[];
      return rows.map(toTaskMessage);
    }
  }
  const rows = db.prepare('SELECT * FROM task_messages WHERE task_id = ? ORDER BY sort_order ASC').all(taskId) as DbTaskMessage[];
  return rows.map(toTaskMessage);
}

export function addTaskMessage(
  id: string,
  taskId: string,
  senderType: 'human' | 'llm' | 'system',
  senderName: string,
  content: string,
  toName: string | null,
  images?: ImageAttachment[],
): TaskMessage {
  const maxOrder = (
    db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM task_messages WHERE task_id = ?').get(taskId) as { m: number }
  ).m;

  const now = new Date().toISOString();
  const imagesJson = JSON.stringify(images ?? []);
  db.prepare(`
    INSERT INTO task_messages (id, task_id, sender_type, sender_name, to_name, content, images_json, timestamp, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, taskId, senderType, senderName, toName, content, imagesJson, now, maxOrder + 1);

  db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(now, taskId);

  return toTaskMessage(
    db.prepare('SELECT * FROM task_messages WHERE id = ?').get(id) as DbTaskMessage,
  );
}
