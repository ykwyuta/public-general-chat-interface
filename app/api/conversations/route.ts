import { NextResponse } from 'next/server';
import { listConversations, createConversation } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  const conversations = listConversations();
  return NextResponse.json(conversations);
}

export async function POST(req: Request) {
  const { title, scenarioId } = await req.json() as { title?: string; scenarioId?: string };
  const id = crypto.randomUUID();
  const conversation = createConversation(id, title ?? '新しいチャット', scenarioId);
  return NextResponse.json(conversation, { status: 201 });
}
