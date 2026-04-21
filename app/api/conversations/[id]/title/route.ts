import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/providers';
import { updateConversationTitle } from '@/lib/db';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { firstMessage, provider: providerId } = await req.json() as {
    firstMessage: string;
    provider?: string;
  };

  try {
    if (!providerId) {
      throw new Error('Provider is required');
    }
    const provider = getProvider(providerId);
    const title = await provider.generateTitle(firstMessage);
    updateConversationTitle(id, title);
    return NextResponse.json({ title });
  } catch {
    const title = firstMessage.slice(0, 30);
    updateConversationTitle(id, title);
    return NextResponse.json({ title });
  }
}
