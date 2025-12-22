import * as vscode from 'vscode';
import { runRepomixOnSelectedFiles } from '../../commands/runRepomixOnSelectedFiles.js';
import * as path from 'path';

import { BaseController } from './BaseController.js';
import { DatabaseService } from '../../core/storage/databaseService.js';
import { getCwd } from '../../config/getCwd.js';
import { indexRepository } from '../../core/indexing/repoIndexer.js';
import { getRepoId } from '../../utils/repoIdentity.js';

import { RepoEmbeddingOrchestrator } from '../../core/indexing/repoEmbeddingOrchestrator.js';
import { PineconeService } from '../../core/indexing/pineconeService.js';
import { embeddingService } from '../../core/indexing/embeddingService.js';
import type { ExtensionContext } from 'vscode';
import { Pinecone } from '@pinecone-database/pinecone';



const SECRET_GOOGLE_GEMINI = 'repomix.agent.googleApiKey';
const SECRET_PINECONE = 'repomix.agent.pineconeApiKey';
const STATE_SELECTED_PINECONE_INDEX = 'repomix.pinecone.selectedIndexByRepo';

export class IndexingController extends BaseController {
  constructor(
    context: any,
    private readonly databaseService: DatabaseService,
    private readonly extensionContext: ExtensionContext
  ) {
    super(context);
  }

  private async handleSearchRepo(query: string, topK?: number) {
    try {
      const q = (query ?? '').trim();
      if (!q) return;

      const cwd = getCwd();
      const repoId = await getRepoId(cwd);

      const googleKey = await this.extensionContext.secrets.get(SECRET_GOOGLE_GEMINI);
      const pineconeKey = await this.extensionContext.secrets.get(SECRET_PINECONE);

      // Selected Pinecone index is stored per-repo in globalState
      const repoConfigs: Record<string, any> =
        (this.extensionContext.globalState.get(STATE_SELECTED_PINECONE_INDEX) as any) || {};
      const selected = repoConfigs[repoId];

      // Support either:
      //  - string index name, OR
      //  - object { name, host, ... } (matches SavePineconeIndexSchema shape)
      const indexName: string | undefined =
        typeof selected === 'string' ? selected : selected?.name;
      const indexHost: string | undefined =
        typeof selected === 'string' ? undefined : selected?.host;

      if (!googleKey) {
        this.context.postMessage({ command: 'repoSearchError', error: 'Missing Google Gemini API key' });
        return;
      }
      if (!pineconeKey) {
        this.context.postMessage({ command: 'repoSearchError', error: 'Missing Pinecone API key' });
        return;
      }
      if (!indexName) {
        this.context.postMessage({ command: 'repoSearchError', error: 'No Pinecone index selected for this repo' });
        return;
      }

      const vector = await embeddingService.embedText(googleKey, q);

      const pinecone = new PineconeService();
      const res = await pinecone.queryVectors(
        pineconeKey,
        indexName,
        repoId, // namespace
        vector,
        typeof topK === 'number' ? topK : 50
      );

      const matches = res?.matches ?? [];
      const results = matches.map((m: any) => ({
        id: m.id,
        score: m.score ?? 0,
        path: m.metadata?.filePath,
        snippet: m.metadata?.snippet ?? m.metadata?.text,
      }));

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
      void this.handleGetRepoVectorCount(indexName, indexHost, pineconeKey, repoId);
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[INDEXING_CONTROLLER] Repomix generate failed:', err);
      vscode.window.showErrorMessage(`Repomix generate failed: ${msg}`);
    }
  }



  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      case 'searchRepo':
        await this.handleSearchRepo(message.query, message.topK);
        return true;

      case 'generateRepomixFromSearch':
        await this.handleGenerateRepomixFromSearch(message.files);
        return true;

      case 'indexRepo':
        await this.handleIndexRepo();
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

  private async handleIndexRepo() {
    const overallStart = Date.now();
    console.log(`[INDEXING_CONTROLLER] Starting repository indexing process`);

    const cwd = getCwd();
    console.log(`[INDEXING_CONTROLLER] Working directory: ${cwd}`);

    const repoIdStart = Date.now();
    const repoId = await getRepoId(cwd);
    const repoIdDuration = Date.now() - repoIdStart;
    console.log(`[INDEXING_CONTROLLER] Repo ID generated in ${repoIdDuration}ms: ${repoId}`);

    // 1) Persist file paths into SQLite
    console.log(`[INDEXING_CONTROLLER] Step 1: Indexing files to database...`);
    const dbIndexStart = Date.now();
    const filesIndexed = await indexRepository(cwd, this.databaseService);
    const dbIndexDuration = Date.now() - dbIndexStart;
    console.log(`[INDEXING_CONTROLLER] Step 1 completed: ${filesIndexed} files indexed to DB in ${dbIndexDuration}ms`);

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
      this.context.postMessage({ command: 'repoIndexComplete', count: filesIndexed }); // backward-compatible UI
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
      this.context.postMessage({ command: 'repoIndexComplete', count: filesIndexed }); // backward-compatible UI
      return;
    }

    // 3) Embed + upsert to Pinecone with namespace = repoId (handled inside PineconeService)
    console.log(`[INDEXING_CONTROLLER] Step 3: Starting embedding and Pinecone upsert...`);
    const embeddingStart = Date.now();
    const orchestrator = new RepoEmbeddingOrchestrator(
      this.databaseService,
      new PineconeService()
    );

    console.log(`[INDEXING_CONTROLLER] Created orchestrator, starting embedRepository...`);
    const summary = await orchestrator.embedRepository(
      repoId,
      cwd,
      googleKey,
      indexName,
      {}, // pipeline config (optional)
      (current, total, filePath) => {
        // Log every 10th file or every second for large repos
        if (current % 10 === 1 || current === total) {
          console.log(`[INDEXING_CONTROLLER] Progress: ${current}/${total} files - ${filePath}`);
        }
        this.context.postMessage({
          command: 'indexRepoProgress',
          current,
          total,
          filePath,
        });
      }
    );

    const embeddingDuration = Date.now() - embeddingStart;
    console.log(`[INDEXING_CONTROLLER] Step 3 completed: Embedding finished in ${embeddingDuration}ms`);

    const durationMs = Date.now() - overallStart;
    console.log(`[INDEXING_CONTROLLER] Total indexing completed in ${durationMs}ms`);

    // Note: in this pipeline, 1 vector ~= 1 chunk, so we treat totalVectors as chunksEmbedded too.
    const vectorsUpserted = summary.totalVectors;
    const chunksEmbedded = summary.totalVectors;

    console.log(`[INDEXING_CONTROLLER] Final summary: ${filesIndexed} files indexed, ${summary.successfulFiles} embedded, ${vectorsUpserted} vectors, ${summary.failedFiles} failed`);

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

    // Keep existing UI behavior (your SearchTab currently listens for repoIndexComplete)
    this.context.postMessage({ command: 'repoIndexComplete', count: filesIndexed });

    // Refresh Pinecone vector count after indexing (SearchTab already requests it, but this is safe)
    void this.handleGetRepoVectorCount(indexName, undefined, pineconeKey, repoId);
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

  private async handleGetRepoVectorCount(
    preResolvedIndexName?: string,
    preResolvedIndexHost?: string,
    preResolvedApiKey?: string,
    preResolvedRepoId?: string
  ) {
    try {
      const cwd = getCwd();
      const repoId = preResolvedRepoId ?? (await getRepoId(cwd));

      const pineconeKey = preResolvedApiKey ?? (await this.extensionContext.secrets.get(SECRET_PINECONE));
      if (!pineconeKey) {
        this.context.postMessage({ command: 'repoVectorCount', count: 0 });
        return;
      }

      const repoConfigs: Record<string, any> =
        (this.extensionContext.globalState.get(STATE_SELECTED_PINECONE_INDEX) as any) || {};
      const selected = repoConfigs[repoId];

      const indexName: string | undefined =
        preResolvedIndexName ?? (typeof selected === 'string' ? selected : selected?.name);
      const indexHost: string | undefined =
        preResolvedIndexHost ?? (typeof selected === 'string' ? undefined : selected?.host);

      if (!indexName) {
        this.context.postMessage({ command: 'repoVectorCount', count: 0 });
        return;
      }

      // Use the official Pinecone SDK to read namespace stats.
      // Works when host is present (recommended), and also attempts without host.
      const pc = new Pinecone({ apiKey: pineconeKey });
      const index = indexHost ? pc.index(indexName, indexHost) : pc.index(indexName);

      const stats = await index.describeIndexStats();

      const count =
        (stats as any)?.namespaces?.[repoId]?.vectorCount ??
        (stats as any)?.namespaces?.[repoId]?.recordCount ??
        0;

      this.context.postMessage({ command: 'repoVectorCount', count });
    } catch (error) {
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