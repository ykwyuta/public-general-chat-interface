import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { Conversation, Message } from '../types';
import type { McpServerConfig } from '../types/mcp';

const DB_PATH = process.env.DATABASE_PATH ?? path.join(process.cwd(), 'data', 'chat.db');

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL DEFAULT '新しいチャット',
    scenario_id TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL DEFAULT '',
    images_json     TEXT NOT NULL DEFAULT '[]',
    artifacts_json  TEXT NOT NULL DEFAULT '[]',
    timestamp       TEXT NOT NULL DEFAULT (datetime('now')),
    sort_order      INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv
    ON messages(conversation_id, sort_order);

  CREATE TABLE IF NOT EXISTS tasks (
    id                   TEXT PRIMARY KEY,
    title                TEXT NOT NULL DEFAULT '新しいタスク',
    purpose              TEXT NOT NULL DEFAULT '',
    completion_condition TEXT NOT NULL DEFAULT '',
    status               TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
    created_by           TEXT NOT NULL,
    system_prompt        TEXT NOT NULL DEFAULT '',
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_participants (
    id               TEXT PRIMARY KEY,
    task_id          TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    participant_type TEXT NOT NULL CHECK (participant_type IN ('human', 'llm')),
    username         TEXT,
    display_name     TEXT,
    agent_name       TEXT,
    agent_role       TEXT,
    provider         TEXT,
    model            TEXT,
    can_terminate    INTEGER NOT NULL DEFAULT 0,
    joined_at        TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (task_id, username),
    UNIQUE (task_id, agent_name)
  );

  CREATE INDEX IF NOT EXISTS idx_task_participants_task
    ON task_participants(task_id);

  CREATE TABLE IF NOT EXISTS task_messages (
    id          TEXT PRIMARY KEY,
    task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('human', 'llm', 'system')),
    sender_name TEXT NOT NULL,
    to_name     TEXT,
    content     TEXT NOT NULL DEFAULT '',
    images_json TEXT NOT NULL DEFAULT '[]',
    timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
    sort_order  INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_task_messages_task
    ON task_messages(task_id, sort_order);

  CREATE TABLE IF NOT EXISTS task_templates (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    description          TEXT NOT NULL DEFAULT '',
    title                TEXT NOT NULL DEFAULT '',
    purpose              TEXT NOT NULL DEFAULT '',
    completion_condition TEXT NOT NULL DEFAULT '',
    created_by           TEXT NOT NULL,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS task_template_participants (
    id               TEXT PRIMARY KEY,
    template_id      TEXT NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
    participant_type TEXT NOT NULL CHECK (participant_type IN ('human', 'llm')),
    username         TEXT,
    display_name     TEXT,
    agent_name       TEXT,
    agent_role       TEXT,
    provider         TEXT,
    model            TEXT,
    can_terminate    INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_task_template_participants_template
    ON task_template_participants(template_id);

  CREATE TABLE IF NOT EXISTS chat_templates (
    id               TEXT PRIMARY KEY,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    welcome_message  TEXT NOT NULL DEFAULT '',
    system_prompt    TEXT NOT NULL DEFAULT '',
    mcp_servers      TEXT NOT NULL DEFAULT '[]',
    created_by       TEXT NOT NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS chat_template_files (
    id          TEXT PRIMARY KEY,
    template_id TEXT NOT NULL REFERENCES chat_templates(id) ON DELETE CASCADE,
    filename    TEXT NOT NULL,
    content     TEXT NOT NULL,
    media_type  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_chat_template_files_template
    ON chat_template_files(template_id);

  CREATE TABLE IF NOT EXISTS google_users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    email        TEXT UNIQUE NOT NULL,
    username     TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id              TEXT PRIMARY KEY,
    user_username   TEXT NOT NULL,
    sender_username TEXT NOT NULL,
    message         TEXT NOT NULL,
    artifact_id     TEXT,
    source_conv_id  TEXT,
    is_read         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_username, created_at DESC);

  CREATE TABLE IF NOT EXISTS mcp_servers (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    transport    TEXT NOT NULL CHECK (transport IN ('stdio', 'sse')),
    command      TEXT,
    args_json    TEXT,
    env_json     TEXT,
    url          TEXT,
    headers_json TEXT,
    enabled      INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// 既存DBへのカラム追加マイグレーション（ALTER TABLE は IF NOT EXISTS が使えないので try-catch）
try {
  db.exec(`ALTER TABLE task_messages ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]'`);
} catch {
  // already exists
}
try {
  db.exec(`ALTER TABLE conversations ADD COLUMN request_message TEXT`);
} catch {
  // already exists
}
try {
  db.exec(`ALTER TABLE conversations ADD COLUMN request_sender TEXT`);
} catch {
  // already exists
}
try {
  db.exec(`ALTER TABLE conversations ADD COLUMN request_created_at TEXT`);
} catch {
  // already exists
}
try {
  db.exec(`ALTER TABLE task_participants ADD COLUMN mcp_server_ids_json TEXT NOT NULL DEFAULT '[]'`);
} catch {
  // already exists
}
try {
  db.exec(`ALTER TABLE task_template_participants ADD COLUMN mcp_server_ids_json TEXT NOT NULL DEFAULT '[]'`);
} catch {
  // already exists
}

// ---- Query helpers ----

interface DbConversation {
  id: string;
  title: string;
  scenario_id: string | null;
  request_message: string | null;
  request_sender: string | null;
  request_created_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DbMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  images_json: string;
  artifacts_json: string;
  timestamp: string;
  sort_order: number;
}

function toConversation(row: DbConversation, messages: Message[] = []): Conversation {
  return {
    id: row.id,
    title: row.title,
    scenarioId: row.scenario_id ?? undefined,
    requestMessage: row.request_message ?? undefined,
    requestSender: row.request_sender ?? undefined,
    requestCreatedAt: row.request_created_at ? new Date(row.request_created_at) : undefined,
    messages,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toMessage(row: DbMessage): Message {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    images: JSON.parse(row.images_json),
    artifacts: JSON.parse(row.artifacts_json),
    timestamp: new Date(row.timestamp),
  };
}

export function listConversations(): Conversation[] {
  const rows = db
    .prepare('SELECT * FROM conversations ORDER BY updated_at DESC')
    .all() as DbConversation[];
  return rows.map(r => toConversation(r));
}

export function getConversationWithMessages(id: string): Conversation | undefined {
  const conv = db
    .prepare('SELECT * FROM conversations WHERE id = ?')
    .get(id) as DbConversation | undefined;
  if (!conv) return undefined;

  const msgs = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY sort_order ASC')
    .all(id) as DbMessage[];
  return toConversation(conv, msgs.map(toMessage));
}

export function createConversation(
  id: string,
  title: string,
  scenarioId?: string,
  requestMessage?: string,
  requestSender?: string,
): Conversation {
  const now = new Date().toISOString();
  const requestCreatedAt = requestMessage ? now : null;
  db.prepare(`
    INSERT INTO conversations (id, title, scenario_id, request_message, request_sender, request_created_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    scenarioId ?? null,
    requestMessage ?? null,
    requestSender ?? null,
    requestCreatedAt,
    now,
    now,
  );

  return {
    id,
    title,
    scenarioId,
    requestMessage,
    requestSender,
    requestCreatedAt: requestCreatedAt ? new Date(requestCreatedAt) : undefined,
    messages: [],
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
}

export function updateConversationTitle(id: string, title: string): void {
  const now = new Date().toISOString();
  db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id);
}

export function touchConversation(id: string): void {
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id,
  );
}

export function deleteConversation(id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

export function addMessage(conversationId: string, message: Message): void {
  const maxOrder = (
    db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM messages WHERE conversation_id = ?')
      .get(conversationId) as { m: number }
  ).m;

  db.prepare(`
    INSERT INTO messages
      (id, conversation_id, role, content, images_json, artifacts_json, timestamp, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    message.id,
    conversationId,
    message.role,
    message.content,
    JSON.stringify(message.images ?? []),
    JSON.stringify(message.artifacts ?? []),
    message.timestamp instanceof Date
      ? message.timestamp.toISOString()
      : String(message.timestamp),
    maxOrder + 1,
  );

  touchConversation(conversationId);
}

export function updateMessage(
  conversationId: string,
  messageId: string,
  updates: { content?: string; artifacts?: Message['artifacts'] },
): void {
  if (updates.content !== undefined && updates.artifacts !== undefined) {
    db.prepare(`
      UPDATE messages SET content = ?, artifacts_json = ? WHERE id = ? AND conversation_id = ?
    `).run(updates.content, JSON.stringify(updates.artifacts), messageId, conversationId);
  } else if (updates.content !== undefined) {
    db.prepare('UPDATE messages SET content = ? WHERE id = ? AND conversation_id = ?').run(
      updates.content,
      messageId,
      conversationId,
    );
  } else if (updates.artifacts !== undefined) {
    db.prepare(
      'UPDATE messages SET artifacts_json = ? WHERE id = ? AND conversation_id = ?',
    ).run(JSON.stringify(updates.artifacts), messageId, conversationId);
  }
}

export function deleteMessagesFrom(conversationId: string, fromMessageId: string): void {
  const row = db
    .prepare('SELECT sort_order FROM messages WHERE id = ? AND conversation_id = ?')
    .get(fromMessageId, conversationId) as { sort_order: number } | undefined;
  if (!row) return;

  db.prepare(
    'DELETE FROM messages WHERE conversation_id = ? AND sort_order >= ?',
  ).run(conversationId, row.sort_order);
}

// ---- Google user helpers ----

export interface GoogleUser {
  email: string;
  username: string;
  displayName: string;
}

export function getGoogleUser(email: string): GoogleUser | undefined {
  const row = db
    .prepare('SELECT email, username, display_name FROM google_users WHERE email = ?')
    .get(email) as { email: string; username: string; display_name: string } | undefined;
  if (!row) return undefined;
  return { email: row.email, username: row.username, displayName: row.display_name };
}

export function isUsernameTaken(username: string): boolean {
  return !!db.prepare('SELECT 1 FROM google_users WHERE username = ?').get(username);
}

export function listGoogleUsers(): GoogleUser[] {
  const rows = db.prepare('SELECT email, username, display_name FROM google_users').all() as { email: string; username: string; display_name: string }[];
  return rows.map(r => ({ email: r.email, username: r.username, displayName: r.display_name }));
}

export function suggestUsername(emailLocalPart: string): string {
  const base = emailLocalPart
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '') || 'user';

  if (!isUsernameTaken(base)) return base;
  for (let i = 2; i <= 999; i++) {
    const candidate = `${base}${i}`;
    if (!isUsernameTaken(candidate)) return candidate;
  }
  return `${base}_${Date.now()}`;
}

export function createGoogleUser(email: string, username: string, displayName: string): void {
  db.prepare(
    'INSERT INTO google_users (email, username, display_name) VALUES (?, ?, ?)',
  ).run(email, username, displayName);
}

// ---- Notification helpers ----

import type { Notification } from '../types';

interface DbNotification {
  id: string;
  user_username: string;
  sender_username: string;
  message: string;
  artifact_id: string | null;
  source_conv_id: string | null;
  is_read: number;
  created_at: string;
}

function toNotification(row: DbNotification): Notification {
  return {
    id: row.id,
    userUsername: row.user_username,
    senderUsername: row.sender_username,
    message: row.message,
    artifactId: row.artifact_id ?? undefined,
    sourceConvId: row.source_conv_id ?? undefined,
    isRead: row.is_read === 1,
    createdAt: new Date(row.created_at),
  };
}

export function listNotifications(userUsername: string): Notification[] {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_username = ? ORDER BY created_at DESC')
    .all(userUsername) as DbNotification[];
  return rows.map(toNotification);
}

export function getNotification(id: string): Notification | undefined {
  const row = db
    .prepare('SELECT * FROM notifications WHERE id = ?')
    .get(id) as DbNotification | undefined;
  return row ? toNotification(row) : undefined;
}

export function createNotification(
  id: string,
  userUsername: string,
  senderUsername: string,
  message: string,
  artifactId?: string,
  sourceConvId?: string,
): Notification {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO notifications (id, user_username, sender_username, message, artifact_id, source_conv_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    userUsername,
    senderUsername,
    message,
    artifactId ?? null,
    sourceConvId ?? null,
    now,
  );

  return {
    id,
    userUsername,
    senderUsername,
    message,
    artifactId,
    sourceConvId,
    isRead: false,
    createdAt: new Date(now),
  };
}

export function markNotificationAsRead(id: string): void {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
}

// ---- MCP server helpers ----

interface DbMcpServer {
  id: string;
  name: string;
  transport: 'stdio' | 'sse';
  command: string | null;
  args_json: string | null;
  env_json: string | null;
  url: string | null;
  headers_json: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

function toMcpServerConfig(row: DbMcpServer): McpServerConfig {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    command: row.command ?? undefined,
    args: row.args_json ? (JSON.parse(row.args_json) as string[]) : undefined,
    env: row.env_json ? (JSON.parse(row.env_json) as Record<string, string>) : undefined,
    url: row.url ?? undefined,
    headers: row.headers_json ? (JSON.parse(row.headers_json) as Record<string, string>) : undefined,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listMcpServers(): McpServerConfig[] {
  const rows = db.prepare('SELECT * FROM mcp_servers ORDER BY created_at ASC').all() as DbMcpServer[];
  return rows.map(toMcpServerConfig);
}

export function getMcpServer(id: string): McpServerConfig | undefined {
  const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as DbMcpServer | undefined;
  return row ? toMcpServerConfig(row) : undefined;
}

export function createMcpServer(config: Omit<McpServerConfig, 'createdAt' | 'updatedAt'>): McpServerConfig {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO mcp_servers (id, name, transport, command, args_json, env_json, url, headers_json, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    config.id,
    config.name,
    config.transport,
    config.command ?? null,
    config.args ? JSON.stringify(config.args) : null,
    config.env ? JSON.stringify(config.env) : null,
    config.url ?? null,
    config.headers ? JSON.stringify(config.headers) : null,
    config.enabled ? 1 : 0,
    now,
    now,
  );
  return { ...config, createdAt: now, updatedAt: now };
}

export function updateMcpServer(id: string, updates: Partial<Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt'>>): void {
  const now = new Date().toISOString();
  const sets: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
  if (updates.transport !== undefined) { sets.push('transport = ?'); values.push(updates.transport); }
  if (updates.command !== undefined) { sets.push('command = ?'); values.push(updates.command); }
  if (updates.args !== undefined) { sets.push('args_json = ?'); values.push(JSON.stringify(updates.args)); }
  if (updates.env !== undefined) { sets.push('env_json = ?'); values.push(JSON.stringify(updates.env)); }
  if (updates.url !== undefined) { sets.push('url = ?'); values.push(updates.url); }
  if (updates.headers !== undefined) { sets.push('headers_json = ?'); values.push(JSON.stringify(updates.headers)); }
  if (updates.enabled !== undefined) { sets.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }

  values.push(id);
  db.prepare(`UPDATE mcp_servers SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteMcpServer(id: string): void {
  db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
}

export default db;
