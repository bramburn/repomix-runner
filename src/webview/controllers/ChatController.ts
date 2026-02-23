import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as path from 'path';
import type { Pool } from 'pg';
import { BaseController, IWebviewContext } from './BaseController.js';
import { createChatGraph } from '../../chat/graph.js';
import { logger } from '../../shared/logger.js';
import { PlanService } from '../../services/planService.js';
import { ThreadRepository } from '../../chat/db/threadRepository.js';
import { MessageRepository } from '../../chat/db/messageRepository.js';
import { ThreadMessage } from '../../types/chat.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import { getCwd } from '../../config/getCwd.js';

/**
 * ChatController handles chat messages from the webview and executes the chat graph.
 */
export class ChatController extends BaseController {
  private readonly threadRepository: ThreadRepository;
  private readonly messageRepository: MessageRepository;
  private readonly planService: PlanService;
  private readonly ready: Promise<void>;
  private activeThreadId: string | null = null;
  private repoId: string = '';

  constructor(
    context: IWebviewContext,
    private readonly extensionContext: vscode.ExtensionContext,
    pgPool: Pool
  ) {
    super(context);
    this.threadRepository = new ThreadRepository(pgPool);
    this.messageRepository = new MessageRepository(pgPool);
    this.planService = new PlanService(extensionContext);
    this.ready = this.initializeService();
  }

  async onWebviewLoaded(): Promise<void> {
    await this.ready;
    await this.postThreads();
    if (this.activeThreadId) {
      await this.postThreadHistory(this.activeThreadId);
    }
  }

  async handleMessage(message: any): Promise<boolean> {
    await this.ready;

    if (message.command === 'chatSubmit') {
      await this.runChatGraph(message.text);
      return true;
    }
    if (message.command === 'getThreads') {
      await this.postThreads();
      return true;
    }
    if (message.command === 'createThread') {
      const thread = await this.threadRepository.createThread(this.repoId);
      this.activeThreadId = thread.id;
      await this.extensionContext.workspaceState.update('repomix.chat.activeThreadId', thread.id);
      await this.postThreads();
      await this.postThreadHistory(thread.id);
      return true;
    }
    if (message.command === 'setActiveThread') {
      await this.setActiveThread(message.threadId);
      return true;
    }
    if (message.command === 'loadThread') {
      await this.setActiveThread(message.threadId);
      return true;
    }
    if (message.command === 'deleteThread') {
      await this.deleteThread(message.threadId);
      return true;
    }
    if (message.command === 'renameThread') {
      await this.threadRepository.renameThread(message.threadId, message.newName);
      await this.postThreads();
      return true;
    }
    if (message.command === 'exportThread') {
      await this.exportThread(message.threadId);
      return true;
    }
    if (message.command === 'openFile') {
      await this.openFile(message.path);
      return true;
    }
    return false;
  }

  private async initializeService(): Promise<void> {
    this.repoId = await getRepoId(getCwd());

    const threads = await this.threadRepository.getThreads(this.repoId);
    const persisted = this.extensionContext.workspaceState.get<string>(
      'repomix.chat.activeThreadId'
    );
    const persistedExists = persisted && threads.some((thread) => thread.id === persisted);

    if (persistedExists && persisted) {
      this.activeThreadId = persisted;
      return;
    }

    if (threads.length > 0) {
      this.activeThreadId = threads[0].id;
      await this.extensionContext.workspaceState.update(
        'repomix.chat.activeThreadId',
        this.activeThreadId
      );
      return;
    }

    const created = await this.threadRepository.createThread(this.repoId);
    this.activeThreadId = created.id;
    await this.extensionContext.workspaceState.update(
      'repomix.chat.activeThreadId',
      this.activeThreadId
    );
  }

  private async setActiveThread(threadId: string): Promise<void> {
    const thread = await this.threadRepository.getThread(threadId);
    if (!thread) {
      return;
    }
    this.activeThreadId = threadId;
    await this.extensionContext.workspaceState.update('repomix.chat.activeThreadId', threadId);
    await this.postThreads();
    await this.postThreadHistory(threadId);
  }

  private async deleteThread(threadId: string): Promise<void> {
    await this.threadRepository.deleteThread(threadId);
    const threads = await this.threadRepository.getThreads(this.repoId);

    if (this.activeThreadId === threadId) {
      const nextThread = threads[0] ?? (await this.threadRepository.createThread(this.repoId));
      this.activeThreadId = nextThread.id;
      await this.extensionContext.workspaceState.update(
        'repomix.chat.activeThreadId',
        nextThread.id
      );
      await this.postThreadHistory(nextThread.id);
    }

    await this.postThreads();
  }

  private async exportThread(threadId: string): Promise<void> {
    const defaultUri = vscode.Uri.file(`chat-${threadId}.json`);
    const destination = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { JSON: ['json'] },
      saveLabel: 'Export Thread',
    });

    if (!destination) {
      return;
    }

    try {
      const messages = await this.messageRepository.getMessages(threadId);
      const data = { id: threadId, messages };
      await fs.writeFile(destination.fsPath, JSON.stringify(data, null, 2), 'utf-8');
      this.context.postMessage({
        command: 'showNotification',
        type: 'info',
        message: 'Thread exported successfully.',
      });
    } catch (error) {
      logger.both.error('ChatController: Failed to export thread', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to export thread: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async openFile(filePath: string): Promise<void> {
    try {
      const document = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(document, { preview: false });
    } catch (error) {
      logger.both.error('ChatController: Failed to open file', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to open file: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async postThreads(): Promise<void> {
    const threads = await this.threadRepository.getThreads(this.repoId);
    this.context.postMessage({
      command: 'threadList',
      activeThreadId: this.activeThreadId,
      threads: threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        updatedAt: thread.updatedAt,
        createdAt: thread.createdAt,
        totalTokens: thread.totalTokens,
        preview: thread.preview ?? '',
        planPath: this.planService.getPlanPath(thread.id),
      })),
    });
  }

  private async postThreadHistory(threadId: string): Promise<void> {
    const messages = await this.messageRepository.getMessages(threadId);
    this.context.postMessage({
      command: 'threadHistory',
      threadId,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
        toolCalls: message.toolCalls,
      })),
    });
  }

  private async runChatGraph(input: string) {
    try {
      if (!this.activeThreadId) {
        const thread = await this.threadRepository.createThread(this.repoId);
        this.activeThreadId = thread.id;
        await this.extensionContext.workspaceState.update(
          'repomix.chat.activeThreadId',
          thread.id
        );
      }

      logger.both.info(`ChatController: Processing user input: "${input}"`);

      const userMessage: ThreadMessage = {
        id: randomUUID(),
        role: 'user',
        content: input,
        timestamp: Date.now(),
      };
      await this.messageRepository.saveMessage(this.activeThreadId, userMessage);

      const messages = await this.messageRepository.getMessages(this.activeThreadId);
      const history = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const onProgress = (message: string) => {
        this.context.postMessage({
          command: 'chatProgress',
          text: message,
        });
      };

      const graph = createChatGraph(this.extensionContext, onProgress);
      const result = await graph.invoke({
        userQuery: input,
        threadId: this.activeThreadId,
        messages: history,
      });

      logger.both.info(`ChatController: Graph returned response: "${result.aiResponse}"`);

      const toolCalls: NonNullable<ThreadMessage['toolCalls']> = [];
      if (result.planUpdated) {
        const fullPlanPath = this.planService.getPlanPath(this.activeThreadId);
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
        const relativePath = workspacePath
          ? path.relative(workspacePath, fullPlanPath)
          : fullPlanPath;

        toolCalls.push({
          name: 'update_plan',
          args: {
            path: fullPlanPath,
            relativePath,
            isNew: Boolean(result.planIsNew),
          },
        });
      }

      const assistantMessage: ThreadMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: result.aiResponse,
        timestamp: Date.now(),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        tokens:
          typeof result.inputTokens === 'number' || typeof result.outputTokens === 'number'
            ? {
                input: result.inputTokens ?? 0,
                output: result.outputTokens ?? 0,
                total:
                  result.tokensUsed ?? (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
              }
            : undefined,
        contextFiles: Array.isArray(result.retrievedContext)
          ? [
              ...new Set(
                result.retrievedContext
                  .map((ctx: { filePath?: string }) => ctx.filePath)
                  .filter((filePath): filePath is string => Boolean(filePath))
              ),
            ]
          : undefined,
      };
      await this.messageRepository.saveMessage(this.activeThreadId, assistantMessage);
      await this.postThreads();

      this.context.postMessage({
        command: 'chatResponse',
        text: result.aiResponse,
        toolCalls: assistantMessage.toolCalls,
        tokensUsed: result.tokensUsed,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      });
    } catch (error) {
      logger.both.error('ChatController: Error running chat graph:', error);
      this.context.postMessage({
        command: 'chatResponse',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }
}
