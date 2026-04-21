import { NextResponse } from 'next/server';
import { getTask, addTaskMessage, listMessages } from '@/lib/taskDb';
import type { HumanParticipant, LlmParticipant } from '@/types/task';
import type { ImageAttachment } from '@/types';
import { after } from 'next/server';

export const runtime = 'nodejs';

const MENTION_RE = /@([a-zA-Z0-9_-]+)/g;

function parseMentions(content: string, participantNames: Set<string>): string[] {
  const mentioned: string[] = [];
  for (const [, name] of content.matchAll(MENTION_RE)) {
    if (participantNames.has(name) && !mentioned.includes(name)) {
      mentioned.push(name);
    }
  }
  return mentioned;
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

  const url = new URL(req.url);
  const sinceId = url.searchParams.get('since') ?? undefined;
  return NextResponse.json(listMessages(id, sinceId));
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
  if (task.status !== 'active') {
    return NextResponse.json({ error: 'タスクが進行中ではありません' }, { status: 400 });
  }

  const isMember = task.createdBy === username ||
    task.participants.some(p => p.participantType === 'human' && (p as HumanParticipant).username === username);
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { content, images } = await req.json() as { content: string; images?: ImageAttachment[] };
  if (!content?.trim() && (!images || images.length === 0)) {
    return NextResponse.json({ error: 'content または images は必須です' }, { status: 400 });
  }

  // @メンション解析
  const participantNames = new Set<string>(
    task.participants.map(p => p.participantType === 'human' ? (p as HumanParticipant).username : p.agentName),
  );
  const mentions = parseMentions(content ?? '', participantNames);
  const toName = mentions.length > 0 ? mentions.join(',') : null;

  const msgId = crypto.randomUUID();
  const message = addTaskMessage(msgId, id, 'human', username, (content ?? '').trim(), toName, images);

  const llmTargets = mentions.length > 0
    ? task.participants.filter(p => p.participantType === 'llm' && mentions.includes(p.agentName))
    : task.participants.filter(p => p.participantType === 'llm');

  if (llmTargets.length > 0) {
    const baseUrl = new URL(req.url);
    const chatUrl = `${baseUrl.protocol}//${baseUrl.host}/api/tasks/${id}/chat`;
    after(async () => {
      for (const agent of llmTargets) {
        try {
          await fetch(chatUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-username': username },
            body: JSON.stringify({ agentName: (agent as LlmParticipant).agentName, triggerMessageId: msgId }),
          });
        } catch {
          // LLM 呼び出し失敗は無視（ベストエフォート）
        }
      }
    });
  }

  return NextResponse.json(message, { status: 201 });
}
