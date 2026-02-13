import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Conversation, Thread, ThreadMessage } from '../types/chat.js';
import { logger } from '../shared/logger.js';

const DEFAULT_THREAD_TITLE = 'New Chat';

function safePreview(content: string, maxLength = 80): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
}

export class ConversationService {
  private readonly storageDir: string;
  private readonly threadsFile: string;
  private readonly conversationsDir: string;

  constructor(context: vscode.ExtensionContext) {
    this.storageDir = context.globalStorageUri.fsPath;
    this.threadsFile = path.join(this.storageDir, 'threads.json');
    this.conversationsDir = path.join(this.storageDir, 'conversations');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    await fs.mkdir(this.conversationsDir, { recursive: true });
    try {
      await fs.access(this.threadsFile);
    } catch {
      await this.writeThreads([]);
    }
  }

  async getThreads(): Promise<Thread[]> {
    try {
      const raw = await fs.readFile(this.threadsFile, 'utf-8');
      const parsed = JSON.parse(raw) as Thread[];
      return parsed
        .slice()
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch (error) {
      logger.both.warn('ConversationService: Failed to read threads index', error);
      return [];
    }
  }

  async createThread(initialTitle = DEFAULT_THREAD_TITLE): Promise<Thread> {
    const now = Date.now();
    const thread: Thread = {
      id: randomUUID(),
      title: initialTitle,
      createdAt: now,
      updatedAt: now,
      totalTokens: 0,
      preview: '',
    };

    const threads = await this.getThreads();
    threads.unshift(thread);
    await this.writeThreads(threads);
    await this.writeConversation({ id: thread.id, messages: [] });
    return thread;
  }

  async getConversation(threadId: string): Promise<Conversation | null> {
    const filePath = this.getConversationFilePath(threadId);
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw) as Conversation;
    } catch {
      return null;
    }
  }

  async saveMessage(threadId: string, message: ThreadMessage): Promise<void> {
    const conversation = (await this.getConversation(threadId)) ?? { id: threadId, messages: [] };
    conversation.messages.push(message);
    await this.writeConversation(conversation);
    await this.updateThreadAfterMessage(threadId, message);
  }

  async renameThread(threadId: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) {
      return;
    }
    const threads = await this.getThreads();
    const match = threads.find((thread) => thread.id === threadId);
    if (!match) {
      return;
    }
    match.title = trimmed;
    match.updatedAt = Date.now();
    await this.writeThreads(threads);
  }

  async deleteThread(threadId: string): Promise<void> {
    const threads = await this.getThreads();
    const filtered = threads.filter((thread) => thread.id !== threadId);
    await this.writeThreads(filtered);

    try {
      await fs.unlink(this.getConversationFilePath(threadId));
    } catch {
      // Ignore missing files
    }
  }

  async exportThread(threadId: string, destinationPath: string): Promise<void> {
    const conversation = await this.getConversation(threadId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }
    await fs.writeFile(destinationPath, JSON.stringify(conversation, null, 2), 'utf-8');
  }

  private async updateThreadAfterMessage(threadId: string, message: ThreadMessage): Promise<void> {
    const threads = await this.getThreads();
    const index = threads.findIndex((thread) => thread.id === threadId);
    if (index === -1) {
      return;
    }

    const thread = threads[index];
    thread.updatedAt = Date.now();
    thread.preview = safePreview(message.content);
    if (message.tokens?.total) {
      thread.totalTokens = (thread.totalTokens || 0) + message.tokens.total;
    }

    if (thread.title === DEFAULT_THREAD_TITLE && message.role === 'user') {
      thread.title = safePreview(message.content, 50);
    }

    threads.splice(index, 1);
    threads.unshift(thread);
    await this.writeThreads(threads);
  }

  private async writeThreads(threads: Thread[]): Promise<void> {
    await fs.writeFile(this.threadsFile, JSON.stringify(threads, null, 2), 'utf-8');
  }

  private async writeConversation(conversation: Conversation): Promise<void> {
    const filePath = this.getConversationFilePath(conversation.id);
    await fs.writeFile(filePath, JSON.stringify(conversation, null, 2), 'utf-8');
  }

  private getConversationFilePath(threadId: string): string {
    return path.join(this.conversationsDir, `${threadId}.json`);
  }
}
