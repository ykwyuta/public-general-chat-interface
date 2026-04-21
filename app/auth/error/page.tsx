'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: 'このアカウントでのアクセスは許可されていません。組織のアカウントでログインしてください。',
  Configuration: 'サーバー設定エラーが発生しました。管理者に連絡してください。',
  Verification: '認証リンクが無効または期限切れです。',
};

function ErrorContent() {
  const params = useSearchParams();
  const error = params.get('error') ?? 'unknown';
  const message = ERROR_MESSAGES[error] ?? '認証中にエラーが発生しました。再度お試しください。';

  return (
    <div
      className="flex h-screen items-center justify-center"
      style={{ background: 'var(--bg)' }}
    >
      <div className="w-full max-w-sm px-4 text-center">
        <div
          className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl"
          style={{ background: '#EF4444', color: '#fff' }}
        >
          !
        </div>
        <h1 className="text-xl font-semibold mb-3" style={{ color: 'var(--text)' }}>
          ログインできませんでした
        </h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
          {message}
        </p>
        <a
          href="/"
          className="inline-block px-6 py-2.5 rounded-lg text-sm font-medium"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          ログイン画面に戻る
        </a>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense>
      <ErrorContent />
    </Suspense>
  );
}
