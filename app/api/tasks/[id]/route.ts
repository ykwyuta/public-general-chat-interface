import { NextResponse } from 'next/server';
import { getTask, updateTask, deleteTask } from '@/lib/taskDb';
import type { TaskStatus, TaskParticipant, HumanParticipant } from '@/types/task';

function isHuman(p: TaskParticipant): p is HumanParticipant {
  return p.participantType === 'human';
}

export const runtime = 'nodejs';

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft:     ['active', 'cancelled'],
  active:    ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isMember = task.createdBy === username ||
    task.participants.some(p => isHuman(p) && p.username === username);
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json(task);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json() as {
    title?: string;
    purpose?: string;
    completionCondition?: string;
    status?: TaskStatus;
  };

  if (body.status !== undefined) {
    const canTerminate = task.createdBy === username ||
      task.participants.some(p => isHuman(p) && p.username === username && p.canTerminate);

    const isInitiator = task.createdBy === username;

    if (body.status === 'active' && !isInitiator) {
      return NextResponse.json({ error: 'タスク開始は開始者のみ可能です' }, { status: 403 });
    }
    if ((body.status === 'completed' || body.status === 'cancelled') && !canTerminate) {
      return NextResponse.json({ error: '終了権限がありません' }, { status: 403 });
    }

    if (!VALID_TRANSITIONS[task.status].includes(body.status)) {
      return NextResponse.json(
        { error: `${task.status} から ${body.status} への遷移は無効です` },
        { status: 409 },
      );
    }

    if (body.status === 'active') {
      if (!task.purpose.trim() || !task.completionCondition.trim()) {
        return NextResponse.json({ error: '目的と完了条件を入力してください' }, { status: 400 });
      }
      if (task.participants.length === 0) {
        return NextResponse.json({ error: '参加者を1名以上追加してください' }, { status: 400 });
      }
    }
  }

  updateTask(id, {
    title: body.title,
    purpose: body.purpose,
    completionCondition: body.completionCondition,
    status: body.status,
  });

  return NextResponse.json(getTask(id));
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (task.createdBy !== username) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  deleteTask(id);
  return new Response(null, { status: 204 });
}
