import { NextResponse } from 'next/server';
import { markNotificationAsRead } from '@/lib/db';

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  try {
    markNotificationAsRead(id);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
