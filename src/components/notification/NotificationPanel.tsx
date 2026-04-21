'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '../../stores/notificationStore';
import { useAuthStore } from '../../stores/authStore';
import { useRouter } from 'next/navigation';
import { useConversations } from '../../hooks/useConversations';

export function NotificationPanel() {
  const { notifications, unreadCount, fetchNotifications, markAsRead } = useNotificationStore();
  const { isAuthenticated } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { setActiveConversation } = useConversations();

  useEffect(() => {
    if (isAuthenticated) {
      fetchNotifications();
      // Optionally set up polling here
      const interval = setInterval(() => fetchNotifications(), 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, fetchNotifications]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleNotificationClick = async (id: string) => {
    await markAsRead(id);
    setIsOpen(false);

    try {
      const res = await fetch('/api/conversations/from-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: id })
      });
      if (res.ok) {
        const { conversationId } = await res.json();
        setActiveConversation(conversationId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-md transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        title="通知"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 text-xs text-white bg-red-500 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-md shadow-lg overflow-hidden z-50 flex flex-col"
          style={{ maxHeight: '400px' }}
        >
          <div className="p-3 border-b dark:border-gray-700 font-semibold text-sm">
            通知
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                通知はありません
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n.id)}
                  className={`w-full text-left p-3 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${!n.isRead ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-medium text-gray-900 dark:text-gray-100">
                      @{n.senderUsername} からの依頼
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {n.message}
                  </p>
                  {n.artifactId && (
                    <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      #{n.artifactId}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
