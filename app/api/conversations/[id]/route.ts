import { NextResponse } from 'next/server';
import {
  getConversationWithMessages,
  updateConversationTitle,
  deleteConversation,
} from '@/lib/db';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const conversation = getConversationWithMessages(id);
  if (!conversation) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(conversation);
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const { title } = await req.json() as { title: string };
  updateConversationTitle(id, title);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  deleteConversation(id);
  return NextResponse.json({ ok: true });
}
