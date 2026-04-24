export type ArtifactKind = 'code' | 'html' | 'svg' | 'markdown' | 'image';

export interface Artifact {
  id: string;
  filename: string;
  language: string;
  kind: ArtifactKind;
  content: string;
  mimeType?: string; // 画像の場合のMIMEタイプ
  isExpanded: boolean;
}


export interface ImageAttachment {
  id: string;
  data: string;       // base64 encoded (without data URL prefix)
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  name: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: ImageAttachment[];
  artifacts: Artifact[];
  timestamp: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  scenarioId?: string;
  requestMessage?: string;
  requestSender?: string;
  requestCreatedAt?: Date;
}

export interface Notification {
  id: string;
  userUsername: string;
  senderUsername: string;
  message: string;
  artifactId?: string;
  sourceConvId?: string;
  isRead: boolean;
  createdAt: Date;
}

export interface Settings {
  systemPrompt: string;
  model: string;
  /** 使用するLLMプロバイダーID */
  provider: string;
  theme: 'light' | 'dark';
}

export const AVAILABLE_MODELS = [
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-7', name: 'Claude Opus 4.7', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview', provider: 'gemini' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', provider: 'gemini' },
  { id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0', name: 'Claude 3.5 Sonnet v2 (Bedrock)', provider: 'bedrock' },
  { id: 'us.anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku (Bedrock)', provider: 'bedrock' },
  { id: 'amazon.nova-pro-v1:0', name: 'Amazon Nova Pro', provider: 'bedrock' },
];
export * from './chatTemplate';
