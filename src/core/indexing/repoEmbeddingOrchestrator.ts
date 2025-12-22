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
    const orchestratorStart = Date.now();
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Starting embedding process for repo: ${repoId}`);

    logger.both.info(`[RepoEmbeddingOrchestrator] Starting embedding for repo: ${repoId}`);

    // 1. Get list of files to embed
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Fetching files from database for repo: ${repoId}`);
    const dbFetchStart = Date.now();
    const files = await this.databaseService.getRepoFiles(repoId);
    const dbFetchDuration = Date.now() - dbFetchStart;
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Fetched ${files.length} files from database in ${dbFetchDuration}ms`);

    if (files.length === 0) {
      console.log(`[REPO_EMBEDDING_ORCHESTRATOR] No files found for repo: ${repoId}`);
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
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Starting to process ${files.length} files...`);
    let successfulFiles = 0;
    let totalVectors = 0;
    const errors: Array<{ filePath: string; error: string }> = [];
    let fileProcessingTime = 0;
    const fileTimes: Array<{ file: string; time: number; vectors: number }> = [];

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const absolutePath = path.join(repoRoot, filePath);
      const fileStart = Date.now();

      onProgress?.(i + 1, files.length, filePath);

      // Log every 20th file to avoid too much output
      if ((i + 1) % 20 === 0 || i === 0 || i === files.length - 1) {
        console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Processing file ${i + 1}/${files.length}: ${filePath}`);
      }

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

        const fileTime = Date.now() - fileStart;
        fileProcessingTime += fileTime;
        fileTimes.push({ file: filePath, time: fileTime, vectors: vectorCount });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[REPO_EMBEDDING_ORCHESTRATOR] Failed to embed ${filePath}: ${errorMsg}`);
        logger.both.error(`[RepoEmbeddingOrchestrator] Failed to embed ${filePath}: ${errorMsg}`);
        errors.push({ filePath, error: errorMsg });
      }
    }

    const failedFiles = files.length - successfulFiles;
    const orchestratorDuration = Date.now() - orchestratorStart;

    // Calculate some statistics
    const avgTimePerFile = successfulFiles > 0 ? Math.round(fileProcessingTime / successfulFiles) : 0;
    const avgVectorsPerFile = successfulFiles > 0 ? Math.round(totalVectors / successfulFiles) : 0;

    // Show slowest files (top 5)
    const slowestFiles = fileTimes
      .sort((a, b) => b.time - a.time)
      .slice(0, 5)
      .map(f => `${f.file} (${f.time}ms, ${f.vectors} vectors)`);

    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Processing completed in ${orchestratorDuration}ms`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Statistics:`);
    console.log(`  - Total files: ${files.length}`);
    console.log(`  - Successful: ${successfulFiles}`);
    console.log(`  - Failed: ${failedFiles}`);
    console.log(`  - Total vectors: ${totalVectors}`);
    console.log(`  - Average time per file: ${avgTimePerFile}ms`);
    console.log(`  - Average vectors per file: ${avgVectorsPerFile}`);
    if (slowestFiles.length > 0) {
      console.log(`  - Slowest files: ${slowestFiles.join(', ')}`);
    }

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

