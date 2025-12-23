import * as vscode from 'vscode';
import { runRepomixOnSelectedFiles } from '../../commands/runRepomixOnSelectedFiles.js';
import * as path from 'path';
import * as fs from 'fs';
import ignore from 'ignore'; // Import ignore package

import { BaseController } from './BaseController.js';
import { DatabaseService } from '../../core/storage/databaseService.js';
import { getCwd } from '../../config/getCwd.js';
import { indexRepository } from '../../core/indexing/repoIndexer.js';
import { getRepoId } from '../../utils/repoIdentity.js';

import { RepoEmbeddingOrchestrator } from '../../core/indexing/repoEmbeddingOrchestrator.js';
import { getVectorDbAdapterForRepo } from '../../core/indexing/vectorDb/factory.js';

import { embeddingService } from '../../core/indexing/embeddingService.js';
import type { ExtensionContext } from 'vscode';

import { copyToClipboard } from '../../core/files/copyToClipboard.js';
import { tempDirManager } from '../../core/files/tempDirManager.js';
import { getRepomixOutputPath } from '../../utils/repomix_output_detector.js';
import { runRepomixClipboardGenerateMarkdown } from '../../core/files/runRepomixClipboardGenerateMarkdown.js';
// Fixed: Added missing import for RepoSearchResult
import { RepoSearchResult } from '../../core/indexing/llmReranking.js';

const SECRET_GOOGLE_GEMINI = 'repomix.agent.googleApiKey';
const SECRET_PINECONE = 'repomix.agent.pineconeApiKey'; // still used by factory (pinecone provider)
const STATE_SELECTED_PINECONE_INDEX = 'repomix.pinecone.selectedIndexByRepo'; // still used by factory
const STATE_VECTORDB_PROVIDER = 'repomix.vectorDb.provider';

enum IndexingState {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPING = 'stopping',
}

export class IndexingController extends BaseController {
  constructor(
    context: any,
    private readonly databaseService: DatabaseService,
    private readonly extensionContext: ExtensionContext
  ) {
    super(context);
  }

  // Indexing state management
  private indexingState: IndexingState = IndexingState.IDLE;
  private currentAbortController: AbortController | null = null;
  private currentRepoId: string | null = null;

  private async handleSearchRepo(query: string, topK?: number, useSmartFilter?: boolean) {
    try {
      const q = (query ?? '').trim();
      if (!q) return;

      const cwd = getCwd();
      const repoId = await getRepoId(cwd);

      const googleKey = await this.extensionContext.secrets.get(SECRET_GOOGLE_GEMINI);
      // Resolve active vector DB adapter (pinecone or qdrant)
      let adapter;
      try {
        ({ adapter } = await getVectorDbAdapterForRepo(this.extensionContext, repoId));
      } catch (e) {
        this.context.postMessage({ command: 'repoSearchError', error: e instanceof Error ? e.message : String(e) });
        return;
      }

      const resList = await Promise.all(
        vectors.map((vector) =>
          adapter.queryVectors({
            repoId,
            vector,
            topK: typeof topK === 'number' ? topK : 50,
          })
        )
      );


      // Merge by file path (keep best score per file)
      const bestByPath = new Map<string, { id: string; score: number; path: string; snippet?: string }>();


      for (const res of resList) {
        const matches = res?.matches ?? [];
        for (const m of matches) {
          const filePath = m.metadata?.filePath;
          if (!filePath || typeof filePath !== 'string') continue;


          const score = m.score ?? 0;
          const existing = bestByPath.get(filePath);

          if (!existing || score > existing.score) {
            bestByPath.set(filePath, {
              id: m.id,
              score,
              path: filePath,
              // Fixed: Type assertion for metadata snippet
              snippet: (m.metadata?.snippet ?? m.metadata?.text) as string | undefined,
            });

          }
        }
      }

      let results: RepoSearchResult[] = Array.from(bestByPath.values()).sort((a, b) => b.score - a.score);


      // Optional: LLM rerank/filter (only when Smart Filter is enabled)
      if (useSmartFilter && results.length > 0) {
        const { rerankResultsWithLLM } = await import('../../core/indexing/llmReranking.js');
        results = await rerankResultsWithLLM(q, results, googleKey, cwd, {
          maxFiles: 10,
          confidenceThreshold: 0.5,
          useFileContent: false,
        });

      }


      // --- FILTERING START ---
      // Robustly filter out files that are currently ignored by .gitignore,
      // even if they exist in the vector index (handling stale index cases).
      try {
        const ig = ignore();
        const gitignorePath = path.join(cwd, '.gitignore');

        // Add .gitignore rules if file exists
        if (fs.existsSync(gitignorePath)) {
          const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
          ig.add(gitignoreContent);
        }

        // Always add standard exclusions to be safe
        ig.add(['.git', 'node_modules', '.DS_Store', 'dist', 'out', 'build']);

        const originalCount = results.length;
        results = results.filter((r: any) => {
          if (!r.path) return false;
          // r.path should be a relative path from repo root
          return !ig.ignores(r.path);
        });

        if (originalCount !== results.length) {
          console.log(`[INDEXING_CONTROLLER] Filtered ${originalCount - results.length} ignored files from search results.`);
        }
      } catch (filterErr) {
        console.warn('[INDEXING_CONTROLLER] Error filtering search results with .gitignore:', filterErr);
        // If filtering fails, proceed with original results to avoid breaking search
      }
      // --- FILTERING END ---

      this.context.postMessage({ command: 'repoSearchResults', results });

      // Log results (for now we don't need to render them in UI)
      const dedupedPaths = Array.from(
        new Set(results.map((r: any) => (r.path ?? '').trim()).filter(Boolean))
      );

      console.log(
        `[INDEXING_CONTROLLER] Search "${q}" topK=${typeof topK === 'number' ? topK : 50} matches=${results.length} uniqueFiles=${dedupedPaths.length}`
      );
      console.log(`[INDEXING_CONTROLLER] Unique file paths:`, dedupedPaths);


      // Opportunistically refresh vector count after a search (cheap + useful)
      // (If it fails, it won't break search UX.)
      void this.handleGetRepoVectorCount(repoId);
    } catch (err) {
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

      // Convert repo-relative paths into URIs
      const uris = cleaned.map((rel) => vscode.Uri.file(path.join(cwd, rel)));

      console.log(`[INDEXING_CONTROLLER] Running repomix for ${cleaned.length} files`);
      console.log(`[INDEXING_CONTROLLER] repomix --include "${cleaned.join(',')}"`);

      await runRepomixOnSelectedFiles(
        uris,
        {
          // IMPORTANT: runRepomixOnSelectedFiles will compute includePatterns from these URIs.
          // If you later want to include glob patterns for directories, pass overrideConfig.include patterns.
        },
        undefined, // AbortSignal (optional)
        this.databaseService // logs debug run if enabled
      );

      vscode.window.showInformationMessage(`Repomix started for ${cleaned.length} files.`);

      // Get the output path and notify the webview
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
    if (!outputPath || !fs.existsSync(outputPath)) {
      vscode.window.showErrorMessage('No generated output file to copy.');
      return;
    }

    try {
      const originalFilename = path.basename(outputPath);
      const tmpDir = path.join(tempDirManager.getTempDir(), `copy_${Date.now()}`);
      await fs.promises.mkdir(tmpDir, { recursive: true });
      const tmpFilePath = path.join(tmpDir, originalFilename);
      await copyToClipboard(outputPath, tmpFilePath);
      vscode.window.showInformationMessage('Copied output file to clipboard.');
      await tempDirManager.cleanupFile(tmpFilePath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to copy: ${msg}`);
    }
  }

  private async handleCopySearchResultsMarkdown(files: string[]) {
    // De-dupe file paths (defensive - webview should already de-dupe)
    const cleaned = Array.from(
      new Set((files ?? []).map((f) => (f ?? '').trim()).filter(Boolean))
    );

    if (cleaned.length === 0) {
      vscode.window.showWarningMessage('No search result files to copy.');
      return;
    }

    const cwd = getCwd();

    console.log(`[INDEXING_CONTROLLER] Copying ${cleaned.length} search results as markdown`);
    console.log(`[INDEXING_CONTROLLER] Files:`, cleaned);

    try {
      // Ask Rust binary to generate temp .md + put it on binary clipboard
      await runRepomixClipboardGenerateMarkdown(this.extensionContext, cwd, cleaned);

      vscode.window.showInformationMessage(
        `Copied ${cleaned.length} file${cleaned.length === 1 ? '' : 's'} as Markdown to clipboard.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[INDEXING_CONTROLLER] Failed to copy as markdown:', err);
      vscode.window.showErrorMessage(`Failed to copy as markdown: ${msg}`);
    }
  }



  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      case 'searchRepo':
        await this.handleSearchRepo(message.query, message.topK, message.useSmartFilter);
        return true;


      case 'generateRepomixFromSearch':
        await this.handleGenerateRepomixFromSearch(message.files);
        return true;

      case 'copySearchOutput':
        await this.handleCopySearchOutput(message.outputPath);
        return true;

      case 'copySearchResultsMarkdown':
        await this.handleCopySearchResultsMarkdown(message.files);
        return true;

      case 'indexRepo':
        await this.handleIndexRepo(false);
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

      case 'deleteRepoIndex':
        await this.handleDeleteRepoIndex();
        return true;

      case 'getRepoIndexCount':
        await this.handleGetRepoIndexCount();
        return true;

      case 'getRepoVectorCount':
        await this.handleGetRepoVectorCount();
        return true;
    }

    return false;
  }

  async onWebviewLoaded() {
    await this.handleGetRepoIndexCount();
  }

  private async handleIndexRepo(resumeFromCheckpoint: boolean = false) {
    const overallStart = Date.now();
    console.log(`[INDEXING_CONTROLLER] Starting repository indexing process (resume: ${resumeFromCheckpoint})`);

    const cwd = getCwd();
    console.log(`[INDEXING_CONTROLLER] Working directory: ${cwd}`);

    const repoIdStart = Date.now();
    const repoId = await getRepoId(cwd);
    const provider = (this.extensionContext.globalState.get(STATE_VECTORDB_PROVIDER) as any) ?? 'pinecone';
    if (provider !== 'pinecone') {
      vscode.window.showWarningMessage(`Indexing is not yet implemented for ${provider}.`);
      this.context.postMessage({ command: 'indexRepoStateChange', state: 'idle' });
      this.indexingState = IndexingState.IDLE;
      return;
    }

    const repoIdDuration = Date.now() - repoIdStart;
    console.log(`[INDEXING_CONTROLLER] Repo ID generated in ${repoIdDuration}ms: ${repoId}`);
    this.currentRepoId = repoId;

    // Create AbortController for this session
    this.currentAbortController = new AbortController();
    this.indexingState = IndexingState.RUNNING;
    this.context.postMessage({ command: 'indexRepoStateChange', state: 'running' });

    let filesIndexed = 0;

    try {
      // Only do database indexing and secret resolution if not resuming
      if (!resumeFromCheckpoint) {
        // 1) Persist file paths into SQLite
        console.log(`[INDEXING_CONTROLLER] Step 1: Indexing files to database...`);
        const dbIndexStart = Date.now();
        filesIndexed = await indexRepository(cwd, this.databaseService);
        const dbIndexDuration = Date.now() - dbIndexStart;
        console.log(`[INDEXING_CONTROLLER] Step 1 completed: ${filesIndexed} files indexed to DB in ${dbIndexDuration}ms`);

        // Initialize progress tracking
        const files = await this.databaseService.getRepoFiles(repoId);
        await this.databaseService.initializeIndexingProgress(repoId, files);
      } else {
        filesIndexed = (await this.databaseService.getRepoFiles(repoId)).length;
      }

      // 2) Resolve secrets + selected Pinecone index
      console.log(`[INDEXING_CONTROLLER] Step 2: Resolving API keys and index...`);
      const secretsStart = Date.now();
      const googleKey = await this.extensionContext.secrets.get(SECRET_GOOGLE_GEMINI);
      const pineconeKey = await this.extensionContext.secrets.get(SECRET_PINECONE);
      const secretsDuration = Date.now() - secretsStart;
      console.log(`[INDEXING_CONTROLLER] Secrets resolved in ${secretsDuration}ms (Google key: ${googleKey ? '✓' : '✗'}, Pinecone key: ${pineconeKey ? '✓' : '✗'})`);

      const repoConfigs: Record<string, any> =
        (this.extensionContext.globalState.get(STATE_SELECTED_PINECONE_INDEX) as any) || {};

      const selected = repoConfigs[repoId];

      const indexName: string | undefined =
        typeof selected === 'string' ? selected : selected?.name;

      console.log(`[INDEXING_CONTROLLER] Selected Pinecone index: ${indexName || 'None'}`);

      if (!googleKey) {
        const durationMs = Date.now() - overallStart;
        console.log(`[INDEXING_CONTROLLER] Cannot proceed: Missing Google Gemini API key`);
        this.context.postMessage({
          command: 'indexRepoComplete',
          repoId,
          filesIndexed,
          filesEmbedded: 0,
          chunksEmbedded: 0,
          vectorsUpserted: 0,
          failedFiles: 0,
          durationMs,
        });
        this.context.postMessage({ command: 'repoIndexComplete', count: filesIndexed });
        this.indexingState = IndexingState.IDLE;
        return;
      }

      if (!pineconeKey || !indexName) {
        const durationMs = Date.now() - overallStart;
        console.log(`[INDEXING_CONTROLLER] Cannot proceed: Missing Pinecone API key or index name`);
        this.context.postMessage({
          command: 'indexRepoComplete',
          repoId,
          filesIndexed,
          filesEmbedded: 0,
          chunksEmbedded: 0,
          vectorsUpserted: 0,
          failedFiles: 0,
          durationMs,
        });
        this.context.postMessage({ command: 'repoIndexComplete', count: filesIndexed });
        this.indexingState = IndexingState.IDLE;
        return;
      }

      // Get progress status
      const completedCount = await this.databaseService.getCompletedFilesCount(repoId);
      const pendingFiles = await this.databaseService.getPendingFiles(repoId);
      const totalFiles = completedCount + pendingFiles.length;

      console.log(`[INDEXING_CONTROLLER] Progress: ${completedCount} completed, ${pendingFiles.length} pending, ${totalFiles} total`);

      // 3) Embed + upsert to Pinecone
      console.log(`[INDEXING_CONTROLLER] Step 3: Starting embedding and Pinecone upsert...`);
      const embeddingStart = Date.now();
      const orchestrator = new RepoEmbeddingOrchestrator(
        this.databaseService,
        new PineconeService()
      );

      console.log(`[INDEXING_CONTROLLER] Created orchestrator, starting embedRepository...`);
      const summary = await orchestrator.embedRepository(
        repoId, cwd, googleKey, pineconeKey,
        indexName,
        {}, // pipeline config
        (current, total, filePath) => {
          const actualCurrent = completedCount + current;
          // Log every 10th file
          if (actualCurrent % 10 === 1 || actualCurrent === total) {
            console.log(`[INDEXING_CONTROLLER] Progress: ${actualCurrent}/${total} files - ${filePath}`);
          }
          this.context.postMessage({
            command: 'indexRepoProgress',
            current: actualCurrent,
            total,
            filePath,
          });
        },
        this.currentAbortController.signal
      );

      // Check if we were paused/stopped during processing
      // Note: state can change to PAUSED or STOPPING via external handlers during async operation
      if (this.indexingState !== IndexingState.RUNNING) {
        const progress = {
          completed: completedCount + summary.successfulFiles,
          total: totalFiles
        };
        if (this.indexingState === IndexingState.PAUSED) {
          console.log(`[INDEXING_CONTROLLER] Indexing paused at ${progress.completed}/${progress.total}`);
          this.context.postMessage({
            command: 'indexRepoPaused',
            progress
          });
        } else if (this.indexingState === IndexingState.STOPPING) {
          console.log(`[INDEXING_CONTROLLER] Indexing stopped at ${progress.completed}/${progress.total}`);
          this.context.postMessage({
            command: 'indexRepoStopped',
            progress
          });
          this.indexingState = IndexingState.IDLE;
          // Clean up progress
          await this.databaseService.clearIndexingProgress(repoId);
        }
        return;
      }

      // Normal completion
      const embeddingDuration = Date.now() - embeddingStart;
      console.log(`[INDEXING_CONTROLLER] Step 3 completed: Embedding finished in ${embeddingDuration}ms`);

      const durationMs = Date.now() - overallStart;
      console.log(`[INDEXING_CONTROLLER] Total indexing completed in ${durationMs}ms`);

      const vectorsUpserted = summary.totalVectors;
      const chunksEmbedded = summary.totalVectors;

      console.log(`[INDEXING_CONTROLLER] Final summary: ${filesIndexed} files indexed, ${summary.successfulFiles} embedded, ${vectorsUpserted} vectors, ${summary.failedFiles} failed`);

      // Clear progress after successful completion
      await this.databaseService.clearIndexingProgress(repoId);

      this.context.postMessage({
        command: 'indexRepoComplete',
        repoId,
        filesIndexed,
        filesEmbedded: summary.successfulFiles,
        chunksEmbedded,
        vectorsUpserted,
        failedFiles: summary.failedFiles,
        durationMs,
      });

      this.context.postMessage({ command: 'repoIndexComplete', count: filesIndexed });
      this.context.postMessage({ command: 'indexRepoStateChange', state: 'idle' });

      // Refresh Pinecone vector count after indexing
      void this.handleGetRepoVectorCount(indexName, undefined, pineconeKey, repoId);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : '';

      // Check if this was an abort (pause or stop)
      // Note: state can be changed by pause/stop handlers during async operation
      if (errorMsg === 'Aborted' || errorName === 'AbortError') {
        const completedCount = await this.databaseService.getCompletedFilesCount(repoId || '');
        const status = await this.databaseService.getIndexingStatus(repoId || '');
        const progress = {
          completed: completedCount,
          total: completedCount + status.pending
        };

        const currentState = this.indexingState as IndexingState;
        if (currentState === IndexingState.PAUSED) {
          console.log(`[INDEXING_CONTROLLER] Indexing paused at ${progress.completed}/${progress.total}`);
          this.context.postMessage({
            command: 'indexRepoPaused',
            progress
          });
          return;
        } else if (currentState === IndexingState.STOPPING) {
          console.log(`[INDEXING_CONTROLLER] Indexing stopped at ${progress.completed}/${progress.total}`);
          this.context.postMessage({
            command: 'indexRepoStopped',
            progress
          });
          this.indexingState = IndexingState.IDLE;
          // Clean up progress on stop
          await this.databaseService.clearIndexingProgress(repoId || '');
          return;
        }
      }

      // Real error
      console.error('[INDEXING_CONTROLLER] Indexing failed:', error);
      this.indexingState = IndexingState.IDLE;
      this.context.postMessage({
        command: 'indexRepoStateChange',
        state: 'idle'
      });
    }
  }

  private async handlePauseRepoIndexing() {
    if (this.indexingState !== IndexingState.RUNNING) {
      console.log(`[INDEXING_CONTROLLER] Cannot pause: not running (state: ${this.indexingState})`);
      return;
    }

    console.log(`[INDEXING_CONTROLLER] Pausing indexing...`);
    this.indexingState = IndexingState.PAUSED;
    this.context.postMessage({ command: 'indexRepoStateChange', state: 'paused' });

    // Signal workers to stop after current file (graceful stop)
    this.currentAbortController?.abort();
  }

  private async handleResumeRepoIndexing() {
    if (this.indexingState !== IndexingState.PAUSED) {
      console.log(`[INDEXING_CONTROLLER] Cannot resume: not paused (state: ${this.indexingState})`);
      return;
    }

    console.log(`[INDEXING_CONTROLLER] Resuming indexing...`);
    this.indexingState = IndexingState.RUNNING;
    this.context.postMessage({ command: 'indexRepoStateChange', state: 'running' });

    // Restart embedding phase with existing progress
    await this.handleIndexRepo(true); // resumeFromCheckpoint = true
  }

  private async handleStopRepoIndexing() {
    if (this.indexingState !== IndexingState.RUNNING && this.indexingState !== IndexingState.PAUSED) {
      console.log(`[INDEXING_CONTROLLER] Cannot stop: not running or paused (state: ${this.indexingState})`);
      return;
    }

    console.log(`[INDEXING_CONTROLLER] Stopping indexing...`);
    this.indexingState = IndexingState.STOPPING;
    this.context.postMessage({ command: 'indexRepoStateChange', state: 'stopping' });

    // Signal workers to stop after current file (graceful stop)
    this.currentAbortController?.abort();
  }


  private async handleDeleteRepoIndex() {
    try {
      const cwd = getCwd();
      const repoId = await getRepoId(cwd);

      await this.databaseService.clearRepoFiles(repoId);

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
      // Don’t hard-fail UI; just show 0 if stats aren’t available.
      this.context.postMessage({ command: 'repoVectorCount', count: 0 });
    }
  }


  private async handleGetRepoIndexCount() {

    try {
      const cwd = getCwd();
      const repoId = await getRepoId(cwd);
      const count = await this.databaseService.getRepoFileCount(repoId);

      this.context.postMessage({
        command: 'repoIndexCount',
        count
      });

    } catch (error) {
      console.error('Failed to get repo index count:', error);
    }
  }
}