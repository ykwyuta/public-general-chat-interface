import { NextResponse } from 'next/server';
import { getChatTemplate } from '@/lib/chatTemplateDb';
import { resolveWorkspaceDir } from '@/lib/workspace';
import { headers } from 'next/headers';
import fs from 'fs';
import path from 'path';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const headersList = await headers();
  const username = headersList.get('x-username');
  if (!username) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const { conversationId } = await request.json();
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const template = getChatTemplate(id, username);
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (template.files && template.files.length > 0) {
      const workspaceDir = resolveWorkspaceDir(conversationId);
      if (!fs.existsSync(workspaceDir)) {
        fs.mkdirSync(workspaceDir, { recursive: true });
      }

      for (const file of template.files) {
        // Sanitize the filename to prevent path traversal
        const safeFilename = path.basename(file.filename);
        const filePath = path.join(workspaceDir, safeFilename);

        if (file.mediaType.startsWith('image/') || file.mediaType === 'application/octet-stream') {
          // It's base64, need to write binary
          const buffer = Buffer.from(file.content, 'base64');
          fs.writeFileSync(filePath, buffer);
        } else {
          // Text content
          fs.writeFileSync(filePath, file.content, 'utf8');
        }
      }
    }

    return NextResponse.json({
      welcomeMessage: template.welcomeMessage,
      systemPrompt: template.systemPrompt,
      mcpServers: template.mcpServers,
    });
  } catch (error) {
    console.error('Failed to apply chat template:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
