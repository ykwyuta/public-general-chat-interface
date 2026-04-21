import { NextResponse } from 'next/server';
import { listNotifications, createNotification } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get('username');

  if (!username) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  try {
    const notifications = listNotifications(username);
    return NextResponse.json(notifications);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userUsername, senderUsername, message, artifactId, sourceConvId } = body;

    if (!userUsername || !senderUsername || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const notification = createNotification(id, userUsername, senderUsername, message, artifactId, sourceConvId);

    return NextResponse.json(notification, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
