export interface ChatTemplateFile {
  id: string;
  templateId: string;
  filename: string;
  content: string; // Base64 or text
  mediaType: string;
}

export interface ChatTemplate {
  id: string;
  name: string;
  description: string;
  welcomeMessage: string;
  systemPrompt: string;
  mcpServers: string[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  files?: ChatTemplateFile[];
}

export interface CreateChatTemplateParams {
  name: string;
  description?: string;
  welcomeMessage?: string;
  systemPrompt?: string;
  mcpServers?: string[];
  files?: Omit<ChatTemplateFile, 'id' | 'templateId'>[];
}

export interface UpdateChatTemplateParams extends Partial<CreateChatTemplateParams> {}
