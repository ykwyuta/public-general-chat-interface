import { NextResponse } from 'next/server';
import { listTasksForUser, createTask, addHumanParticipant } from '@/lib/taskDb';
import type { CreateTaskParams } from '@/types/task';
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

export async function GET(req: Request) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tasks = listTasksForUser(username);
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as CreateTaskParams;
  if (!body.title?.trim() || !body.purpose?.trim() || !body.completionCondition?.trim()) {
    return NextResponse.json({ error: 'title, purpose, completionCondition は必須です' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  createTask(id, body.title.trim(), body.purpose.trim(), body.completionCondition.trim(), username);

  // 開始者を自動的に参加者として追加（終了権限付き）
  const users = loadUsers();
  const creatorUser = users.users.find(u => u.username === username);
  const displayName = creatorUser?.displayName ?? username;
  addHumanParticipant(crypto.randomUUID(), id, username, displayName, true);

  const { getTask } = await import('@/lib/taskDb');
  const task = getTask(id)!;
  return NextResponse.json(task, { status: 201 });
}
