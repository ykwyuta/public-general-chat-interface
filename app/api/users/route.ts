import { NextResponse } from 'next/server';
import { listGoogleUsers } from '@/lib/db';

export async function GET() {
  try {
    const users = listGoogleUsers();
    return NextResponse.json(users);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
