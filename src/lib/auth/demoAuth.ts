import type { AuthUser } from '../../types/auth';

export async function authenticateDemo(
  username: string,
  password: string
): Promise<AuthUser | null> {
  let response: Response;
  try {
    response = await fetch('/api/auth/demo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    throw new Error('ネットワークエラー: 再度お試しください');
  }

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    let errorMsg = 'ユーザー設定ファイルの読み込みに失敗しました';
    try {
      const errBody = await response.json();
      if (errBody.error) {
        errorMsg = errBody.error;
      }
    } catch {
      // Ignore JSON parse error on fallback
    }
    throw new Error(errorMsg);
  }

  const user = await response.json();
  return {
    username: user.username,
    displayName: user.displayName ?? user.username,
  };
}
