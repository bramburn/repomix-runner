import * as vscode from 'vscode';
import { runRepomixOnSelectedFiles } from '../../commands/runRepomixOnSelectedFiles.js';
import * as path from 'path';
import * as fs from 'fs';

import { BaseController } from './BaseController.js';
import { DatabaseService } from '../../core/storage/databaseService.js';
import { getCwd } from '../../config/getCwd.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import { getVectorDbAdapterForRepo } from '../../core/indexing/vectorDb/factory.js';
import type { ExtensionContext } from 'vscode';

import { copyToClipboard } from '../../core/files/copyToClipboard.js';
import { copySingleFileRespectingMode } from '../../commands/copySingleFileRespectingMode.js';
import { tempDirManager } from '../../core/files/tempDirManager.js';
import { getRepomixOutputPath } from '../../utils/repomix_output_detector.js';
import { runRepomixClipboardGenerateMarkdown } from '../../core/files/runRepomixClipboardGenerateMarkdown.js';
import { IndexingService, IndexingState, IndexingProgress, IndexingResult } from '../../core/services/IndexingService.js';
import { GitService } from '../../git/GitService.js';

const SECRET_GOOGLE_GEMINI = 'repomix.agent.googleApiKey';

/**
 * IndexingController - Thin adapter between webview and IndexingService.
 * 
 * This controller:
 * 1. Receives messages from webview and delegates to IndexingService
 * 2. Subscribes to IndexingService events and forwards them to webview
 * 3. Handles search operations (which are not long-running)
 * 
 * The actual indexing logic lives in IndexingService, which survives
 * webview recreations.
 */
export class IndexingController extends BaseController {
  private _eventListeners: Array<() => void> = [];

  constructor(
    context: any,
    private readonly databaseService: DatabaseService,
    private readonly extensionContext: ExtensionContext,
    private readonly indexingService: IndexingService
  ) {
    super(context);
    this._subscribeToIndexingEvents();
  }

  /**
   * Subscribe to IndexingService events and forward them to the webview.
   * This allows the webview to receive updates even after being recreated.
   */
  private _subscribeToIndexingEvents(): void {
    // State change events
    const onStateChange = (state: IndexingState) => {
      this.context.postMessage({ command: 'indexRepoStateChange', state });
    };
    this.indexingService.on('stateChange', onStateChange);
    this._eventListeners.push(() => this.indexingService.off('stateChange', onStateChange));

    // Progress events
    const onProgress = (progress: IndexingProgress) => {
      this.context.postMessage({
        command: 'indexRepoProgress',
        current: progress.current,
        total: progress.total,
        filePath: progress.filePath,
      });
    };
    this.indexingService.on('progress', onProgress);
    this._eventListeners.push(() => this.indexingService.off('progress', onProgress));

    // Completion events
    const onComplete = (result: IndexingResult) => {
      this.context.postMessage({
        command: 'indexRepoComplete',
        repoId: result.repoId,
        filesIndexed: result.filesIndexed,
        filesEmbedded: result.filesEmbedded,
        chunksEmbedded: result.chunksEmbedded,
        vectorsUpserted: result.vectorsUpserted,
        failedFiles: result.failedFiles,
        durationMs: result.durationMs,
      });
      this.context.postMessage({ command: 'repoIndexComplete', count: result.filesIndexed });
      // Refresh vector count after indexing
      void this.handleGetRepoVectorCount(result.repoId);
    };
    this.indexingService.on('complete', onComplete);
    this._eventListeners.push(() => this.indexingService.off('complete', onComplete));

    // Paused events
    const onPaused = (progress: { completed: number; total: number }) => {
      this.context.postMessage({ command: 'indexRepoPaused', progress });
    };
    this.indexingService.on('paused', onPaused);
    this._eventListeners.push(() => this.indexingService.off('paused', onPaused));

    // Stopped events
    const onStopped = (progress: { completed: number; total: number }) => {
      this.context.postMessage({ command: 'indexRepoStopped', progress });
    };
    this.indexingService.on('stopped', onStopped);
    this._eventListeners.push(() => this.indexingService.off('stopped', onStopped));

    // Error events
    const onError = (error: string) => {
      console.error('[IndexingController] Indexing error:', error);
      vscode.window.showWarningMessage(error);
    };
    this.indexingService.on('error', onError);
    this._eventListeners.push(() => this.indexingService.off('error', onError));
  }

  /**
   * Cleanup event listeners when the controller is disposed.
   */
  dispose(): void {
    this._eventListeners.forEach(unsub => unsub());
    this._eventListeners = [];
  }

  // ============================================================================
  // MESSAGE HANDLER
  // ============================================================================

  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      case 'searchRepo':
        await this.handleSearchRepo(message.query, message.topK, message.useSmartFilter, message.confidenceThreshold);
        return true;

      case 'generateRepomixFromSearch':
        await this.handleGenerateRepomixFromSearch(message.files);
        return true;

      case 'copySearchOutput':
        await this.handleCopySearchOutput(message.outputPath);
        return true;

      case 'copySingleFileRespectingMode':
        await this.handleCopySingleFileRespectingMode(message.path);
        return true;

      case 'copySearchResultsMarkdown':
        await this.handleCopySearchResultsMarkdown(message.files);
        return true;

      case 'copySearchFilePaths':
        await this.handleCopySearchFilePaths(message.files);
        return true;

      case 'indexRepo':
        await this.handleIndexRepo();
        return true;

      case 'pauseRepoIndexing':
        await this.handlePauseRepoIndexing();
        return true;

      case 'resumeRepoIndexing':
        await this.handleResumeRepoIndexing();
        return true;

      case 'stopRepoIndexing':
        await this.handleStopRepoIndexing();
        return true;

      case 'getIndexingState':
        await this.handleGetIndexingState();
        return true;

      case 'deleteRepoIndex':
        await this.handleDeleteRepoIndex();
        return true;

      case 'getRepoIndexCount':
        await this.handleGetRepoIndexCount();
        return true;

      case 'getRepoVectorCount':
        await this.handleGetRepoVectorCount();
        return true;
        
      case 'setEnableGrouping':
        await this.handleSetEnableGrouping(message.enabled);
        return true;
        
      case 'getEnableGrouping':
        await this.handleGetEnableGrouping();
        return true;
    }

    return false;
  }

  async onWebviewLoaded() {
    await this.handleGetIndexingState();
    await this.handleGetRepoIndexCount();
    await this.handleGetEnableGrouping(); // NEW: Load grouping setting
    try {
      const branchName = await new GitService().getCurrentBranch(getCwd());
      this.context.postMessage({ command: 'currentBranchContext', branchName });
    } catch {
      // no-op
    }
  }

  // ============================================================================
  // INDEXING HANDLERS - Thin adapters that delegate to IndexingService
  // ============================================================================

  private async handleIndexRepo() {
    // Delegate to IndexingService - events will be forwarded via subscriptions
    await this.indexingService.start(false);
  }

  private async handlePauseRepoIndexing() {
    await this.indexingService.pause();
  }

  private async handleResumeRepoIndexing() {
    await this.indexingService.resume();
  }

  private async handleStopRepoIndexing() {
    await this.indexingService.stop();
  }

  private async handleGetIndexingState() {
    const { state, progress } = await this.indexingService.getState();
    
    if (state === IndexingState.PAUSED && progress) {
      this.context.postMessage({
        command: 'indexingStateRestored',
        state: 'paused',
        progress
      });
    } else {
      this.context.postMessage({
        command: 'indexingStateRestored',
        state: state
      });
    }
  }

  /**
   * Public API to abort any active indexing and wait for it to return to IDLE.
   * This is used during provider switching to ensure no races.
   */
  public async abortIndexing(): Promise<void> {
    await this.indexingService.abort();
  }

  private async handleSetEnableGrouping(enabled: boolean) {
    await this.extensionContext.globalState.update('repomix.search.enableGrouping', enabled);
    this.context.postMessage({ command: 'enableGrouping', enabled });
  }

  private async handleGetEnableGrouping() {
    const enabled = this.extensionContext.globalState.get<boolean>('repomix.search.enableGrouping', true);
    this.context.postMessage({ command: 'enableGrouping', enabled });
  }

  // ============================================================================
  // NON-INDEXING HANDLERS - These stay in the controller
  // ============================================================================

  private async handleDeleteRepoIndex() {
    try {
      const cwd = getCwd();
      const repoId = await getRepoId(cwd);

      // Clear local SQLite database
      await this.databaseService.clearRepoFiles(repoId);

      // Delete vectors from Qdrant
      const { adapter } = await getVectorDbAdapterForRepo(this.extensionContext, repoId);
      await adapter.deleteRepo({ repoId });

      this.context.postMessage({
        command: 'repoIndexDeleted'
      });

      vscode.window.showInformationMessage('Repository index cleared.');

    } catch (error) {
      console.error('Failed to delete repo index:', error);
      vscode.window.showErrorMessage(`Failed to delete index: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleGetRepoVectorCount(preResolvedRepoId?: string) {
    try {
      const cwd = getCwd();
      const repoId = preResolvedRepoId ?? (await getRepoId(cwd));

      const { adapter } = await getVectorDbAdapterForRepo(this.extensionContext, repoId);

      const stats = await adapter.describeRepoStats?.({ repoId });
      const count = stats?.vectorCount ?? 0;

      this.context.postMessage({ command: 'repoVectorCount', count });
    } catch {
      // Don't hard-fail UI; just show 0 if stats aren't available.
      this.context.postMessage({ command: 'repoVectorCount', count: 0 });
    }
  }

  private async handleGetRepoIndexCount() {
    try {
      const cwd = getCwd();
      const repoId = await getRepoId(cwd);

      // If indexing is blocked (dimension mismatch), the SQLite data is stale -
      // clear it and return 0 so the UI shows a consistent state with Qdrant.
      const isBlocked = !!this.extensionContext.globalState.get('repomix.indexingBlocked');
      if (isBlocked) {
        await this.databaseService.clearRepoFiles(repoId);
        this.context.postMessage({ command: 'repoIndexCount', count: 0 });
        return;
      }

      const count = await this.databaseService.getRepoFileCount(repoId);

      this.context.postMessage({
        command: 'repoIndexCount',
        count
      });

    } catch (error) {
      console.error('Failed to get repo index count:', error);
    }
  }

  // ============================================================================
  // SEARCH HANDLERS - These stay in the controller (not long-running)
  // ============================================================================

  private async handleSearchRepo(query: string, topK?: number, useSmartFilter?: boolean, confidenceThreshold?: number) {
    console.log('[INDEXING_CONTROLLER] ===== HANDLE SEARCH REPO START =====');
    
    try {
      const q = (query ?? '').trim();
      if (!q) {
        console.log('[INDEXING_CONTROLLER] Empty query, aborting');
        return;
      }

      const cwd = getCwd();
      const repoId = await getRepoId(cwd);
      const currentBranch = await new GitService().getCurrentBranch(cwd);

      const googleKey = await this.extensionContext.secrets.get(SECRET_GOOGLE_GEMINI);

      // Initialize embedding service
      try {
        const { embeddingService } = await import('../../core/indexing/embeddingService.js');
        const config = vscode.workspace.getConfiguration();
        const provider = config.get<string>('repomix.embedding.provider') || 'lmstudio';

        if (provider === 'ollama') {
          const ollamaUrl = config.get<string>('repomix.ollama.url') || 'http://localhost:11434';
          const ollamaModel = config.get<string>('repomix.ollama.model') || 'nomic-embed-text';
          const ollamaDimension = config.get<number>('repomix.ollama.dimension') || 768;
          embeddingService.switchProvider({
            provider: 'ollama',
            ollama: { url: ollamaUrl, model: ollamaModel, dimension: ollamaDimension }
          });
        } else if (provider === 'lmstudio') {
          const lmstudioBaseUrl = config.get<string>('repomix.lmstudio.baseUrl') || 'http://localhost:1234/v1';
          const lmstudioApiKey = config.get<string>('repomix.lmstudio.apiKey') || '';
          const lmstudioModel = config.get<string>('repomix.lmstudio.model') || '';
          const lmstudioDimension = config.get<number>('repomix.lmstudio.dimension') || 768;
          
          if (!lmstudioModel) {
            this.context.postMessage({
              command: 'repoSearchError',
              error: 'LM Studio model is required for search. Please configure it in Settings.'
            });
            return;
          }
          
          embeddingService.switchProvider({
            provider: 'lmstudio',
            lmstudio: {
              baseUrl: lmstudioBaseUrl,
              apiKey: lmstudioApiKey,
              model: lmstudioModel,
              dimension: lmstudioDimension
            }
          });
        }
      } catch (embeddingError) {
        const errorDetail = embeddingError instanceof Error ? embeddingError.message : String(embeddingError);
        this.context.postMessage({
          command: 'repoSearchError',
          error: `Failed to initialize embedding service. Please check your embedding provider settings.\nDetails: ${errorDetail}`
        });
        return;
      }
      
      // Resolve vector DB adapter
      let adapter;
      try {
        ({ adapter } = await getVectorDbAdapterForRepo(this.extensionContext, repoId));
      } catch (e) {
        const errorDetail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        let userFriendlyError = errorDetail;

        if (errorDetail.toLowerCase().includes('missing qdrant url')) {
          userFriendlyError = 'Qdrant URL is not configured. Please add your Qdrant URL in the Settings tab.';
        } else if (errorDetail.toLowerCase().includes('no qdrant collection configured')) {
          userFriendlyError = 'No Qdrant collection configured. Please select a collection in the Settings tab.';
        }

        this.context.postMessage({
          command: 'repoSearchError',
          error: `Failed to initialize vector database connection.

${userFriendlyError}

Please check your Vector DB settings and try again.`
        });
        return;
      }

      const { runSearchGraph } = await import('../../search/graph.js');

      // Get enableGrouping setting from global state
      const enableGrouping = this.extensionContext.globalState.get<boolean>('repomix.search.enableGrouping', true);
      
      const finalState = await runSearchGraph({
        repoId,
        repoRoot: cwd,
        branchName: currentBranch,
        userQuery: q,
        smartFilterEnabled: !!useSmartFilter,
        maxResults: typeof topK === 'number' ? topK : 50,
        googleApiKey: googleKey || undefined,
        confidenceThreshold: confidenceThreshold,
        enableGrouping, // NEW: Pass grouping configuration
      }, adapter, this.context);

      if (finalState.errors.length > 0) {
        const firstError = finalState.errors[0];
        this.context.postMessage({
          command: 'repoSearchError',
          error: `AI Search failed at step "${firstError.node}".\nError: ${firstError.error}`
        });
        return;
      }

      const results = finalState.finalHits;
      this.context.postMessage({ command: 'repoSearchResults', results: results });
      this.context.postMessage({ command: 'currentBranchContext', branchName: finalState.branchName || currentBranch });

      const dedupedPaths = Array.from(
        new Set(results.map((r: any) => (r.path ?? '').trim()).filter(Boolean))
      );

      // Generate summary if Smart Filter passed
      if (useSmartFilter && dedupedPaths.length > 0) {
        try {
          const { generateMarkdownSummary } = await import('../../agent/summaryGenerator.js');
          const absolutePaths = dedupedPaths.map(p => path.join(cwd, p));

          const result = await generateMarkdownSummary(
            googleKey || '',
            q,
            absolutePaths,
            cwd
          );

          if (result.summaryPath) {
            this.context.postMessage({
              command: 'searchSummaryReady',
              summaryPath: result.summaryPath
            });
          }
        } catch (summaryErr) {
          console.error('[INDEXING_CONTROLLER] Failed to generate summary:', summaryErr);
        }
      }

      // Refresh vector count
      void this.handleGetRepoVectorCount(repoId);
      
    } catch (err) {
      console.error('[INDEXING_CONTROLLER] Search error:', err);
      this.context.postMessage({
        command: 'repoSearchError',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleGenerateRepomixFromSearch(files: string[]) {
    try {
      const cwd = getCwd();

      const cleaned = Array.from(
        new Set((files ?? []).map((f) => (f ?? '').trim()).filter(Boolean))
      );

      if (cleaned.length === 0) {
        vscode.window.showWarningMessage('No files to generate repomix include list from.');
        return;
      }

      const uris = cleaned.map((rel) => vscode.Uri.file(path.join(cwd, rel)));

      await runRepomixOnSelectedFiles(
        uris,
        {},
        undefined,
        this.databaseService
      );

      vscode.window.showInformationMessage(`Repomix started for ${cleaned.length} files.`);

      const outputPath = getRepomixOutputPath(cwd);
      this.context.postMessage({
        command: 'searchOutputReady',
        outputPath,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[INDEXING_CONTROLLER] Repomix generate failed:', err);
      vscode.window.showErrorMessage(`Repomix generate failed: ${msg}`);
    }
  }

  private async handleCopySearchOutput(outputPath: string) {
    // Redirect to the unified handler to respect copyMode
    await this.handleCopySingleFileRespectingMode(outputPath);
  }

  private async handleCopySingleFileRespectingMode(filePath: string) {
    if (!filePath || !fs.existsSync(filePath)) {
      const errorMsg = 'No file found to copy.';
      vscode.window.showErrorMessage(errorMsg);
      this.context.postMessage({
        command: 'copyError',
        error: errorMsg,
      });
      return;
    }

    try {
      const copyMode = await copySingleFileRespectingMode(filePath);

      this.context.postMessage({
        command: 'copySuccess',
        type: 'single-file',
        copyMode, // Send copyMode for frontend to determine which button to update
        filePath, // Send filePath to identify which button was clicked
      });
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to copy: ${msg}`);
      this.context.postMessage({
        command: 'copyError',
        error: msg,
        filePath, // Send filePath to identify which button was clicked
      });
    }
  }

  private async handleCopySearchResultsMarkdown(files: string[]) {
    const cleaned = Array.from(
      new Set((files ?? []).map((f) => (f ?? '').trim()).filter(Boolean))
    );

    if (cleaned.length === 0) {
      vscode.window.showWarningMessage('No search result files to copy.');
      this.context.postMessage({
        command: 'copyError',
        error: 'No files selected',
      });
      return;
    }

    const cwd = getCwd();

    try {
      const showProgress = cleaned.length > 50;
      let result: { tokenCount: number };

      if (showProgress) {
        result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Generating markdown for ${cleaned.length} files...`,
            cancellable: false,
          },
          async () => {
            return await runRepomixClipboardGenerateMarkdown(this.extensionContext, cwd, cleaned);
          }
        );
      } else {
        result = await runRepomixClipboardGenerateMarkdown(this.extensionContext, cwd, cleaned);
      }

      const formattedTokenCount = result.tokenCount.toLocaleString();
      const fileWord = cleaned.length === 1 ? 'file' : 'files';
      const successMessage = `Copied ${cleaned.length} ${fileWord} as Markdown (${formattedTokenCount} tokens)`;

      vscode.window.showInformationMessage(successMessage);

      this.context.postMessage({
        command: 'copySuccess',
        message: successMessage,
        tokenCount: result.tokenCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[INDEXING_CONTROLLER] Failed to copy as markdown:', err);
      vscode.window.showErrorMessage(`Failed to copy as markdown: ${msg}`);

      this.context.postMessage({
        command: 'copyError',
        error: msg,
      });
    }
  }

  private async handleCopySearchFilePaths(files: string[]) {
    const cleaned = Array.from(
      new Set((files ?? []).map((f) => (f ?? '').trim()).filter(Boolean))
    );

    if (cleaned.length === 0) {
      vscode.window.showWarningMessage('No search result files to copy.');
      return;
    }

    const formattedPaths = cleaned.map(p => `@${p}`).join(', ');

    try {
      await vscode.env.clipboard.writeText(formattedPaths);
      vscode.window.showInformationMessage(
        `Copied ${cleaned.length} file path${cleaned.length === 1 ? '' : 's'} to clipboard.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[INDEXING_CONTROLLER] Failed to copy file paths:', err);
      vscode.window.showErrorMessage(`Failed to copy file paths: ${msg}`);
    }
  }
}
