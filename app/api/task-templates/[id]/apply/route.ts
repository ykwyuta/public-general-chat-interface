import { NextResponse } from 'next/server';
import { getTemplate } from '@/lib/taskTemplateDb';
import { createTask, getTask, addHumanParticipant, addLlmParticipant } from '@/lib/taskDb';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import type { UsersConfig } from '@/types/auth';

export const runtime = 'nodejs';

function loadUsers(): UsersConfig {
  const filePath = path.join(process.cwd(), 'data', 'users.yaml');
  const text = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(text) as UsersConfig;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const template = getTemplate(id, username);
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json() as { title?: string; purpose?: string; completionCondition?: string };

  const taskId = crypto.randomUUID();
  const task = createTask(
    taskId,
    (body.title ?? template.title).trim() || '新しいタスク',
    (body.purpose ?? template.purpose).trim(),
    (body.completionCondition ?? template.completionCondition).trim(),
    username,
  );

  const users = loadUsers();

  // Add creator as human participant
  const creatorDef = users.users.find(u => u.username === username);
  addHumanParticipant(
    crypto.randomUUID(), taskId, username,
    creatorDef?.displayName ?? username, false,
  );

  // Add template participants
  for (const p of template.participants) {
    if (p.participantType === 'human') {
      if (p.username === username) continue; // already added
      const found = users.users.find(u => u.username === p.username);
      if (!found) continue; // skip missing users
      try {
        addHumanParticipant(
          crypto.randomUUID(), taskId, p.username,
          found.displayName ?? p.username, p.canTerminate,
        );
      } catch {
        // skip duplicates
      }
    } else {
      try {
        addLlmParticipant(
          crypto.randomUUID(), taskId, p.agentName, p.agentRole, p.provider, p.model,
        );
      } catch {
        // skip duplicates
      }
    }
  }

  return NextResponse.json(getTask(taskId), { status: 201 });
}
