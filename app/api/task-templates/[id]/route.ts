import { NextResponse } from 'next/server';
import { getTemplate, updateTemplate, deleteTemplate } from '@/lib/taskTemplateDb';
import type { UpdateTaskTemplateParams } from '@/types/taskTemplate';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const template = getTemplate(id, username);
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(template);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as UpdateTaskTemplateParams;

  const updated = updateTemplate(id, body, username);
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const username = req.headers.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const deleted = deleteTemplate(id, username);
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new Response(null, { status: 204 });
}
