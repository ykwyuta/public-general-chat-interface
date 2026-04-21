import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export const runtime = 'nodejs';

// types/index.ts と同じ構成
interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

const DEFAULT_MODELS: ModelInfo[] = [
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview', provider: 'gemini' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', provider: 'gemini' },
  { id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet v2 (Bedrock)', provider: 'bedrock' },
  { id: 'us.anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku (Bedrock)', provider: 'bedrock' },
  { id: 'amazon.nova-pro-v1:0', name: 'Amazon Nova Pro', provider: 'bedrock' },
];

export async function GET() {
  let models = [...DEFAULT_MODELS];

  // 環境変数によるプロバイダーのフィルタリング
  const envAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const envGemini = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const envBedrock = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  models = models.filter(m => {
    if (m.provider === 'anthropic' && !envAnthropic) return false;
    if (m.provider === 'gemini' && !envGemini) return false;
    if (m.provider === 'bedrock' && !envBedrock) return false;
    return true;
  });

  try {
    const filePath = path.join(process.cwd(), 'public', 'models.yaml');
    if (fs.existsSync(filePath)) {
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const data = yaml.load(fileContents) as any;
      if (data && Array.isArray(data.models)) {
         models = data.models; // custom models.yaml replaces the default

         // apply environment filter to yaml models too
         models = models.filter(m => {
           if (m.provider === 'anthropic' && !envAnthropic) return false;
           if (m.provider === 'gemini' && !envGemini) return false;
           if (m.provider === 'bedrock' && !envBedrock) return false;
           return true;
         });
      }
    }
  } catch (e) {
    console.error('Error reading models.yaml', e);
  }

  return NextResponse.json(models);
}
