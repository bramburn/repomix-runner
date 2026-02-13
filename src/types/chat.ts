export interface Thread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  totalTokens: number;
  preview?: string;
}

export interface ThreadMessageTokens {
  input: number;
  output: number;
  total: number;
}

export interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
  tokens?: ThreadMessageTokens;
  contextFiles?: string[];
  toolCalls?: Array<{
    name: string;
    args?: Record<string, unknown>;
    result?: string;
  }>;
}

export interface Conversation {
  id: string;
  messages: ThreadMessage[];
}
