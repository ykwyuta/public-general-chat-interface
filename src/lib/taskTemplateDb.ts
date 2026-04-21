import db from './db';
import type {
  TaskTemplate,
  TaskTemplateParticipant,
  HumanTemplateParticipant,
  LlmTemplateParticipant,
  CreateTaskTemplateParams,
  UpdateTaskTemplateParams,
  CreateTemplateParticipantParams,
} from '../types/taskTemplate';

interface DbTemplate {
  id: string;
  name: string;
  description: string;
  title: string;
  purpose: string;
  completion_condition: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface DbTemplateParticipant {
  id: string;
  template_id: string;
  participant_type: 'human' | 'llm';
  username: string | null;
  display_name: string | null;
  agent_name: string | null;
  agent_role: string | null;
  provider: string | null;
  model: string | null;
  mcp_server_ids_json: string | null;
  can_terminate: number;
}

function toParticipant(row: DbTemplateParticipant): TaskTemplateParticipant {
  if (row.participant_type === 'human') {
    return {
      id: row.id,
      templateId: row.template_id,
      participantType: 'human',
      username: row.username!,
      displayName: row.display_name ?? row.username!,
      canTerminate: row.can_terminate === 1,
    } satisfies HumanTemplateParticipant;
  }
  return {
    id: row.id,
    templateId: row.template_id,
    participantType: 'llm',
    agentName: row.agent_name!,
    agentRole: row.agent_role ?? '',
    provider: row.provider!,
    model: row.model!,
    mcpServerIds: row.mcp_server_ids_json ? (JSON.parse(row.mcp_server_ids_json) as string[]) : [],
    canTerminate: false,
  } satisfies LlmTemplateParticipant;
}

function listParticipants(templateId: string): TaskTemplateParticipant[] {
  const rows = db
    .prepare('SELECT * FROM task_template_participants WHERE template_id = ?')
    .all(templateId) as DbTemplateParticipant[];
  return rows.map(toParticipant);
}

function toTemplate(row: DbTemplate): TaskTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    title: row.title,
    purpose: row.purpose,
    completionCondition: row.completion_condition,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    participants: listParticipants(row.id),
  };
}

function insertParticipants(templateId: string, participants: CreateTemplateParticipantParams[]): void {
  for (const p of participants) {
    const id = crypto.randomUUID();
    if (p.participantType === 'human') {
      db.prepare(`
        INSERT INTO task_template_participants
          (id, template_id, participant_type, username, display_name, can_terminate)
        VALUES (?, ?, 'human', ?, ?, ?)
      `).run(id, templateId, p.username, p.username, p.canTerminate ? 1 : 0);
    } else {
      db.prepare(`
        INSERT INTO task_template_participants
          (id, template_id, participant_type, agent_name, agent_role, provider, model, mcp_server_ids_json, can_terminate)
        VALUES (?, ?, 'llm', ?, ?, ?, ?, ?, 0)
      `).run(id, templateId, p.agentName, p.agentRole, p.provider, p.model, JSON.stringify(p.mcpServerIds ?? []));
    }
  }
}

export function listTemplatesForUser(username: string): TaskTemplate[] {
  const rows = db
    .prepare('SELECT * FROM task_templates WHERE created_by = ? ORDER BY updated_at DESC')
    .all(username) as DbTemplate[];
  return rows.map(toTemplate);
}

export function getTemplate(id: string, username: string): TaskTemplate | null {
  const row = db
    .prepare('SELECT * FROM task_templates WHERE id = ? AND created_by = ?')
    .get(id, username) as DbTemplate | undefined;
  return row ? toTemplate(row) : null;
}

export function createTemplate(params: CreateTaskTemplateParams, username: string): TaskTemplate {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO task_templates
      (id, name, description, title, purpose, completion_condition, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.name.trim(),
    (params.description ?? '').trim(),
    (params.title ?? '').trim(),
    (params.purpose ?? '').trim(),
    (params.completionCondition ?? '').trim(),
    username,
    now,
    now,
  );

  if (params.participants?.length) {
    insertParticipants(id, params.participants);
  }

  return toTemplate(db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id) as DbTemplate);
}

export function updateTemplate(
  id: string,
  params: UpdateTaskTemplateParams,
  username: string,
): TaskTemplate | null {
  const row = db
    .prepare('SELECT * FROM task_templates WHERE id = ? AND created_by = ?')
    .get(id, username) as DbTemplate | undefined;
  if (!row) return null;

  const now = new Date().toISOString();
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (params.name !== undefined)               { fields.push('name = ?');               values.push(params.name.trim()); }
  if (params.description !== undefined)        { fields.push('description = ?');        values.push(params.description.trim()); }
  if (params.title !== undefined)              { fields.push('title = ?');              values.push(params.title.trim()); }
  if (params.purpose !== undefined)            { fields.push('purpose = ?');            values.push(params.purpose.trim()); }
  if (params.completionCondition !== undefined) { fields.push('completion_condition = ?'); values.push(params.completionCondition.trim()); }

  values.push(id);
  db.prepare(`UPDATE task_templates SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  if (params.participants !== undefined) {
    db.prepare('DELETE FROM task_template_participants WHERE template_id = ?').run(id);
    if (params.participants.length > 0) {
      insertParticipants(id, params.participants);
    }
  }

  return toTemplate(db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id) as DbTemplate);
}

export function deleteTemplate(id: string, username: string): boolean {
  const result = db
    .prepare('DELETE FROM task_templates WHERE id = ? AND created_by = ?')
    .run(id, username);
  return result.changes > 0;
}
