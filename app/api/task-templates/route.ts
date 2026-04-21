import { NextResponse } from 'next/server';
import { listTemplatesForUser, createTemplate } from '@/lib/taskTemplateDb';
import type { CreateTaskTemplateParams } from '@/types/taskTemplate';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const templates = listTemplatesForUser(username);
  return NextResponse.json(templates);
}

export async function POST(req: Request) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as CreateTaskTemplateParams;
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name は必須です' }, { status: 400 });
  }

  const template = createTemplate(body, username);
  return NextResponse.json(template, { status: 201 });
}
