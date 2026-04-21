import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import type { UsersConfig, UserDefinition } from '@/types/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json({ error: 'ユーザー名とパスワードが必要です' }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'data', 'users.yaml');

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: '設定エラー: 管理者に連絡してください' }, { status: 500 });
    }

    const text = fs.readFileSync(filePath, 'utf-8');
    let config: UsersConfig;

    try {
      config = yaml.load(text) as UsersConfig;
    } catch {
      return NextResponse.json({ error: '設定エラー: 管理者に連絡してください' }, { status: 500 });
    }

    const matched: UserDefinition | undefined = config?.users?.find(
      (u) => u.username === username && u.password === password
    );

    if (!matched) {
      return NextResponse.json({ error: 'ユーザー名またはパスワードが正しくありません' }, { status: 401 });
    }

    return NextResponse.json({
      username: matched.username,
      displayName: matched.displayName ?? matched.username,
    });
  } catch {
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
