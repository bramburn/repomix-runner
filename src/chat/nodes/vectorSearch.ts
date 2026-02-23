/**
 * vectorSearch node - Retrieves context from vector database.
 */
import type { ExtensionContext } from 'vscode';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import { getVectorDbAdapterForRepo } from '../../core/indexing/vectorDb/factory.js';
import { embeddingService } from '../../core/indexing/embeddingService.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import { GitService } from '../../git/GitService.js';
import {
  getWorkspaceRoot,
  loadSnippet,
  type RetrievedContextItem,
  type ProgressCallback,
} from './utils.js';

export async function vectorSearchNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  const queries = state.searchQueries.length > 0 ? state.searchQueries : [state.userQuery];
  const normalizedQueries = queries.map((q) => q.trim()).filter(Boolean);
  if (normalizedQueries.length === 0) {
    return { retrievedContext: [] };
  }

  onProgress(`Searching codebase for: ${normalizedQueries.join(', ')}...`);

  const workspaceFolder = getWorkspaceRoot();
  if (!workspaceFolder) {
    logger.both.warn('Chat Graph: No workspace folder found, skipping retrieval.');
    return { retrievedContext: [] };
  }

  let repoId: string;
  try {
    repoId = await getRepoId(workspaceFolder);
  } catch (error) {
    logger.both.warn('Chat Graph: Failed to determine repo ID, skipping retrieval.', error);
    return { retrievedContext: [] };
  }

  try {
    const { adapter } = await getVectorDbAdapterForRepo(extensionContext, repoId);
    const gitService = new GitService();
    const branchName = await gitService.getCurrentBranch(workspaceFolder);

    const allResults = await Promise.all(
      normalizedQueries.map(async (query) => {
        const vector = await embeddingService.embedText(query, 'chat', true);
        return adapter.queryVectors({
          repoId,
          vector,
          topK: 5,
          groupBy: 'filePath',
          branchName,
        });
      })
    );

    const rawMatches = allResults.flatMap((result) =>
      result.groupedMatches?.length ? result.groupedMatches : result.matches
    );

    const retrievedContext: RetrievedContextItem[] = [];
    for (const match of rawMatches) {
      const filePath = match.metadata?.filePath as string | undefined;
      if (!filePath) {
        continue;
      }
      const startLine = match.metadata?.startLine as number | undefined;
      const endLine = match.metadata?.endLine as number | undefined;
      const content = await loadSnippet(workspaceFolder, filePath, startLine, endLine);
      retrievedContext.push({
        filePath,
        content,
        score: match.score ?? 0,
        startLine,
        endLine,
      });
    }

    onProgress(`Found ${retrievedContext.length} relevant code snippets.`);
    return { retrievedContext };
  } catch (error) {
    logger.both.error('Chat Graph: Vector search failed', error);
    return { retrievedContext: [] };
  }
}
