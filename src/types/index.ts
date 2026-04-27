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

export * from './chatTemplate';
