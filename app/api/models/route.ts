import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const runtime = 'nodejs';

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export async function GET() {
  // 環境変数によるプロバイダーのフィルタリング
  const envAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const envGemini = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const envBedrock = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  let models: ModelInfo[] = [];

  try {
    const filePath = path.join(process.cwd(), 'public', 'models.yaml');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data = yaml.load(fileContents) as any;
    if (data && Array.isArray(data.models)) {
      models = data.models;
    }
  } catch (e) {
    console.error('Error reading public/models.yaml:', e);
  }

  models = models.filter(m => {
    if (m.provider === 'anthropic' && !envAnthropic) return false;
    if (m.provider === 'gemini' && !envGemini) return false;
    if (m.provider === 'bedrock' && !envBedrock) return false;
    return true;
  });

  return NextResponse.json(models);
}
