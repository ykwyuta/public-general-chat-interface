import { NextResponse } from 'next/server';
import { listChatTemplatesForUser, createChatTemplate } from '@/lib/chatTemplateDb';
import { headers } from 'next/headers';
import type { CreateChatTemplateParams } from '@/types/chatTemplate';

export async function GET() {
  const headersList = await headers();
  const username = headersList.get('x-username');

  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const templates = listChatTemplatesForUser(username);
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Failed to list chat templates:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const headersList = await headers();
  const username = headersList.get('x-username');

  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const params: CreateChatTemplateParams = await request.json();
    if (!params.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const template = createChatTemplate(params, username);
    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Failed to create chat template:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
