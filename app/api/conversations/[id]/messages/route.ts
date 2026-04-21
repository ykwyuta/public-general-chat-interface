import { NextResponse } from 'next/server';
import { addMessage, deleteMessagesFrom } from '@/lib/db';
import type { Message } from '@/types';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id: conversationId } = await params;
  const message = await req.json() as Message;
  addMessage(conversationId, message);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request, { params }: Params) {
  const { id: conversationId } = await params;
  const { searchParams } = new URL(req.url);
  const fromMessageId = searchParams.get('fromMessageId');

  if (!fromMessageId) {
    return NextResponse.json({ error: 'fromMessageId is required' }, { status: 400 });
  }

  deleteMessagesFrom(conversationId, fromMessageId);
  return NextResponse.json({ ok: true });
}
