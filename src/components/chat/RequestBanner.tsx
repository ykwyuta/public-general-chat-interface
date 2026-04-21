'use client';

export function RequestBanner({
  message,
  sender,
  createdAt,
}: {
  message: string;
  sender: string;
  createdAt?: Date;
}) {
  return (
    <div className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100 dark:border-blue-800 p-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-1">
        <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 font-medium">
          <span>依頼事項</span>
          <span>•</span>
          <span>依頼者: @{sender}</span>
          {createdAt && (
            <>
              <span>•</span>
              <span className="text-xs">{createdAt.toLocaleString()}</span>
            </>
          )}
        </div>
        <p className="text-sm text-gray-800 dark:text-gray-200">
          {message}
        </p>
      </div>
    </div>
  );
}
