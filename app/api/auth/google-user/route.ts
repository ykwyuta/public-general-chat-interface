import { getGoogleUser, createGoogleUser, isUsernameTaken, suggestUsername } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
  if (!email) return Response.json({ error: 'email required' }, { status: 400 });

  const user = getGoogleUser(email);
  if (user) {
    return Response.json({ exists: true, username: user.username, displayName: user.displayName });
  }

  const localPart = email.split('@')[0];
  const suggestedUsername = suggestUsername(localPart);
  return Response.json({ exists: false, suggestedUsername }, { status: 404 });
}

export async function POST(request: Request) {
  const body = await request.json() as { email?: string; username?: string; displayName?: string };
  const { email, username, displayName } = body;

  if (!email || !username || !displayName) {
    return Response.json({ error: 'email, username, displayName required' }, { status: 400 });
  }

  if (!/^[a-z0-9_]{2,30}$/.test(username)) {
    return Response.json({ error: 'ユーザー名は2〜30文字の半角英数字・アンダースコアのみ使用できます' }, { status: 400 });
  }

  if (isUsernameTaken(username)) {
    return Response.json({ error: 'このユーザー名はすでに使われています' }, { status: 409 });
  }

  createGoogleUser(email, username, displayName);
  return Response.json({ username, displayName }, { status: 201 });
}
