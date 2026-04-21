import { NextResponse } from 'next/server';
import { getNotification, markNotificationAsRead, createConversation, getConversationWithMessages, addMessage } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { notificationId } = await req.json();

    if (!notificationId) {
      return NextResponse.json({ error: 'Missing notificationId' }, { status: 400 });
    }

    const notification = getNotification(notificationId);
    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    const newConvId = crypto.randomUUID();
    const title = `依頼: ${notification.message.substring(0, 20)}...`;

    // Create new conversation with request details
    createConversation(
      newConvId,
      title,
      undefined, // scenarioId
      notification.message,
      notification.senderUsername
    );

    // If an artifact was shared, fetch it and add it as the first message
    if (notification.sourceConvId && notification.artifactId) {
      const sourceConv = getConversationWithMessages(notification.sourceConvId);
      if (sourceConv) {
        const sourceMessage = sourceConv.messages.find(m =>
          m.artifacts.some(a => a.id === notification.artifactId)
        );

        if (sourceMessage) {
          const artifact = sourceMessage.artifacts.find(a => a.id === notification.artifactId);
          if (artifact) {
            const initialMsgId = crypto.randomUUID();
            addMessage(newConvId, {
              id: initialMsgId,
              role: 'user',
              content: `(アーティファクトを引き継ぎました: ${artifact.filename})`,
              artifacts: [artifact],
              timestamp: new Date()
            });
          }
        }
      }
    }

    // Mark as read
    markNotificationAsRead(notificationId);

    return NextResponse.json({ conversationId: newConvId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
  }
}
