import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as path from 'path';
import type { Pool } from 'pg';
import { Command } from '@langchain/langgraph';
import { BaseController, IWebviewContext } from './BaseController.js';
import { createHitlChatGraph, createGraphConfig } from '../../chat/graph.js';
import { logger } from '../../shared/logger.js';
import { PlanService } from '../../services/planService.js';
import { ThreadRepository } from '../../chat/db/threadRepository.js';
import { MessageRepository } from '../../chat/db/messageRepository.js';
import { BatchManager } from '../../chat/batch/batchManager.js';
import { BatchPoller } from '../../chat/batch/batchPoller.js';
import { ThreadMessage } from '../../types/chat.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import { getCwd } from '../../config/getCwd.js';
import { MemoryManager } from '../../chat/memory/memoryManager.js';
import type { MemoryScope } from '../../chat/memory/types.js';
import type { BatchCompletionResult } from '../../chat/batch/types.js';
import type {
  BatchJob,
  BatchJobStatus,
  PackageType,
} from '../../chat/db/batchRepository.js';
import type {
  GoalReviewInterrupt,
  GoalReviewResume,
  SendReviewInterrupt,
  SendReviewResume,
  BatchPendingInterrupt,
  BatchPendingResume,
  EditReviewInterrupt,
  EditReviewResume,
  CodeReviewInterrupt,
  CodeReviewResume,
} from '../../chat/nodes/index.js';
import { MessageQueue, GraphExecutor } from '../../chat/queue/index.js';
import type {
  ProcessingCompletedEvent,
  ProcessingStartedEvent,
  QueueEntry,
} from '../../chat/queue/index.js';

/**
 * Union type for all interrupt payloads.
 */
type InterruptPayload =
  | GoalReviewInterrupt
  | SendReviewInterrupt
  | BatchPendingInterrupt
  | EditReviewInterrupt
  | CodeReviewInterrupt;

const THREAD_HISTORY_PAGE_SIZE = 50;

/**
 * ChatController handles chat messages from the webview and executes the HITL chat graph.
 */
export class ChatController extends BaseController {
  private readonly threadRepository: ThreadRepository;
  private readonly messageRepository: MessageRepository;
  private readonly planService: PlanService;
  private readonly batchManager: BatchManager;
  private readonly batchPoller: BatchPoller;
  private readonly pgPool: Pool;
  private readonly ready: Promise<void>;
  private activeThreadId: string | null = null;
  private repoId: string = '';
  private compiledGraph: Awaited<ReturnType<typeof createHitlChatGraph>> | null = null;
  private messageQueue: MessageQueue;
  private graphExecutor: GraphExecutor | null = null;
  private queueProcessing: boolean = false;

  constructor(
    context: IWebviewContext,
    private readonly extensionContext: vscode.ExtensionContext,
    pgPool: Pool
  ) {
    super(context);
    this.pgPool = pgPool;
    this.threadRepository = new ThreadRepository(pgPool);
    this.messageRepository = new MessageRepository(pgPool);
    this.planService = new PlanService(extensionContext);
    this.batchManager = new BatchManager(pgPool, extensionContext);
    this.batchPoller = new BatchPoller(this.batchManager, {
      pollIntervalSeconds: vscode.workspace
        .getConfiguration('repomix.chat')
        .get<number>('batchPollIntervalSeconds', 60),
    });
    this.messageQueue = new MessageQueue();
    this.setupQueueListeners();
    this.ready = this.initializeService();
  }

  private setupQueueListeners(): void {
    this.messageQueue.on('queueChanged', () => {
      this.postQueueStatus();
    });
    
    this.messageQueue.on('processingStarted', (event: ProcessingStartedEvent) => {
      this.context.postMessage({
        command: 'queueProcessingStarted',
        entryId: event.entry.id,
      });
    });
    
    this.messageQueue.on('processingCompleted', (event: ProcessingCompletedEvent) => {
      this.context.postMessage({
        command: 'queueProcessingCompleted',
        entryId: event.entry.id,
        success: event.success,
      });
    });
  }

  async onWebviewLoaded(): Promise<void> {
    await this.ready;
    await this.postThreads();
    await this.restoreQueueState(); // Restore queue state from persistence (PRD 007)
    
    if (this.activeThreadId) {
      await this.postThreadHistory(this.activeThreadId);
      await this.postPendingBatchStatuses(this.activeThreadId);
      await this.batchPoller.resumePendingForThread(
        this.activeThreadId,
        this.handleBatchTerminalState
      );
    }
  }

  async handleMessage(message: any): Promise<boolean> {
    await this.ready;

    if (message.command === 'chatSubmit') {
      await this.enqueueMessage(message.text, 'normal');
      return true;
    }
    if (message.command === 'chatForceSubmit') {
      await this.enqueueMessage(message.text, 'force');
      return true;
    }
    if (message.command === 'chatStop') {
      this.stopCurrentExecution();
      return true;
    }
    if (message.command === 'chatCancelQueued') {
      this.cancelQueuedMessage(message.entryId);
      return true;
    }
    if (message.command === 'chatClearQueue') {
      this.clearQueue();
      return true;
    }
    if (message.command === 'getQueueStatus') {
      await this.postQueueStatus();
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
    if (message.command === 'getThreadHistoryPage') {
      await this.postThreadHistory(
        message.threadId,
        typeof message.limit === 'number' ? message.limit : THREAD_HISTORY_PAGE_SIZE,
        message.before ?? null,
        true
      );
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

    // Memory CRUD handlers (PRD 004)
    if (message.command === 'getMemories') {
      await this.handleGetMemories(message.scope);
      return true;
    }
    if (message.command === 'createMemory') {
      await this.handleCreateMemory(message.scope, message.key, message.value);
      return true;
    }
    if (message.command === 'updateMemory') {
      await this.handleUpdateMemory(message.id, message.value);
      return true;
    }
    if (message.command === 'deleteMemory') {
      await this.handleDeleteMemory(message.id);
      return true;
    }

    // HITL resume commands
    if (message.command === 'resumeGoalReview') {
      await this.resumeGraph({
        goalText: message.goalText,
        contextFiles: message.contextFiles,
      } as GoalReviewResume);
      return true;
    }
    if (message.command === 'resumePackageReview') {
      await this.resumeGraph({
        approved: message.approved,
        packageId: message.packageId,
      } as SendReviewResume);
      return true;
    }
    if (message.command === 'resumeBatchPending') {
      await this.resumeGraph({
        completed: message.completed,
        responseContent: message.responseContent,
        error: message.error,
      } as BatchPendingResume);
      return true;
    }
    if (message.command === 'resumeEditReview') {
      await this.resumeGraph({
        approvedEdits: message.approvedEdits,
      } as EditReviewResume);
      return true;
    }
    if (message.command === 'resumeCodeReview') {
      await this.resumeGraph({
        requestReviewCycle: message.requestReviewCycle,
      } as CodeReviewResume);
      return true;
    }

    // Package Manager handlers (PRD 006)
    if (message.command === 'listPackages') {
      await this.handleListPackages(message.status, message.packageType);
      return true;
    }
    if (message.command === 'approvePackage') {
      await this.batchManager.approvePackage(message.packageId);
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'unapprovePackage') {
      await this.batchManager.unapprovePackage(message.packageId);
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'sendPackage') {
      const result = await this.batchManager.submitExistingPackage(message.packageId);
      this.batchPoller.startPolling(result.batchJobId, this.handleBatchTerminalState);
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'sendAllApproved') {
      const result = await this.batchManager.sendAllApproved();
      for (const batchJobId of result.submitted) {
        this.batchPoller.startPolling(batchJobId, this.handleBatchTerminalState);
      }
      await this.handleListPackages();
      this.context.postMessage({
        command: 'packagesBulkSendResult',
        submitted: result.submitted,
        failed: result.failed,
        skipped: result.skipped,
      });
      return true;
    }
    if (message.command === 'cancelBatch') {
      await this.batchManager.cancelBatch(message.packageId);
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'deletePackage') {
      await this.batchManager.deletePackage(message.packageId);
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'updatePackageDraft') {
      await this.batchManager.updateDraftPackage(message.packageId, {
        goal: message.goal,
        outputInstruction: message.outputInstruction,
      });
      await this.handleGetPackagePreview(message.packageId);
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'getPackagePreview') {
      await this.handleGetPackagePreview(message.packageId);
      return true;
    }
    if (message.command === 'viewBatchStatus') {
      await this.handleViewBatchStatus(message.packageId);
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
    await this.postPendingBatchStatuses(threadId);
    await this.batchPoller.resumePendingForThread(threadId, this.handleBatchTerminalState);
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

  // --- Memory CRUD Handlers (PRD 004) ---

  private async handleGetMemories(scope: MemoryScope): Promise<void> {
    try {
      const scopeId = scope === 'session' ? this.activeThreadId ?? '' : this.repoId;
      if (!scopeId) {
        this.context.postMessage({
          command: 'memoryList',
          scope,
          memories: [],
        });
        return;
      }

      const memoryManager = new MemoryManager(this.pgPool);
      const memories = await memoryManager.list(scope, scopeId);

      this.context.postMessage({
        command: 'memoryList',
        scope,
        memories: memories.map((m) => ({
          id: m.id,
          key: m.key,
          value: m.value,
          source: m.source,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          expiresAt: m.expiresAt,
        })),
      });
    } catch (error) {
      logger.both.error('ChatController: Failed to get memories', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to load memories: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async handleCreateMemory(scope: MemoryScope, key: string, value: string): Promise<void> {
    try {
      const scopeId = scope === 'session' ? this.activeThreadId ?? '' : this.repoId;
      if (!scopeId) {
        throw new Error('No active context for memory creation');
      }

      const memoryManager = new MemoryManager(this.pgPool);
      await memoryManager.create({
        scope,
        scopeId,
        key,
        value,
        source: 'user',
      });

      // Refresh the memory list
      await this.handleGetMemories(scope);
    } catch (error) {
      logger.both.error('ChatController: Failed to create memory', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to create memory: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async handleUpdateMemory(id: string, value: string): Promise<void> {
    try {
      const memoryManager = new MemoryManager(this.pgPool);
      const memory = await memoryManager.get(id);

      if (!memory) {
        throw new Error('Memory not found');
      }

      await memoryManager.update(id, { value });

      // Refresh the memory list for the appropriate scope
      await this.handleGetMemories(memory.scope);
    } catch (error) {
      logger.both.error('ChatController: Failed to update memory', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to update memory: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async handleDeleteMemory(id: string): Promise<void> {
    try {
      const memoryManager = new MemoryManager(this.pgPool);
      const memory = await memoryManager.get(id);

      if (!memory) {
        throw new Error('Memory not found');
      }

      const scope = memory.scope;
      await memoryManager.delete(id);

      // Refresh the memory list for the appropriate scope
      await this.handleGetMemories(scope);
    } catch (error) {
      logger.both.error('ChatController: Failed to delete memory', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to delete memory: ${error instanceof Error ? error.message : String(error)}`,
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

  private async postThreadHistory(
    threadId: string,
    limit: number = THREAD_HISTORY_PAGE_SIZE,
    before?: { timestamp: number; id: string } | null,
    append: boolean = false
  ): Promise<void> {
    const page = await this.messageRepository.getMessagesPage(threadId, { limit, before });
    this.context.postMessage({
      command: 'threadHistory',
      threadId,
      append,
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      messages: page.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        timestamp: message.timestamp,
        toolCalls: message.toolCalls,
      })),
    });
  }

  private async postPendingBatchStatuses(threadId: string): Promise<void> {
    const pending = await this.batchManager.getPendingBatches(threadId);
    for (const job of pending) {
      this.context.postMessage({
        command: 'batchStatus',
        batchJobId: job.batchJobId,
        status: job.status === 'processing' ? 'processing' : 'pending',
        estimatedCompletionTime: 'Batch processing in progress.',
      });
    }
  }

  private mapPackage(job: BatchJob) {
    const promptPayload = job.promptPayload as {
      package?: {
        goal: string;
        contextFiles: Array<{ path: string; content: string }>;
        outputInstruction: PackageType;
      };
    };
    const pkg = promptPayload?.package;

    return {
      id: job.id,
      threadId: job.threadId,
      batchApiId: job.batchApiId,
      status: job.status,
      packageType: job.packageType,
      goal: pkg?.goal ?? '',
      contextFileCount: Array.isArray(pkg?.contextFiles) ? pkg.contextFiles.length : 0,
      estimatedTokens: this.estimatePackageTokens(pkg?.goal ?? '', pkg?.contextFiles ?? []),
      tokensInput: job.tokensInput,
      tokensOutput: job.tokensOutput,
      costUsd: job.costUsd,
      createdAt: job.createdAt,
      submittedAt: job.submittedAt,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
    };
  }

  private estimatePackageTokens(
    goal: string,
    contextFiles: Array<{ path: string; content: string }>
  ): number {
    const goalTokens = Math.ceil(goal.length / 4);
    const contextTokens = contextFiles.reduce(
      (sum, file) => sum + Math.ceil((file.content?.length ?? 0) / 4),
      0
    );
    return goalTokens + contextTokens + 500;
  }

  private async handleListPackages(status?: BatchJobStatus, packageType?: PackageType) {
    const jobs = await this.batchManager.listPackages({ status, packageType });
    this.context.postMessage({
      command: 'packageList',
      packages: jobs.map((job) => this.mapPackage(job)),
    });
  }

  private async handleGetPackagePreview(packageId: string) {
    const job = await this.batchManager.getPackagePreview(packageId);
    if (!job) {
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: 'Package not found.',
      });
      return;
    }

    const promptPayload = job.promptPayload as {
      package?: {
        goal: string;
        contextFiles: Array<{ path: string; content: string }>;
        repoArchitecture: string;
        dependencies: Record<string, string>;
        outputInstruction: PackageType;
      };
      assembledPrompt?: string;
    };

    const pkg = promptPayload.package;
    const contextFiles = pkg?.contextFiles ?? [];
    this.context.postMessage({
      command: 'packagePreview',
      package: {
        ...this.mapPackage(job),
        contextFiles: contextFiles.map((file) => ({
          path: file.path,
          tokenCount: Math.ceil((file.content?.length ?? 0) / 4),
          content: file.content,
        })),
        repoArchitecture: pkg?.repoArchitecture ?? '',
        dependencies: pkg?.dependencies ?? {},
        outputInstruction: pkg?.outputInstruction ?? job.packageType,
        rawPrompt: promptPayload.assembledPrompt ?? '',
      },
    });
  }

  private async handleViewBatchStatus(packageId: string) {
    const completion = await this.batchManager.pollBatchJob(packageId);
    this.context.postMessage({
      command: 'batchStatus',
      batchJobId: completion.batchJobId,
      status: completion.status === 'submitted' ? 'pending' : completion.status,
      estimatedCompletionTime:
        completion.status === 'processing' || completion.status === 'submitted'
          ? 'Batch processing in progress.'
          : undefined,
    });
    await this.handleListPackages();
  }

  /**
   * Gets or creates the compiled graph.
   */
  private async getGraph() {
    if (!this.compiledGraph) {
      const onProgress = (message: string) => {
        this.context.postMessage({
          command: 'chatProgress',
          text: message,
        });
      };
      this.compiledGraph = await createHitlChatGraph(
        this.extensionContext,
        this.pgPool,
        this.batchManager,
        onProgress
      );
    }
    return this.compiledGraph;
  }

  /**
   * Runs the HITL chat graph with the given input.
   */
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

      // Save user message
      const userMessage: ThreadMessage = {
        id: randomUUID(),
        role: 'user',
        content: input,
        timestamp: Date.now(),
      };
      await this.messageRepository.saveMessage(this.activeThreadId, userMessage);

      // Load message history
      const messages = await this.messageRepository.getMessages(this.activeThreadId);
      const history = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      // Get the compiled graph
      const graph = await this.getGraph();
      const config = createGraphConfig(this.activeThreadId);

      // Invoke the graph
      const result = await graph.invoke(
        {
          userQuery: input,
          threadId: this.activeThreadId,
          messages: history,
        },
        config
      );

      // Handle the result (may be an interrupt or final response)
      await this.handleGraphResult(result);
    } catch (error) {
      logger.both.error('ChatController: Error running chat graph:', error);
      this.context.postMessage({
        command: 'chatResponse',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  /**
   * Resumes the graph with user-provided data after an interrupt.
   */
  private async resumeGraph(resumeValue: unknown) {
    try {
      if (!this.activeThreadId) {
        logger.both.warn('ChatController: No active thread for resume');
        return;
      }

      const graph = await this.getGraph();
      const config = createGraphConfig(this.activeThreadId);

      // Resume the graph with the user's input
      const result = await graph.invoke(new Command({ resume: resumeValue }), config);

      // Handle the result
      await this.handleGraphResult(result);
    } catch (error) {
      logger.both.error('ChatController: Error resuming graph:', error);
      this.context.postMessage({
        command: 'chatResponse',
        text: `Error resuming: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  /**
   * Handles the result from graph.invoke(), detecting interrupts vs final responses.
   */
  private async handleGraphResult(result: any) {
    // Check if this is an interrupt
    // LangGraph returns interrupt data in a specific format
    // The exact format depends on how interrupt() was called
    if (this.isInterrupt(result)) {
      await this.handleInterrupt(result);
      return;
    }

    // Final response - save and post to webview
    await this.handleFinalResponse(result);
  }

  /**
   * Checks if the result is an interrupt.
   */
  private isInterrupt(result: any): boolean {
    // LangGraph may signal interrupts in different ways depending on version
    // Check for common interrupt indicators
    return (
      result?.__interrupt__ !== undefined ||
      result?.type === 'goal_review' ||
      result?.type === 'send_review' ||
      result?.type === 'batch_pending' ||
      result?.type === 'edit_review' ||
      result?.type === 'code_review'
    );
  }

  /**
   * Handles an interrupt by dispatching the appropriate UI card.
   */
  private async handleInterrupt(result: any) {
    const interruptData = (result.__interrupt__ || result) as InterruptPayload;

    logger.both.info(`ChatController: Handling interrupt of type: ${interruptData.type}`);

    switch (interruptData.type) {
      case 'goal_review': {
        const data = interruptData as GoalReviewInterrupt;
        this.context.postMessage({
          command: 'goalReview',
          goal: data.goal,
          contextFiles: data.contextFiles,
          dependencies: data.dependencies,
        });
        break;
      }

      case 'send_review': {
        const data = interruptData as SendReviewInterrupt;
        const packageId = this.activeThreadId
          ? await this.batchManager.createDraftPackage(
              this.activeThreadId,
              data.package,
              data.estimatedTokens
            )
          : undefined;
        this.context.postMessage({
          command: 'packageReview',
          packageId,
          package: data.package,
          estimatedTokens: data.estimatedTokens,
        });
        this.context.postMessage({
          command: 'packageReady',
          packageId,
          package: data.package,
          estimatedTokens: data.estimatedTokens,
        });
        await this.handleListPackages();
        break;
      }

      case 'batch_pending': {
        const data = interruptData as BatchPendingInterrupt;
        this.batchPoller.startPolling(data.batchJobId, this.handleBatchTerminalState);
        this.context.postMessage({
          command: 'batchStatus',
          batchJobId: data.batchJobId,
          status: 'pending',
          estimatedCompletionTime: data.estimatedCompletionTime,
        });
        break;
      }

      case 'edit_review': {
        const data = interruptData as EditReviewInterrupt;
        this.context.postMessage({
          command: 'editReview',
          edits: data.edits,
        });
        break;
      }

      case 'code_review': {
        const data = interruptData as CodeReviewInterrupt;
        this.context.postMessage({
          command: 'codeReview',
          appliedFiles: data.appliedFiles,
        });
        break;
      }

      default:
        logger.both.warn(`ChatController: Unknown interrupt type: ${(interruptData as any).type}`);
    }
  }

  /**
   * Handles the final response from the graph.
   */
  private async handleFinalResponse(result: any) {
    if (!this.activeThreadId) {
      return;
    }

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

    // Add file edit tool calls if present
    if (result.fileEdits && result.fileEdits.length > 0) {
      const approvedEdits = result.fileEdits.filter((e: any) => e.approved);
      for (const edit of approvedEdits) {
        toolCalls.push({
          name: `file_${edit.action}`,
          args: {
            path: edit.filePath,
          },
        });
      }
    }

    const assistantMessage: ThreadMessage = {
      id: randomUUID(),
      role: 'assistant',
      content: result.aiResponse || 'Workflow completed.',
      timestamp: Date.now(),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      tokens:
        typeof result.inputTokens === 'number' || typeof result.outputTokens === 'number'
          ? {
              input: result.inputTokens ?? 0,
              output: result.outputTokens ?? 0,
              total: result.tokensUsed ?? (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
            }
          : undefined,
      contextFiles: Array.isArray(result.retrievedContext)
        ? ([
            ...new Set(
              (result.retrievedContext as Array<{ filePath?: string }>)
                .map((ctx) => ctx.filePath)
                .filter((filePath): filePath is string => Boolean(filePath))
            ),
          ] as string[])
        : undefined,
    };

    await this.messageRepository.saveMessage(this.activeThreadId, assistantMessage);
    await this.postThreads();

    this.context.postMessage({
      command: 'chatResponse',
      text: result.aiResponse || 'Workflow completed.',
      toolCalls: assistantMessage.toolCalls,
      tokensUsed: result.tokensUsed,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      workflowPhase: result.workflowPhase,
    });
  }

  private readonly handleBatchTerminalState = async (
    completion: BatchCompletionResult
  ): Promise<void> => {
    if (completion.status === 'completed') {
      this.context.postMessage({
        command: 'batchStatus',
        batchJobId: completion.batchJobId,
        status: 'completed',
      });
      await this.handleListPackages();

      await this.resumeGraph({
        completed: true,
        responseContent: completion.responseText ?? '',
      } as BatchPendingResume);
      return;
    }

    if (completion.status === 'cancelled') {
      this.context.postMessage({
        command: 'batchStatus',
        batchJobId: completion.batchJobId,
        status: 'cancelled',
      });
      await this.handleListPackages();
      return;
    }

    const message =
      completion.errorMessage ??
      `Batch ended with status ${completion.status}. Open .repomix/incoming for raw output.`;

    this.context.postMessage({
      command: 'batchStatus',
      batchJobId: completion.batchJobId,
      status: 'failed',
    });
    await this.handleListPackages();

    await this.resumeGraph({
      completed: false,
      error: message,
    } as BatchPendingResume);
  };

  // --- Message Queue Methods (PRD 007) ---

  /**
   * Enqueues a message for processing.
   */
  private async enqueueMessage(text: string, priority: 'normal' | 'force'): Promise<void> {
    if (!this.activeThreadId) {
      const thread = await this.threadRepository.createThread(this.repoId);
      this.activeThreadId = thread.id;
      await this.extensionContext.workspaceState.update(
        'repomix.chat.activeThreadId',
        thread.id
      );
    }

    const entry = this.messageQueue.enqueue(this.activeThreadId, text, priority);
    logger.both.info(`ChatController: Enqueued message ${entry.id} with priority ${priority}`);

    // Save user message to history immediately
    const userMessage: ThreadMessage = {
      id: randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    await this.messageRepository.saveMessage(this.activeThreadId, userMessage);

    // Start processing if not already running
    this.processQueue();
  }

  /**
   * Processes the queue sequentially.
   */
  private async processQueue(): Promise<void> {
    if (this.queueProcessing) {
      return;
    }

    this.queueProcessing = true;

    try {
      while (true) {
        const entry = this.messageQueue.dequeue();
        if (!entry) {
          break; // Queue is empty
        }

        // Initialize graph executor if needed
        if (!this.graphExecutor) {
          this.graphExecutor = new GraphExecutor(
            this.extensionContext,
            this.pgPool,
            async () => {
              const graph = await this.getGraph();
              return graph;
            }
          );
        }

        // Execute the message
        const result = await this.graphExecutor.execute(entry);

        // Mark as complete/failed
        this.messageQueue.complete(entry.id, result.success, result.error);

        if (result.wasCancelled) {
          logger.both.info('ChatController: Queue processing cancelled by user');
          break;
        }

        if (!result.success) {
          logger.both.error(`ChatController: Message ${entry.id} failed: ${result.error}`);
          // Continue to next message even if this one failed
        }
      }
    } finally {
      this.queueProcessing = false;
    }
  }

  /**
   * Stops the currently executing message.
   */
  private stopCurrentExecution(): void {
    if (this.graphExecutor) {
      this.graphExecutor.stop();
      logger.both.info('ChatController: Stopped current execution');
    } else {
      logger.both.warn('ChatController: No active execution to stop');
    }
  }

  /**
   * Cancels a queued message.
   */
  private cancelQueuedMessage(entryId: string): void {
    const cancelled = this.messageQueue.cancel(entryId);
    if (cancelled) {
      logger.both.info(`ChatController: Cancelled queued message ${entryId}`);
    } else {
      logger.both.warn(`ChatController: Failed to cancel message ${entryId}`);
    }
  }

  /**
   * Clears all queued messages.
   */
  private clearQueue(): void {
    this.messageQueue.cancelAll();
    logger.both.info('ChatController: Cleared message queue');
  }

  /**
   * Posts the current queue status to the webview.
   */
  private async postQueueStatus(): Promise<void> {
    const status = this.messageQueue.getStatus();
    this.context.postMessage({
      command: 'queueStatus',
      queueLength: status.queueLength,
      currentlyProcessing: status.currentlyProcessing,
      entries: status.entries,
    });
  }

  dispose(): void {
    // Save queue state before disposal (PRD 007)
    this.saveQueueState();
    
    if (this.graphExecutor) {
      this.graphExecutor.stop();
    }
    
    this.messageQueue.removeAllListeners();
    this.batchPoller.dispose();
    super.dispose();
  }

  /**
   * Saves the queue state for persistence across restarts.
   * TODO: Implement PostgreSQL persistence
   */
  private async saveQueueState(): Promise<void> {
    const serialized = this.messageQueue.serialize();
    await this.extensionContext.workspaceState.update(
      'repomix.chat.queueState',
      JSON.stringify(serialized)
    );
    logger.both.debug('ChatController: Saved queue state');
  }

  /**
   * Restores the queue state from persistence.
   * TODO: Implement PostgreSQL persistence
   */
  private async restoreQueueState(): Promise<void> {
    const saved = await this.extensionContext.workspaceState.get<string>(
      'repomix.chat.queueState'
    );
    
    if (saved) {
      try {
        const serialized = JSON.parse(saved);
        this.messageQueue.deserialize(serialized);
        logger.both.info('ChatController: Restored queue state');
        
        // Resume processing if there are queued messages
        const status = this.messageQueue.getStatus();
        if (status.queueLength > 0) {
          this.processQueue();
        }
      } catch (error) {
        logger.both.error('ChatController: Failed to restore queue state', error);
      }
    }
  }
}
