/**
 * gatherContext node - Combined vector search + architecture loading.
 * This is the entry point for the HITL workflow.
 * Enhanced with file compression integration (PRD 003).
 */
import * as path from 'path';
import * as fs from 'fs';
import type { ExtensionContext } from 'vscode';
import type { Pool } from 'pg';
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
import { compressFilesForContext, isBinaryContent } from '../compression/fileCompressor.js';
import {
  calculateBudget,
  countTokens,
  createCompressionConfig,
  isCompressionNeeded,
} from '../compression/tokenBudget.js';

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
  pgPool: Pool
) {
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
  let repoArchitecture = '';
  try {
    const architectureRepo = new ArchitectureRepository(pgPool);
    const archData = await architectureRepo.getArchitectureByRepoId(repoId);
    
    if (archData) {
      repoArchitecture = archData.markdownTree;
      logger.both.info(`gatherContext: Loaded architecture document (${archData.markdownTree.length} chars)`);
    } else {
      logger.both.info('gatherContext: No architecture document found in DB');
    }
  } catch (error) {
    logger.both.warn('gatherContext: Failed to load architecture document', error);
  }

  // --- PRD 003: File Context Compression ---
  // After loading files, run through fileCompressor to fit within token budget
  const thresholdPercent = state.contextThresholdPercent || 80;
  const modelContextWindow = state.modelContextWindow || 200_000;

  const totalRawTokens = retrievedContext.reduce(
    (sum, ctx) => sum + countTokens(ctx.content),
    0
  );

  let compressionApplied = false;

  if (
    retrievedContext.length > 0 &&
    isCompressionNeeded(totalRawTokens, modelContextWindow, thresholdPercent)
  ) {
    onProgress('Compressing context files to fit token budget...');
    try {
      const budget = calculateBudget(modelContextWindow, thresholdPercent);

      // Filter out binary content before compression
      const textContextItems = retrievedContext.filter(
        (ctx) => !isBinaryContent(ctx.content)
      );

      const filesToCompress = textContextItems.map((ctx) => ({
        filePath: ctx.filePath,
        content: ctx.content,
      }));

      const compressedFiles = await compressFilesForContext(
        filesToCompress,
        budget.fileContext,
        state.goalText || state.userQuery
      );

      // Update retrieved context with compressed content
      for (const compressed of compressedFiles) {
        const match = retrievedContext.find(
          (ctx) => ctx.filePath === compressed.filePath
        );
        if (match && compressed.compressionLevel > 0) {
          match.content = compressed.compressedContent;
          compressionApplied = true;
        }
      }

      const totalCompressedTokens = retrievedContext.reduce(
        (sum, ctx) => sum + countTokens(ctx.content),
        0
      );

      logger.both.info(
        `gatherContext: File compression complete. ` +
        `Before: ${totalRawTokens} tokens, After: ${totalCompressedTokens} tokens, ` +
        `Saved: ${totalRawTokens - totalCompressedTokens} tokens`
      );
      onProgress(
        `Found ${retrievedContext.length} snippets (${compressionApplied ? 'compressed' : 'within budget'}).`
      );
    } catch (error) {
      logger.both.warn('gatherContext: File compression failed, using raw content', error);
    }
  }

  return {
    retrievedContext,
    repoArchitecture,
    dependencies,
    compressionApplied,
    currentTokenCount: retrievedContext.reduce(
      (sum, ctx) => sum + countTokens(ctx.content),
      0
    ),
    workflowPhase: 'gathering' as const,
  };
}
