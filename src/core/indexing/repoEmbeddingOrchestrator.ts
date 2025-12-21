import * as path from 'path';
import { logger } from '../../shared/logger.js';
import { DatabaseService } from '../storage/databaseService.js';
import { PineconeService } from './pineconeService.js';
import { embedAndUpsertFile, EmbeddingPipelineConfig } from './fileEmbeddingPipeline.js';

/**
 * Orchestrates embedding of all files in a repository.
 * Handles file enumeration, error handling, and progress tracking.
 */
export class RepoEmbeddingOrchestrator {
  constructor(
    private databaseService: DatabaseService,
    private pineconeService: PineconeService
  ) {}

  /**
   * Embeds all indexed files in a repository.
   *
   * @param repoId Repository identifier
   * @param repoRoot Repository root directory
   * @param apiKey Google Gemini API key
   * @param pineconeIndexName Pinecone index name
   * @param config Pipeline configuration
   * @param onProgress Optional callback for progress updates
   * @returns Summary of embedding results
   */
  async embedRepository(
    repoId: string,
    repoRoot: string,
    apiKey: string,
    pineconeIndexName: string,
    config: EmbeddingPipelineConfig = {},
    onProgress?: (current: number, total: number, filePath: string) => void
  ): Promise<{
    totalFiles: number;
    successfulFiles: number;
    failedFiles: number;
    totalVectors: number;
    errors: Array<{ filePath: string; error: string }>;
  }> {
    logger.both.info(`[RepoEmbeddingOrchestrator] Starting embedding for repo: ${repoId}`);

    // 1. Get list of files to embed
    const files = await this.databaseService.getRepoFiles(repoId);
    if (files.length === 0) {
      logger.both.warn(`[RepoEmbeddingOrchestrator] No files found for repo: ${repoId}`);
      return {
        totalFiles: 0,
        successfulFiles: 0,
        failedFiles: 0,
        totalVectors: 0,
        errors: []
      };
    }

    logger.both.info(`[RepoEmbeddingOrchestrator] Found ${files.length} files to embed`);

    // 2. Process each file
    let successfulFiles = 0;
    let totalVectors = 0;
    const errors: Array<{ filePath: string; error: string }> = [];

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const absolutePath = path.join(repoRoot, filePath);

      onProgress?.(i + 1, files.length, filePath);

      try {
        const vectorCount = await embedAndUpsertFile(
          absolutePath,
          repoId,
          repoRoot,
          apiKey,
          this.pineconeService,
          pineconeIndexName,
          config
        );
        totalVectors += vectorCount;
        successfulFiles++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.both.error(`[RepoEmbeddingOrchestrator] Failed to embed ${filePath}: ${errorMsg}`);
        errors.push({ filePath, error: errorMsg });
      }
    }

    const failedFiles = files.length - successfulFiles;
    logger.both.info(
      `[RepoEmbeddingOrchestrator] Completed: ${successfulFiles}/${files.length} files, ${totalVectors} vectors upserted`
    );

    return {
      totalFiles: files.length,
      successfulFiles,
      failedFiles,
      totalVectors,
      errors
    };
  }
}

