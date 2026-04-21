import { NextResponse } from 'next/server';
import { getTask, getParticipant, removeParticipant } from '@/lib/taskDb';

export const runtime = 'nodejs';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; pid: string }> },
) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, pid } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (task.createdBy !== username) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const participant = getParticipant(pid);
  if (!participant || participant.taskId !== id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // 開始者自身は削除不可
  if (participant.participantType === 'human' && participant.username === task.createdBy) {
    return NextResponse.json({ error: '開始者を参加者から削除することはできません' }, { status: 400 });
  }

  removeParticipant(pid);
  return new Response(null, { status: 204 });
}
