import * as vscode from 'vscode';
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




  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      case 'searchRepo':
        await this.handleSearchRepo(message.query, message.topK);
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
    const start = Date.now();

    const cwd = getCwd();
    const repoId = await getRepoId(cwd);

    // 1) Persist file paths into SQLite
    const filesIndexed = await indexRepository(cwd, this.databaseService);

    // 2) Resolve secrets + selected Pinecone index
    const googleKey = await this.extensionContext.secrets.get(SECRET_GOOGLE_GEMINI);
    const pineconeKey = await this.extensionContext.secrets.get(SECRET_PINECONE);

    const repoConfigs: Record<string, any> =
      (this.extensionContext.globalState.get(STATE_SELECTED_PINECONE_INDEX) as any) || {};

    const selected = repoConfigs[repoId];

    const indexName: string | undefined =
      typeof selected === 'string' ? selected : selected?.name;

    if (!googleKey) {
      this.context.postMessage({
        command: 'indexRepoComplete',
        repoId,
        filesIndexed,
        filesEmbedded: 0,
        chunksEmbedded: 0,
        vectorsUpserted: 0,
        failedFiles: 0,
        durationMs: Date.now() - start,
      });
      this.context.postMessage({ command: 'repoIndexComplete', count: filesIndexed }); // backward-compatible UI
      return;
    }

    if (!pineconeKey || !indexName) {
      this.context.postMessage({
        command: 'indexRepoComplete',
        repoId,
        filesIndexed,
        filesEmbedded: 0,
        chunksEmbedded: 0,
        vectorsUpserted: 0,
        failedFiles: 0,
        durationMs: Date.now() - start,
      });
      this.context.postMessage({ command: 'repoIndexComplete', count: filesIndexed }); // backward-compatible UI
      return;
    }

    // 3) Embed + upsert to Pinecone with namespace = repoId (handled inside PineconeService)
    const orchestrator = new RepoEmbeddingOrchestrator(
      this.databaseService,
      new PineconeService()
    );

    const summary = await orchestrator.embedRepository(
      repoId,
      cwd,
      googleKey,
      indexName,
      {}, // pipeline config (optional)
      (current, total, filePath) => {
        this.context.postMessage({
          command: 'indexRepoProgress',
          current,
          total,
          filePath,
        });
      }
    );

    const durationMs = Date.now() - start;

    // Note: in this pipeline, 1 vector ~= 1 chunk, so we treat totalVectors as chunksEmbedded too.
    const vectorsUpserted = summary.totalVectors;
    const chunksEmbedded = summary.totalVectors;

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