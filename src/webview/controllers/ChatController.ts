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
import { ArchitectureRepository } from '../../chat/db/architectureRepository.js';
import { executeArchitectureGeneration } from '../../chat/architecture/architectureGraph.js';
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
import { MessageQueue } from '../../chat/queue/index.js';
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

type SnapshotFileEdit = {
  filePath: string;
  approved: boolean;
};

const THREAD_HISTORY_PAGE_SIZE = 50;

/**
 * ChatController handles chat messages from the webview and executes the HITL chat graph.
 */
export class ChatController extends BaseController {
  private readonly threadRepository: ThreadRepository;
  private readonly messageRepository: MessageRepository;
  private readonly architectureRepository: ArchitectureRepository;
  private readonly planService: PlanService;
  private readonly batchManager: BatchManager;
  private readonly batchPoller: BatchPoller;
  private readonly pgPool: Pool;
  private readonly ready: Promise<void>;
  private _memoryManager: MemoryManager | null = null;
  private activeThreadId: string | null = null;
  private repoId: string = '';
  private compiledGraph: Awaited<ReturnType<typeof createHitlChatGraph>> | null = null;
  private messageQueue: MessageQueue;
  private queueProcessing: boolean = false;
  private currentAbortController: AbortController | null = null;
  private initError: string | null = null;

  constructor(
    context: IWebviewContext,
    private readonly extensionContext: vscode.ExtensionContext,
    pgPool: Pool,
    sharedBatchManager?: BatchManager,
    sharedBatchPoller?: BatchPoller
  ) {
    super(context);
    this.pgPool = pgPool;
    this.threadRepository = new ThreadRepository(pgPool);
    this.messageRepository = new MessageRepository(pgPool);
    this.architectureRepository = new ArchitectureRepository(pgPool);
    this.planService = new PlanService(extensionContext);
    this.batchManager = sharedBatchManager ?? new BatchManager(pgPool, extensionContext);
    this.batchPoller = sharedBatchPoller ?? new BatchPoller(this.batchManager, {
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

    if (this.initError) {
      this.context.postMessage({
        command: 'chatDisabled',
        message: `Database initialization failed: ${this.initError}. Please check your PostgreSQL connection in the Settings tab.`,
      });
      return;
    }

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
    // === Settings & secret commands: do NOT require database initialization ===
    // This ensures the Settings tab is always responsive even when DB is unreachable,
    // so the user can configure or fix the connection string.
    if (message.command === 'getChatSettings') {
      await this.handleGetChatSettings();
      return true;
    }
    if (message.command === 'setChatSetting') {
      await this.handleSetChatSetting(message.key, message.value);
      return true;
    }
    if (message.command === 'saveSecret') {
      await this.handleSaveSecret(message.key, message.value);
      return true;
    }
    if (message.command === 'checkSecret') {
      await this.handleCheckSecret(message.key);
      return true;
    }
    if (message.command === 'testPostgresConnection') {
      await this.handleTestPostgresConnection();
      return true;
    }
    if (message.command === 'runMigrations') {
      await this.handleRunMigrations();
      return true;
    }
    if (message.command === 'refreshArchitectureNow') {
      await this.handleRefreshArchitectureNow();
      return true;
    }

    // === All other commands require database initialization ===
    await this.ready;

    // If initialization failed, inform the user instead of silently hanging
    if (this.initError) {
      this.context.postMessage({
        command: 'chatResponse',
        text: `Database is not available: ${this.initError}. Please configure your PostgreSQL connection in the Settings tab.`,
      });
      return true;
    }

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
    if (message.command === 'searchMemories') {
      await this.handleSearchMemories(message.scope, message.query);
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
    if (message.command === 'applyEdit') {
      await this.handleApplyEdit(message.filePath);
      return true;
    }
    if (message.command === 'skipEdit') {
      await this.handleSkipEdit(message.filePath);
      return true;
    }
    if (message.command === 'viewEditDiff') {
      await this.handleViewEditDiff(message.filePath);
      return true;
    }
    if (message.command === 'applyAllEdits') {
      await this.handleApplyAllEdits(message.approvedEdits);
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
      try {
        await this.batchManager.approvePackage(message.packageId);
      } catch (error) {
        logger.both.error('ChatController: Failed to approve package', error);
        this.context.postMessage({
          command: 'showNotification',
          type: 'error',
          message: `Failed to approve package: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'unapprovePackage') {
      try {
        await this.batchManager.unapprovePackage(message.packageId);
      } catch (error) {
        logger.both.error('ChatController: Failed to unapprove package', error);
        this.context.postMessage({
          command: 'showNotification',
          type: 'error',
          message: `Failed to unapprove package: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'sendPackage') {
      try {
        const result = await this.batchManager.submitExistingPackage(message.packageId);
        this.batchPoller.startPolling(result.batchJobId, this.handleBatchTerminalState);
      } catch (error) {
        logger.both.error('ChatController: Failed to send package', error);
        this.context.postMessage({
          command: 'showNotification',
          type: 'error',
          message: `Failed to send package: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'sendAllApproved') {
      try {
        const result = await this.batchManager.sendAllApproved();
        for (const batchJobId of result.submitted) {
          this.batchPoller.startPolling(batchJobId, this.handleBatchTerminalState);
        }
        this.context.postMessage({
          command: 'packagesBulkSendResult',
          submitted: result.submitted,
          failed: result.failed,
          skipped: result.skipped,
        });
      } catch (error) {
        logger.both.error('ChatController: Failed to send all approved packages', error);
        this.context.postMessage({
          command: 'showNotification',
          type: 'error',
          message: `Failed to send approved packages: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'retryPackage') {
      try {
        const result = await this.batchManager.submitExistingPackage(message.packageId);
        this.batchPoller.startPolling(result.batchJobId, this.handleBatchTerminalState);
      } catch (error) {
        logger.both.error('ChatController: Failed to retry package', error);
        this.context.postMessage({
          command: 'showNotification',
          type: 'error',
          message: `Failed to retry package: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'cancelBatch') {
      try {
        await this.batchManager.cancelBatch(message.packageId);
      } catch (error) {
        logger.both.error('ChatController: Failed to cancel batch', error);
        this.context.postMessage({
          command: 'showNotification',
          type: 'error',
          message: `Failed to cancel batch: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'deletePackage') {
      try {
        await this.batchManager.deletePackage(message.packageId);
      } catch (error) {
        logger.both.error('ChatController: Failed to delete package', error);
        this.context.postMessage({
          command: 'showNotification',
          type: 'error',
          message: `Failed to delete package: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      await this.handleListPackages();
      return true;
    }
    if (message.command === 'updatePackageDraft') {
      try {
        await this.batchManager.updateDraftPackage(message.packageId, {
          goal: message.goal,
          outputInstruction: message.outputInstruction,
        });
        await this.handleGetPackagePreview(message.packageId);
      } catch (error) {
        logger.both.error('ChatController: Failed to update package draft', error);
        this.context.postMessage({
          command: 'showNotification',
          type: 'error',
          message: `Failed to update package: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
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

    // Chat Settings handlers are handled above (before await this.ready)
    // to ensure the Settings tab works even when DB is unreachable.

    // Chat History handlers (PRD 010)
    if (message.command === 'searchThreads') {
      await this.handleSearchThreads(message.query, message.showArchived);
      return true;
    }
    if (message.command === 'showArchivedThreads') {
      // Just acknowledge, state is tracked in webview
      return true;
    }
    if (message.command === 'archiveThread') {
      await this.threadRepository.archiveThread(message.threadId);
      await this.postThreads();
      return true;
    }
    if (message.command === 'unarchiveThread') {
      await this.threadRepository.unarchiveThread(message.threadId);
      await this.postThreads();
      return true;
    }

    return false;
  }

  private async initializeService(): Promise<void> {
    // Step 1: Get repo identity (local, no DB needed)
    try {
      this.repoId = await getRepoId(getCwd());
    } catch (error) {
      logger.both.error('ChatController: Failed to get repo ID:', error);
      this.initError = `Failed to determine repository identity: ${error instanceof Error ? error.message : String(error)}`;
      return;
    }

    // Step 2: Initialize threads from DB with a timeout to prevent blocking
    try {
      const INIT_TIMEOUT_MS = 10_000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Database connection timed out after 10 seconds')),
          INIT_TIMEOUT_MS
        )
      );

      await Promise.race([this._initializeThreads(), timeoutPromise]);
    } catch (error) {
      logger.both.error('ChatController: Database initialization failed:', error);
      this.initError = error instanceof Error ? error.message : String(error);
    }
  }

  /**
   * Performs the DB-dependent part of initialization (thread setup).
   * Separated so it can be wrapped in a timeout.
   */
  private async _initializeThreads(): Promise<void> {
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

  private getMemoryManager(): MemoryManager {
    if (!this._memoryManager) {
      this._memoryManager = new MemoryManager(this.pgPool);
    }
    return this._memoryManager;
  }

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

      const memoryManager = this.getMemoryManager();
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

  private async handleSearchMemories(scope: MemoryScope, query: string): Promise<void> {
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

      const memoryManager = this.getMemoryManager();
      const memories = await memoryManager.search(scope, scopeId, query);

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
      logger.both.error('ChatController: Failed to search memories', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to search memories: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async handleCreateMemory(scope: MemoryScope, key: string, value: string): Promise<void> {
    try {
      const scopeId = scope === 'session' ? this.activeThreadId ?? '' : this.repoId;
      if (!scopeId) {
        throw new Error('No active context for memory creation');
      }

      const memoryManager = this.getMemoryManager();
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
      const memoryManager = this.getMemoryManager();
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
      const memoryManager = this.getMemoryManager();
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
    
    // Enrich threads with message counts, token counts, and batch status
    const enrichedThreads = await Promise.all(
      threads.map(async (thread) => {
        const messageCount = await this.messageRepository.getMessageCount(thread.id);
        const hasPendingBatch = await this.batchManager.hasPendingBatches(thread.id);
        
        return {
          id: thread.id,
          title: thread.title,
          updatedAt: thread.updatedAt,
          createdAt: thread.createdAt,
          totalTokens: thread.totalTokens || 0,
          preview: thread.preview ?? '',
          planPath: this.planService.getPlanPath(thread.id),
          messageCount,
          tokenCount: thread.totalTokens || 0,
          hasPendingBatch,
          isArchived: false, // getThreads only returns active threads
        };
      })
    );
    
    this.context.postMessage({
      command: 'threadList',
      activeThreadId: this.activeThreadId,
      threads: enrichedThreads,
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

  private getSnapshotFileEdits(state: { values?: unknown }): SnapshotFileEdit[] {
    const values = (state.values ?? {}) as { fileEdits?: SnapshotFileEdit[] };
    return Array.isArray(values.fileEdits) ? values.fileEdits : [];
  }

  /**
   * Handles individual edit application from webview (H4 fix: resume with this edit
   * plus all previously-approved edits, so we don't lose other approvals).
   */
  private async handleApplyEdit(filePath: string): Promise<void> {
    try {
      if (!this.activeThreadId) {
        logger.both.warn('ChatController: No active thread for applyEdit');
        return;
      }

      // Get current state to find existing approvals
      const graph = await this.getGraph();
      const config = createGraphConfig(this.activeThreadId);
      const state = await graph.getState(config);
      const fileEdits = this.getSnapshotFileEdits(state);
      const editToApply = fileEdits.find((edit) => edit.filePath === filePath);
      if (!editToApply) {
        logger.both.warn(`ChatController: Edit not found: ${filePath}`);
        return;
      }

      // Collect already-approved edits AND the newly approved one
      const approvedEdits = new Set(
        fileEdits.filter((edit) => edit.approved).map((edit) => edit.filePath)
      );
      approvedEdits.add(filePath);

      await this.resumeGraph({ approvedEdits: Array.from(approvedEdits) } as EditReviewResume);
    } catch (error) {
      logger.both.error('ChatController: Error applying edit:', error);
      this.context.postMessage({
        command: 'chatResponse',
        text: `Error applying edit: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  /**
   * Handles individual edit skip from webview.
   * Updates UI state to mark edit as skipped (does not resume graph yet).
   */
  private async handleSkipEdit(filePath: string): Promise<void> {
    try {
      if (!this.activeThreadId) {
        logger.both.warn('ChatController: No active thread for skipEdit');
        return;
      }

      // Mark as skipped in UI state
      // The graph will be resumed when user clicks "Apply All" or "Skip All"
      this.context.postMessage({
        command: 'editReviewAck',
        action: 'skip',
        filePath,
        approved: false,
      });
    } catch (error) {
      logger.both.error('ChatController: Error skipping edit:', error);
      this.context.postMessage({
        command: 'chatResponse',
        text: `Error skipping edit: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  /**
   * Opens diff view for a file edit (H2 fix: use git diff instead of plain open).
   */
  private async handleViewEditDiff(filePath: string): Promise<void> {
    try {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        logger.both.warn('ChatController: No workspace folder available');
        return;
      }

      const fullPath = path.resolve(workspaceRoot, filePath);
      const uri = vscode.Uri.file(fullPath);

      // Try to open git diff view first (shows working changes vs HEAD)
      try {
        await vscode.commands.executeCommand('git.openChange', uri);
      } catch {
        // Fallback: open the file normally if git diff is unavailable
        await vscode.commands.executeCommand('vscode.open', uri);
      }
    } catch (error) {
      logger.both.error('ChatController: Error opening diff:', error);
      this.context.postMessage({
        command: 'chatResponse',
        text: `Error opening diff: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  /**
   * Applies all pending edits at once (H3 fix: approve ALL edits, not just already-approved).
   */
  private async handleApplyAllEdits(approvedEditsFromWebview?: string[]): Promise<void> {
    try {
      if (!this.activeThreadId) {
        logger.both.warn('ChatController: No active thread for applyAllEdits');
        return;
      }

      // Get current state to get ALL edits
      const graph = await this.getGraph();
      const config = createGraphConfig(this.activeThreadId);
      const state = await graph.getState(config);
      const fileEdits = this.getSnapshotFileEdits(state);

      // Use webview selection when provided, otherwise approve all pending edits.
      const allEditPaths =
        Array.isArray(approvedEditsFromWebview) && approvedEditsFromWebview.length > 0
          ? approvedEditsFromWebview
          : fileEdits.map((edit) => edit.filePath);

      if (allEditPaths.length === 0) {
        logger.both.warn('ChatController: No edits found to apply');
        this.context.postMessage({
          command: 'chatResponse',
          text: 'No edits found to apply.',
        });
        return;
      }

      await this.resumeGraph({ approvedEdits: allEditPaths } as EditReviewResume);
    } catch (error) {
      logger.both.error('ChatController: Error applying all edits:', error);
      this.context.postMessage({
        command: 'chatResponse',
        text: `Error applying all edits: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
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

  // --- Chat Settings Handlers (PRD 010) ---

  private async handleGetChatSettings(): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('repomix.chat');
      
      // Get architecture status (only if DB is initialized and repoId is available)
      let architectureLastGenerated: number | undefined;
      let architectureStatus: 'fresh' | 'stale' | 'missing' = 'missing';
      
      if (this.repoId && !this.initError) {
        try {
          const archDoc = await this.architectureRepository.getArchitectureByRepoId(this.repoId);
          if (archDoc) {
            architectureLastGenerated = archDoc.generatedAt;
            const refreshHours = config.get<number>('architectureRefreshHours', 24);
            const hoursSinceGeneration = (Date.now() - archDoc.generatedAt) / (1000 * 60 * 60);
            
            if (hoursSinceGeneration < refreshHours) {
              architectureStatus = 'fresh';
            } else {
              architectureStatus = 'stale';
            }
          }
        } catch (archError) {
          // DB may be unavailable — architecture status will show as 'missing'
          logger.both.warn('ChatController: Could not fetch architecture status', archError);
        }
      }

      this.context.postMessage({
        command: 'chatSettingsResult',
        settings: {
          postgresConnectionString: undefined, // Don't send connection string back
          planningModel: config.get<'gemini-2.5-flash' | 'gemini-2.5-flash-lite'>('planningModel', 'gemini-2.5-flash'),
          planningRpm: config.get<number>('planningRpm', 60),
          batchModel: config.get<string>('batchModel', 'claude-opus-4-20250514'),
          batchMaxTokens: config.get<number>('batchMaxTokens', 16384),
          batchThinkingBudget: config.get<number>('batchThinkingBudget', 10000),
          batchPollIntervalSeconds: config.get<number>('batchPollIntervalSeconds', 60),
          contextThresholdPercent: config.get<number>('contextThresholdPercent', 80),
          maxRecentMessages: config.get<number>('maxRecentMessages', 10),
          fileCompressionLevel: config.get<'auto' | 'full' | 'skeleton' | 'summary'>('fileCompressionLevel', 'auto'),
          editMode: config.get<'full' | 'search_replace' | 'hybrid'>('editMode', 'hybrid'),
          hybridThresholdLines: config.get<number>('hybridThresholdLines', 300),
          fuzzyMatchThreshold: config.get<number>('fuzzyMatchThreshold', 0.8),
          architectureRefreshHours: config.get<number>('architectureRefreshHours', 24),
          architectureLastGenerated,
          architectureStatus,
        },
      });
    } catch (error) {
      logger.both.error('ChatController: Failed to get chat settings', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to load settings: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async handleSetChatSetting(key: string, value: any): Promise<void> {
    try {
      const config = vscode.workspace.getConfiguration('repomix.chat');
      await config.update(key, value, vscode.ConfigurationTarget.Global);
      
      // Reload settings to confirm
      await this.handleGetChatSettings();
    } catch (error) {
      logger.both.error('ChatController: Failed to set chat setting', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to save setting: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async handleSaveSecret(key: string, value: string): Promise<void> {
    try {
      if (!value.trim()) {
        // Clear the secret
        await this.extensionContext.secrets.delete(key);
      } else {
        await this.extensionContext.secrets.store(key, value);
      }
      
      this.context.postMessage({
        command: 'secretStatus',
        key,
        exists: !!value.trim(),
      });
    } catch (error) {
      logger.both.error('ChatController: Failed to save secret', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to save secret: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async handleCheckSecret(key: string): Promise<void> {
    try {
      const exists = !!(await this.extensionContext.secrets.get(key));
      this.context.postMessage({
        command: 'secretStatus',
        key,
        exists,
      });
    } catch (error) {
      logger.both.error('ChatController: Failed to check secret', error);
    }
  }

  private async handleTestPostgresConnection(): Promise<void> {
    try {
      const connectionString = await this.extensionContext.secrets.get('postgresConnectionString');
      
      if (!connectionString) {
        this.context.postMessage({
          command: 'postgresConnectionResult',
          success: false,
          error: 'PostgreSQL connection string not configured',
        });
        return;
      }

      // Test the connection string directly using testConnectionString
      const { testConnectionString } = await import('../../chat/db/postgresClient.js');
      const result = await testConnectionString(connectionString);
      
      this.context.postMessage({
        command: 'postgresConnectionResult',
        success: result.success,
        error: result.success ? undefined : result.message,
      });
    } catch (error) {
      logger.both.error('ChatController: Failed to test PostgreSQL connection', error);
      this.context.postMessage({
        command: 'postgresConnectionResult',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleRunMigrations(): Promise<void> {
    try {
      const connectionString = await this.extensionContext.secrets.get('postgresConnectionString');
      
      if (!connectionString) {
        this.context.postMessage({
          command: 'migrationsComplete',
          success: false,
          error: 'PostgreSQL connection string not configured',
        });
        return;
      }

      // Ensure pool is initialized and migrations are verified
      const { initPool, verifyMigration } = await import('../../chat/db/postgresClient.js');
      await initPool(connectionString);
      const migrationResult = await verifyMigration();
      
      this.context.postMessage({
        command: 'migrationsComplete',
        success: migrationResult.success,
        error: migrationResult.success ? undefined : migrationResult.message,
      });
    } catch (error) {
      logger.both.error('ChatController: Failed to run migrations', error);
      this.context.postMessage({
        command: 'migrationsComplete',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleRefreshArchitectureNow(): Promise<void> {
    try {
      // Execute architecture generation
      await executeArchitectureGeneration(
        getCwd(),
        this.repoId,
        {
          pgPool: this.pgPool,
          secrets: this.extensionContext.secrets,
        }
      );

      // Post updated status
      await this.handleGetChatSettings();
    } catch (error) {
      logger.both.error('ChatController: Failed to refresh architecture', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to refresh architecture: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // --- Chat History Handlers (PRD 010) ---

  private async handleSearchThreads(query: string, showArchived: boolean = false): Promise<void> {
    try {
      const threads = await this.threadRepository.searchThreads(this.repoId, query, showArchived);
      
      const threadSummaries = await Promise.all(
        threads.map(async (thread) => {
          const messageCount = await this.messageRepository.getMessageCount(thread.id);
          const tokenCount = thread.totalTokens || 0;
          const hasPendingBatch = await this.batchManager.hasPendingBatches(thread.id);
          
          // Get preview from first message
          const messages = await this.messageRepository.getMessagesPage(thread.id, { limit: 1 });
          const preview = messages.messages[0]?.content.slice(0, 200) ?? thread.preview;
          
          return {
            id: thread.id,
            title: thread.title,
            updatedAt: thread.updatedAt,
            createdAt: thread.createdAt,
            messageCount,
            tokenCount,
            preview,
            hasPendingBatch,
            isArchived: thread.isArchived,
          };
        })
      );
      
      this.context.postMessage({
        command: 'threadsSearchResult',
        threads: threadSummaries,
        total: threadSummaries.length,
      });
    } catch (error) {
      logger.both.error('ChatController: Failed to search threads', error);
      this.context.postMessage({
        command: 'showNotification',
        type: 'error',
        message: `Failed to search threads: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
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
      
      // Get the PostgreSQL connection string from secrets
      const connectionString = await this.extensionContext.secrets.get('postgresConnectionString') || '';
      
      this.compiledGraph = await createHitlChatGraph(
        this.extensionContext,
        this.pgPool,
        this.batchManager,
        onProgress,
        connectionString
      );
    }
    return this.compiledGraph;
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
      await this.handleGraphResult(result, config);
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
  private async handleGraphResult(result: any, config: { configurable: { thread_id: string } }) {
    // Check if this is an interrupt using LangGraph v1.x API
    // When interrupt() is called in a node, graph.invoke() returns the partial state,
    // and the interrupt data is accessible via graph.getState(config)
    const interruptPayload = await this.getInterruptPayload(config);
    
    if (interruptPayload) {
      await this.handleInterrupt(interruptPayload);
      return;
    }

    // Final response - save and post to webview
    await this.handleFinalResponse(result);
  }

  /**
   * Gets the interrupt payload from the graph state snapshot.
   * Returns null if no interrupt is pending.
   */
  private async getInterruptPayload(
    config: { configurable: { thread_id: string } }
  ): Promise<InterruptPayload | null> {
    try {
      const graph = await this.getGraph();
      const snapshot = await graph.getState(config);
      
      // Check if there are any tasks with interrupts
      if (!snapshot.tasks || snapshot.tasks.length === 0) {
        return null;
      }
      
      const task = snapshot.tasks[0];
      if (!task.interrupts || task.interrupts.length === 0) {
        return null;
      }
      
      // Get the first interrupt's value
      const interruptValue = task.interrupts[0].value as InterruptPayload;
      return interruptValue || null;
    } catch (error) {
      logger.both.error('ChatController: Failed to get interrupt payload:', error);
      return null;
    }
  }

  /**
   * Checks if the result is an interrupt.
   * @deprecated Use getInterruptPayload instead for LangGraph v1.x
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
    try {
      if (completion.status === 'completed') {
        this.context.postMessage({
          command: 'batchStatus',
          batchJobId: completion.batchJobId,
          status: 'completed',
        });
        await this.handleListPackages();

        // PRD 005: Notify user via VS Code notification
        vscode.window.showInformationMessage(
          `✅ Batch job ${completion.batchJobId.slice(0, 8)}… completed successfully.`
        );

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

        vscode.window.showWarningMessage(
          `Batch job ${completion.batchJobId.slice(0, 8)}… was cancelled.`
        );

        // Resume the graph with an error to prevent it from being stuck
        await this.resumeGraph({
          completed: false,
          error: 'Batch job was cancelled by user.',
        } as BatchPendingResume);
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

      vscode.window.showErrorMessage(
        `Batch job ${completion.batchJobId.slice(0, 8)}… failed: ${message}`
      );

      await this.resumeGraph({
        completed: false,
        error: message,
      } as BatchPendingResume);
    } catch (error) {
      // Guard against webview disposal or other errors during callback
      logger.both.error(
        `ChatController: Error handling batch terminal state for ${completion.batchJobId}`,
        error
      );
    }
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

        try {
          await this.executeQueueEntry(entry);
          this.messageQueue.complete(entry.id, true);
        } catch (error) {
          const isAbort = error instanceof Error && error.name === 'AbortError';
          this.messageQueue.complete(
            entry.id,
            false,
            isAbort ? 'Cancelled by user' : (error instanceof Error ? error.message : String(error))
          );

          if (isAbort) {
            logger.both.info(`ChatController: Execution cancelled for entry ${entry.id}, continuing queue`);
            // Do NOT break — PRD requires queue to continue with next message
            continue;
          }

          logger.both.error(`ChatController: Message ${entry.id} failed: ${error instanceof Error ? error.message : error}`);
          // Continue to next message even if this one failed
        }
      }
    } finally {
      this.queueProcessing = false;
    }
  }

  /**
   * Executes a single queue entry through the graph with abort support.
   */
  private async executeQueueEntry(entry: QueueEntry): Promise<void> {
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    try {
      if (signal.aborted) {
        const err = new Error('Cancelled before start');
        err.name = 'AbortError';
        throw err;
      }

      const graph = await this.getGraph();

      // Persist right before processing so later queued messages are not visible too early.
      const userMessage: ThreadMessage = {
        id: randomUUID(),
        role: 'user',
        content: entry.text,
        timestamp: Date.now(),
      };
      await this.messageRepository.saveMessage(entry.threadId, userMessage);

      // Load message history for the thread
      const messages = await this.messageRepository.getMessages(entry.threadId);
      const history = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      const config = {
        configurable: { thread_id: entry.threadId },
        signal,
      };

      // Create abort race promise
      const abortPromise = new Promise<never>((_, reject) => {
        const onAbort = () => {
          const err = new Error('Execution cancelled');
          err.name = 'AbortError';
          reject(err);
        };
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      });

      // Race between graph execution and abort
      const result = await Promise.race([
        graph.invoke(
          {
            userQuery: entry.text,
            threadId: entry.threadId,
            messages: history,
          },
          config
        ),
        abortPromise,
      ]);

      // Handle the result (interrupts, final responses, etc.)
      await this.handleGraphResult(result, config);
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Stops the currently executing message.
   */
  private stopCurrentExecution(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
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

  async dispose(): Promise<void> {
    // Save queue state before disposal (PRD 007)
    await this.saveQueueState();
    
    // Abort any current execution
    if (this.currentAbortController) {
      this.currentAbortController.abort();
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
