import { NextResponse } from 'next/server';
import { getTask, listParticipants, addHumanParticipant, addLlmParticipant } from '@/lib/taskDb';
import type { AddParticipantParams } from '@/types/task';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import type { UsersConfig } from '@/types/auth';

export const runtime = 'nodejs';

const AGENT_NAME_RE = /^[a-zA-Z0-9_-]{1,32}$/;

function loadUsers(): UsersConfig {
  const filePath = path.join(process.cwd(), 'data', 'users.yaml');
  const text = fs.readFileSync(filePath, 'utf-8');
  return yaml.load(text) as UsersConfig;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(listParticipants(id));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (task.createdBy !== username) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json() as AddParticipantParams;
  const participantId = crypto.randomUUID();

  if (body.participantType === 'human') {
    const users = loadUsers();
    const found = users.users.find(u => u.username === body.username);
    if (!found) {
      return NextResponse.json({ error: `ユーザー "${body.username}" は存在しません` }, { status: 404 });
    }

    const alreadyJoined = task.participants.some(
      p => p.participantType === 'human' && p.username === body.username,
    );
    if (alreadyJoined) {
      return NextResponse.json({ error: 'すでに参加しています' }, { status: 409 });
    }

    const humanCount = task.participants.filter(p => p.participantType === 'human').length;
    if (humanCount >= 20) {
      return NextResponse.json({ error: '人間参加者の上限（20名）に達しています' }, { status: 400 });
    }

    const participant = addHumanParticipant(
      participantId, id, body.username,
      found.displayName ?? body.username,
      body.canTerminate ?? false,
    );
    return NextResponse.json(participant, { status: 201 });
  }

  if (body.participantType === 'llm') {
    if (!AGENT_NAME_RE.test(body.agentName)) {
      return NextResponse.json(
        { error: 'エージェント名は半角英数字・ハイフン・アンダースコアのみ、32文字以内で入力してください' },
        { status: 400 },
      );
    }

    const nameConflict = task.participants.some(p => {
      if (p.participantType === 'llm') return p.agentName === body.agentName;
      if (p.participantType === 'human') return p.username === body.agentName;
      return false;
    });
    if (nameConflict) {
      return NextResponse.json({ error: 'その名前はすでに使用されています' }, { status: 409 });
    }

    const llmCount = task.participants.filter(p => p.participantType === 'llm').length;
    if (llmCount >= 5) {
      return NextResponse.json({ error: 'LLMエージェントの上限（5体）に達しています' }, { status: 400 });
    }

    const participant = addLlmParticipant(
      participantId, id, body.agentName, body.agentRole, body.provider, body.model,
      body.mcpServerIds ?? [],
    );
    return NextResponse.json(participant, { status: 201 });
  }

  return NextResponse.json({ error: '不正な participant_type です' }, { status: 400 });
}
