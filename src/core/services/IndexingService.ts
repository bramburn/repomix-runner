import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { DatabaseService } from '../storage/databaseService.js';
import { getCwd } from '../../config/getCwd.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import { indexRepository } from '../indexing/repoIndexer.js';
import { RepoEmbeddingOrchestrator } from '../indexing/repoEmbeddingOrchestrator.js';
import { getVectorDbAdapterForRepo } from '../indexing/vectorDb/factory.js';

const SECRET_GOOGLE_GEMINI = 'repomix.agent.googleApiKey';

export enum IndexingState {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPING = 'stopping',
}

export interface IndexingProgress {
  current: number;
  total: number;
  filePath: string;
}

export interface IndexingResult {
  repoId: string;
  filesIndexed: number;
  filesEmbedded: number;
  chunksEmbedded: number;
  vectorsUpserted: number;
  failedFiles: number;
  durationMs: number;
}

/**
 * IndexingService - Singleton service that manages repository indexing.
 * 
 * This service lives at the extension level (created in activate) and survives
 * webview recreations. Controllers subscribe to events to update the UI.
 * 
 * Events:
 * - 'stateChange': (state: IndexingState) - when indexing state changes
 * - 'progress': (progress: IndexingProgress) - during indexing
 * - 'complete': (result: IndexingResult) - when indexing completes successfully
 * - 'paused': (progress: { completed: number; total: number }) - when paused
 * - 'stopped': (progress: { completed: number; total: number }) - when stopped
 * - 'error': (error: string) - when an error occurs
 */
export class IndexingService extends EventEmitter {
  private _state: IndexingState = IndexingState.IDLE;
  private _currentAbortController: AbortController | null = null;
  private _currentRepoId: string | null = null;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly extensionContext: vscode.ExtensionContext
  ) {
    super();
  }

  get state(): IndexingState {
    return this._state;
  }

  get currentRepoId(): string | null {
    return this._currentRepoId;
  }

  private setState(newState: IndexingState): void {
    this._state = newState;
    this.emit('stateChange', newState);
  }

  /**
   * Start or resume repository indexing
   */
  async start(resumeFromCheckpoint: boolean = false): Promise<void> {
    // Check if indexing is blocked due to dimension mismatch
    const isBlocked = this.extensionContext.globalState.get('repomix.indexingBlocked');
    if (isBlocked) {
      console.log('[IndexingService] Indexing blocked due to dimension mismatch');
      this.emit('error', 'Indexing blocked: Embedding dimension mismatch detected. Please reset your vector index from the Settings tab before indexing.');
      return;
    }

    const overallStart = Date.now();
    console.log(`[IndexingService] Starting repository indexing process (resume: ${resumeFromCheckpoint})`);

    const cwd = getCwd();
    const repoId = await getRepoId(cwd);
    this._currentRepoId = repoId;

    // Create AbortController for this session
    this._currentAbortController = new AbortController();
    this.setState(IndexingState.RUNNING);

    let filesIndexed = 0;

    try {
      // Only do database indexing and secret resolution if not resuming
      if (!resumeFromCheckpoint) {
        // 1) Persist file paths into SQLite
        console.log(`[IndexingService] Step 1: Indexing files to database...`);
        filesIndexed = await indexRepository(cwd, this.databaseService);

        // Initialize progress tracking
        const files = await this.databaseService.getRepoFiles(repoId);
        await this.databaseService.initializeIndexingProgress(repoId, files);
      } else {
        filesIndexed = (await this.databaseService.getRepoFiles(repoId)).length;
      }

      // 2) Resolve secrets + vector DB adapter
      const googleKey = await this.extensionContext.secrets.get(SECRET_GOOGLE_GEMINI);

      if (!googleKey) {
        const durationMs = Date.now() - overallStart;
        console.log(`[IndexingService] Cannot proceed: Missing Google Gemini API key`);
        this.emit('complete', {
          repoId,
          filesIndexed,
          filesEmbedded: 0,
          chunksEmbedded: 0,
          vectorsUpserted: 0,
          failedFiles: 0,
          durationMs,
        } as IndexingResult);
        this.setState(IndexingState.IDLE);
        return;
      }

      // Resolve vector DB adapter
      let adapter;
      let adapterError: string | undefined;
      try {
        const result = await getVectorDbAdapterForRepo(this.extensionContext, repoId);
        adapter = result.adapter;
      } catch (e) {
        adapterError = e instanceof Error ? e.message : String(e);
      }

      if (!adapter) {
        const durationMs = Date.now() - overallStart;
        console.log(`[IndexingService] Cannot proceed: ${adapterError}`);
        this.emit('complete', {
          repoId,
          filesIndexed,
          filesEmbedded: 0,
          chunksEmbedded: 0,
          vectorsUpserted: 0,
          failedFiles: 0,
          durationMs,
        } as IndexingResult);
        this.setState(IndexingState.IDLE);
        return;
      }

      // Get progress status
      const completedCount = await this.databaseService.getCompletedFilesCount(repoId);
      const pendingFiles = await this.databaseService.getPendingFiles(repoId);
      const totalFiles = completedCount + pendingFiles.length;

      // 3) Embed + upsert to vector DB
      const orchestrator = new RepoEmbeddingOrchestrator(this.databaseService);

      const summary = await orchestrator.embedRepository(
        repoId, cwd, googleKey, adapter,
        {}, // pipeline config
        (current: number, total: number, filePath: string) => {
          const actualCurrent = completedCount + current;
          this.emit('progress', {
            current: actualCurrent,
            total,
            filePath,
          } as IndexingProgress);
        },
        this._currentAbortController.signal
      );

      // Check if we were paused/stopped during processing
      if (this._state !== IndexingState.RUNNING) {
        const progress = {
          completed: completedCount + summary.successfulFiles,
          total: totalFiles
        };
        if (this._state === IndexingState.PAUSED) {
          console.log(`[IndexingService] Indexing paused at ${progress.completed}/${progress.total}`);
          this.emit('paused', progress);
        } else if (this._state === IndexingState.STOPPING) {
          console.log(`[IndexingService] Indexing stopped at ${progress.completed}/${progress.total}`);
          this.emit('stopped', progress);
          this.setState(IndexingState.IDLE);
          await this.databaseService.clearIndexingProgress(repoId);
        }
        return;
      }

      // Normal completion
      const durationMs = Date.now() - overallStart;

      await this.databaseService.clearIndexingProgress(repoId);
      await this.databaseService.clearPauseCheckpoint(repoId);

      this.emit('complete', {
        repoId,
        filesIndexed,
        filesEmbedded: summary.successfulFiles,
        chunksEmbedded: summary.totalVectors,
        vectorsUpserted: summary.totalVectors,
        failedFiles: summary.failedFiles,
        durationMs,
      } as IndexingResult);

      this.setState(IndexingState.IDLE);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : '';

      // Check if this was an abort (pause or stop)
      if (errorMsg === 'Aborted' || errorName === 'AbortError') {
        const completedCount = await this.databaseService.getCompletedFilesCount(repoId || '');
        const status = await this.databaseService.getIndexingStatus(repoId || '');
        const progress = {
          completed: completedCount,
          total: completedCount + status.pending
        };

        if (this._state === IndexingState.PAUSED) {
          console.log(`[IndexingService] Indexing paused at ${progress.completed}/${progress.total}`);
          this.emit('paused', progress);
          return;
        } else if (this._state === IndexingState.STOPPING) {
          console.log(`[IndexingService] Indexing stopped at ${progress.completed}/${progress.total}`);
          this.emit('stopped', progress);
          this.setState(IndexingState.IDLE);
          await this.databaseService.clearIndexingProgress(repoId || '');
          return;
        }
      }

      // Real error
      console.error('[IndexingService] Indexing failed:', error);
      this.emit('error', errorMsg);
      this.setState(IndexingState.IDLE);
    }
  }

  /**
   * Pause the current indexing operation
   */
  async pause(): Promise<void> {
    if (this._state !== IndexingState.RUNNING) {
      console.log(`[IndexingService] Cannot pause: not running (state: ${this._state})`);
      return;
    }

    console.log(`[IndexingService] Pausing indexing...`);
    this.setState(IndexingState.PAUSED);

    // Save checkpoint before aborting
    if (this._currentRepoId) {
      const completedCount = await this.databaseService.getCompletedFilesCount(this._currentRepoId);
      const status = await this.databaseService.getIndexingStatus(this._currentRepoId);
      const totalCount = completedCount + status.pending;

      await this.databaseService.resetProcessingToPending(this._currentRepoId);
      await this.databaseService.savePauseCheckpoint(this._currentRepoId, completedCount, totalCount);
      console.log(`[IndexingService] Pause checkpoint saved: ${completedCount}/${totalCount}`);
    }

    // Signal workers to stop after current file
    this._currentAbortController?.abort();
  }

  /**
   * Resume a paused indexing operation
   */
  async resume(): Promise<void> {
    if (this._state !== IndexingState.PAUSED) {
      console.log(`[IndexingService] Cannot resume: not paused (state: ${this._state})`);
      return;
    }

    console.log(`[IndexingService] Resuming indexing...`);
    await this.start(true);
  }

  /**
   * Stop the current indexing operation
   */
  async stop(): Promise<void> {
    if (this._state !== IndexingState.RUNNING && this._state !== IndexingState.PAUSED) {
      console.log(`[IndexingService] Cannot stop: not running or paused (state: ${this._state})`);
      return;
    }

    console.log(`[IndexingService] Stopping indexing...`);
    this.setState(IndexingState.STOPPING);

    // Clear pause checkpoint on stop
    if (this._currentRepoId) {
      await this.databaseService.clearPauseCheckpoint(this._currentRepoId);
      console.log(`[IndexingService] Pause checkpoint cleared on stop`);
    }

    // Signal workers to stop after current file
    this._currentAbortController?.abort();
  }

  /**
   * Get the current indexing state, restoring from checkpoint if needed
   */
  async getState(): Promise<{ state: IndexingState; progress?: { completed: number; total: number } }> {
    try {
      const cwd = getCwd();
      const repoId = await getRepoId(cwd);

      // Don't override if already running
      if (this._state === IndexingState.RUNNING) {
        return { state: this._state };
      }

      const checkpoint = await this.databaseService.getPauseCheckpoint(repoId);

      if (checkpoint) {
        this._state = IndexingState.PAUSED;
        this._currentRepoId = repoId;
        console.log(`[IndexingService] Restored pause state from checkpoint: ${checkpoint.completed}/${checkpoint.total}`);
        return { state: IndexingState.PAUSED, progress: checkpoint };
      }

      return { state: IndexingState.IDLE };
    } catch (error) {
      console.error('[IndexingService] Failed to get indexing state:', error);
      return { state: IndexingState.IDLE };
    }
  }

  /**
   * Abort any active indexing and wait for it to return to IDLE.
   * Used during provider switching to ensure no races.
   */
  async abort(): Promise<void> {
    if (this._state === IndexingState.IDLE) {
      return;
    }

    console.log(`[IndexingService] abort called (current state: ${this._state})`);

    if (this._state !== IndexingState.STOPPING) {
      await this.stop();
    }

    // Wait for state to transition back to IDLE
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = setInterval(() => {
        if (this._state === IndexingState.IDLE) {
          clearInterval(check);
          resolve();
        }
        // Safety timeout (30 seconds)
        if (Date.now() - startTime > 30000) {
          console.warn('[IndexingService] abort timed out waiting for IDLE state');
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }
}
