/**
 * gatherContext node - Combined vector search + architecture loading.
 * This is the entry point for the HITL workflow.
 */
import * as path from 'path';
import * as fs from 'fs';
import type { ExtensionContext } from 'vscode';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import { getVectorDbAdapterForRepo } from '../../core/indexing/vectorDb/factory.js';
import { embeddingService } from '../../core/indexing/embeddingService.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import { GitService } from '../../git/GitService.js';
import { ArchitectureRepository } from '../db/architectureRepository.js';
import {
  getWorkspaceRoot,
  loadSnippet,
  type RetrievedContextItem,
  type ProgressCallback,
} from './utils.js';

/**
 * Extracts dependencies from package.json if present.
 */
async function extractDependencies(workspaceRoot: string): Promise<Record<string, string>> {
  const packageJsonPath = path.join(workspaceRoot, 'package.json');
  try {
    if (fs.existsSync(packageJsonPath)) {
      const content = await fs.promises.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      return {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
    }
  } catch (error) {
    logger.both.warn('gatherContext: Failed to read package.json', error);
  }
  return {};
}

export async function gatherContextNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback,
  signal?: AbortSignal
) {
  // Check abort signal before starting
  if (signal?.aborted) {
    const err = new Error('Operation cancelled');
    err.name = 'AbortError';
    throw err;
  }

  onProgress('Gathering context from codebase...');

  const workspaceFolder = getWorkspaceRoot();
  if (!workspaceFolder) {
    logger.both.warn('gatherContext: No workspace folder found.');
    return {
      retrievedContext: [],
      repoArchitecture: '',
      dependencies: {},
      workflowPhase: 'gathering' as const,
    };
  }

  // Extract dependencies
  const dependencies = await extractDependencies(workspaceFolder);

  // Get repo ID
  let repoId: string;
  try {
    repoId = await getRepoId(workspaceFolder);
  } catch (error) {
    logger.both.warn('gatherContext: Failed to determine repo ID.', error);
    return {
      retrievedContext: [],
      repoArchitecture: '',
      dependencies,
      workflowPhase: 'gathering' as const,
    };
  }

  // Vector search
  const queries = [state.userQuery];
  const retrievedContext: RetrievedContextItem[] = [];

  try {
    const { adapter } = await getVectorDbAdapterForRepo(extensionContext, repoId);
    const gitService = new GitService();
    const branchName = await gitService.getCurrentBranch(workspaceFolder);

    onProgress('Searching codebase for relevant context...');

    const allResults = await Promise.all(
      queries.map(async (query) => {
        // Check abort signal before each search
        if (signal?.aborted) {
          throw new Error('AbortError: Operation cancelled');
        }
        
        const vector = await embeddingService.embedText(query, 'chat', true);
        return adapter.queryVectors({
          repoId,
          vector,
          topK: 10,
          groupBy: 'filePath',
          branchName,
        });
      })
    );

    const rawMatches = allResults.flatMap((result) =>
      result.groupedMatches?.length ? result.groupedMatches : result.matches
    );

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
  } catch (error) {
    logger.both.error('gatherContext: Vector search failed', error);
  }

  // Load repo architecture from ArchitectureRepository (PRD 008)
  // Uses the global chatPgPool set during extension activation
  let repoArchitecture = '';
  const pgPool = (global as any).chatPgPool;

  if (pgPool) {
    try {
      const architectureRepo = new ArchitectureRepository(pgPool);
      const archData = await architectureRepo.getArchitectureByRepoId(repoId);

      if (archData && archData.expiresAt > Date.now()) {
        // Document exists and is fresh — use it
        repoArchitecture = archData.markdownTree;
        logger.both.info(`gatherContext: Loaded architecture document (${archData.markdownTree.length} chars)`);
      } else {
        // Document missing or expired — trigger architecture generation (PRD 008 Atomic Action #10)
        logger.both.info('gatherContext: Architecture document missing or expired, triggering generation...');
        onProgress('Generating architecture document...');

        try {
          const { executeArchitectureGeneration } = await import('../architecture/architectureGraph.js');
          const result = await executeArchitectureGeneration(
            workspaceFolder,
            repoId,
            {
              pgPool,
              secrets: extensionContext.secrets,
            },
            (msg: string) => onProgress(`Architecture: ${msg}`)
          );

          if (result.markdownDocument) {
            repoArchitecture = result.markdownDocument;
            logger.both.info(`gatherContext: Architecture document generated (${repoArchitecture.length} chars)`);
          }
        } catch (genError) {
          logger.both.warn('gatherContext: Architecture generation failed, continuing without it', genError);

          // If generation failed but stale data exists, use stale data as fallback
          if (archData) {
            repoArchitecture = archData.markdownTree;
            logger.both.info('gatherContext: Using stale architecture document as fallback');
          }
        }
      }
    } catch (error) {
      logger.both.warn('gatherContext: Failed to load architecture document', error);
    }
  } else {
    logger.both.warn('gatherContext: No PostgreSQL pool available, skipping architecture loading');
  }

  return {
    retrievedContext,
    repoArchitecture,
    dependencies,
    workflowPhase: 'gathering' as const,
  };
}
