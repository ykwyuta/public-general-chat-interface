import db from './db';
import type { ChatTemplate, ChatTemplateFile, CreateChatTemplateParams, UpdateChatTemplateParams } from '../types/chatTemplate';

export function listChatTemplatesForUser(username: string): ChatTemplate[] {
  const rows = db.prepare(`
    SELECT * FROM chat_templates
    WHERE created_by = ?
    ORDER BY updated_at DESC
  `).all(username) as any[];

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    welcomeMessage: row.welcome_message,
    systemPrompt: row.system_prompt,
    mcpServers: JSON.parse(row.mcp_servers),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at + 'Z'),
    updatedAt: new Date(row.updated_at + 'Z'),
  }));
}

export function getChatTemplate(id: string, username: string): ChatTemplate | null {
  const row = db.prepare(`
    SELECT * FROM chat_templates
    WHERE id = ? AND created_by = ?
  `).get(id, username) as any;

  if (!row) return null;

  const filesRows = db.prepare(`
    SELECT * FROM chat_template_files
    WHERE template_id = ?
  `).all(id) as any[];

  const files: ChatTemplateFile[] = filesRows.map(f => ({
    id: f.id,
    templateId: f.template_id,
    filename: f.filename,
    content: f.content,
    mediaType: f.media_type,
  }));

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    welcomeMessage: row.welcome_message,
    systemPrompt: row.system_prompt,
    mcpServers: JSON.parse(row.mcp_servers),
    createdBy: row.created_by,
    createdAt: new Date(row.created_at + 'Z'),
    updatedAt: new Date(row.updated_at + 'Z'),
    files,
  };
}

export function createChatTemplate(params: CreateChatTemplateParams, username: string): ChatTemplate {
  const templateId = crypto.randomUUID();

  const insertTemplate = db.prepare(`
    INSERT INTO chat_templates (id, name, description, welcome_message, system_prompt, mcp_servers, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFile = db.prepare(`
    INSERT INTO chat_template_files (id, template_id, filename, content, media_type)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    insertTemplate.run(
      templateId,
      params.name,
      params.description || '',
      params.welcomeMessage || '',
      params.systemPrompt || '',
      JSON.stringify(params.mcpServers || []),
      username
    );

    if (params.files) {
      for (const file of params.files) {
        insertFile.run(
          crypto.randomUUID(),
          templateId,
          file.filename,
          file.content,
          file.mediaType
        );
      }
    }
  })();

  return getChatTemplate(templateId, username)!;
}

export function updateChatTemplate(id: string, params: UpdateChatTemplateParams, username: string): ChatTemplate | null {
  const existing = db.prepare(`SELECT id FROM chat_templates WHERE id = ? AND created_by = ?`).get(id, username);
  if (!existing) return null;

  const updateParts: string[] = [];
  const updateValues: any[] = [];

  if (params.name !== undefined) {
    updateParts.push('name = ?');
    updateValues.push(params.name);
  }
  if (params.description !== undefined) {
    updateParts.push('description = ?');
    updateValues.push(params.description);
  }
  if (params.welcomeMessage !== undefined) {
    updateParts.push('welcome_message = ?');
    updateValues.push(params.welcomeMessage);
  }
  if (params.systemPrompt !== undefined) {
    updateParts.push('system_prompt = ?');
    updateValues.push(params.systemPrompt);
  }
  if (params.mcpServers !== undefined) {
    updateParts.push('mcp_servers = ?');
    updateValues.push(JSON.stringify(params.mcpServers));
  }

  updateParts.push('updated_at = datetime("now")');

  const updateQuery = `
    UPDATE chat_templates
    SET ${updateParts.join(', ')}
    WHERE id = ? AND created_by = ?
  `;

  const insertFile = db.prepare(`
    INSERT INTO chat_template_files (id, template_id, filename, content, media_type)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    if (updateParts.length > 1) { // more than just updated_at
      db.prepare(updateQuery).run(...updateValues, id, username);
    }

    if (params.files !== undefined) {
      db.prepare(`DELETE FROM chat_template_files WHERE template_id = ?`).run(id);
      for (const file of params.files) {
        insertFile.run(
          crypto.randomUUID(),
          id,
          file.filename,
          file.content,
          file.mediaType
        );
      }
    }
  })();

  return getChatTemplate(id, username);
}

export function deleteChatTemplate(id: string, username: string): boolean {
  const result = db.prepare(`
    DELETE FROM chat_templates
    WHERE id = ? AND created_by = ?
  `).run(id, username);

  return result.changes > 0;
}
