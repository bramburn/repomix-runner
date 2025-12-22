import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { logger } from '../../shared/logger.js';
import { DatabaseService } from '../storage/databaseService.js';
import { PineconeService } from './pineconeService.js';
import { embedAndUpsertFile, EmbeddingPipelineConfig, DEFAULT_MAX_CONCURRENT_FILES } from './fileEmbeddingPipeline.js';

/**
 * Compute SHA256 hash of a file for content change detection
 */
function sha256File(absPath: string): string {
  const buf = fs.readFileSync(absPath);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Orchestrates embedding of all files in a repository.
 * Handles file enumeration, error handling, and progress tracking.
 */
export class RepoEmbeddingOrchestrator {
  constructor(
    private databaseService: DatabaseService,
    private pineconeService: PineconeService
  ) { }

  /**
   * Embeds all indexed files in a repository.
   *
   * @param repoId Repository identifier
   * @param repoRoot Repository root directory
   * @param googleApiKey Google Gemini API key
   * @param pineconeApiKey Pinecone API key
   * @param pineconeIndexName Pinecone index name
   * @param config Pipeline configuration
   * @param onProgress Optional callback for progress updates
   * @returns Summary of embedding results
   */
  async embedRepository(
    repoId: string,
    repoRoot: string,
    googleApiKey: string,
    pineconeApiKey: string,
    pineconeIndexName: string,
    config: EmbeddingPipelineConfig = {},
    onProgress?: (current: number, total: number, filePath: string) => void,
    signal?: AbortSignal
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

    // 2. Determine concurrency level
    const maxConcurrentFiles = config.maxConcurrentFiles ?? DEFAULT_MAX_CONCURRENT_FILES;
    const useConcurrentProcessing = maxConcurrentFiles > 1;

    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Processing ${files.length} files with concurrency: ${maxConcurrentFiles}`);

    // 3. Process files (concurrently or sequentially)
    let successfulFiles = 0;
    let totalVectors = 0;
    const errors: Array<{ filePath: string; error: string }> = [];
    const fileTimes: Array<{ file: string; time: number; vectors: number }> = [];

    if (useConcurrentProcessing) {
      // Concurrent processing
      const concurrentResults = await this.processFilesConcurrently(
        files,
        repoRoot,
        repoId,
        googleApiKey,
        pineconeApiKey,
        pineconeIndexName,
        config,
        maxConcurrentFiles,
        onProgress,
        signal
      );

      for (const result of concurrentResults) {
        if (result.success) {
          successfulFiles++;
          totalVectors += result.vectors;
          fileTimes.push({ file: result.filePath, time: result.time, vectors: result.vectors });
        } else {
          errors.push({ filePath: result.filePath, error: result.error || 'Unknown error' });
        }
      }
    } else {
      // Sequential processing (original behavior)
      for (let i = 0; i < files.length; i++) {
        // Check for abort before starting next file (graceful stop)
        if (signal?.aborted) {
          throw new Error('Aborted');
        }

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
            googleApiKey,
            pineconeApiKey,
            this.pineconeService,
            pineconeIndexName,
            config,
            signal
          );

          totalVectors += vectorCount;
          successfulFiles++;

          const fileTime = Date.now() - fileStart;
          fileTimes.push({ file: filePath, time: fileTime, vectors: vectorCount });
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          // If aborted, re-throw to signal caller
          const errorName =
            error instanceof Error
              ? error.name
              : typeof error === 'object' && error !== null && 'name' in error
                ? String((error as any).name)
                : '';

          if (errorMsg === 'Aborted' || errorName === 'AbortError') {
            throw error;
          }
          console.error(`[REPO_EMBEDDING_ORCHESTRATOR] Failed to embed ${filePath}: ${errorMsg}`);
          logger.both.error(`[RepoEmbeddingOrchestrator] Failed to embed ${filePath}: ${errorMsg}`);
          errors.push({ filePath, error: errorMsg });
        }
      }
    }

    const failedFiles = files.length - successfulFiles;
    const orchestratorDuration = Date.now() - orchestratorStart;

    // Calculate some statistics
    const fileProcessingTime = fileTimes.reduce((sum, f) => sum + f.time, 0);
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

  /**
   * Embeds only files that are marked as pending for re-indexing.
   *
   * This method implements INCREMENTAL re-embedding for the background file watcher.
   * Unlike embedRepository() which processes all files, this only handles files
   * that have changed since the last full index.
   *
   * WHY THIS EXISTS:
   * When a developer saves a file, we want to update the search index with the
   * new content WITHOUT re-embedding the entire repository (which could take hours).
   *
   * PROCESS (delete-then-upsert pattern):
   * ┌─────────────────────────────────────────────────────────────────┐
   * │ 1. Fetch pending files from database (marked by file watcher)    │
   * │ 2. For each pending file:                                       │
   * │    a. Check if file exists (mark deleted if missing)            │
   * │    b. DELETE old vectors from Pinecone (prevents duplicates)    │
   * │    c. Embed the file content into vectors                        │
   * │    d. Upsert new vectors to Pinecone                            │
   * │    e. Mark file as 'indexed' with SHA256 hash                   │
   * │ 3. Return summary of results                                    │
   * └─────────────────────────────────────────────────────────────────┘
   *
   * CRITICAL: The delete-then-upsert pattern is essential because:
   * - Vector IDs include content hash (not just file path)
   * - When content changes, IDs change → old vectors become orphans
   * - Without deletion, we accumulate stale vectors forever
   *
   * @param repoId - Repository identifier (e.g., "git:github.com/user/repo")
   * @param repoRoot - Absolute path to repository root
   * @param googleApiKey - Google Gemini API key for embeddings
   * @param pineconeApiKey - Pinecone API key for vector operations
   * @param pineconeIndexName - Name of the Pinecone index
   * @param config - Pipeline configuration (chunking, concurrency, etc.)
   * @param onProgress - Optional callback for progress updates (current, total, filePath)
   * @param signal - Optional AbortSignal for cancellation (graceful stop)
   * @returns Summary with totalFiles, successfulFiles, failedFiles, totalVectors, errors
   *
   * @example
   * // Called by background watcher after files change
   * const result = await orchestrator.embedPendingFiles(
   *   repoId,
   *   repoRoot,
   *   googleApiKey,
   *   pineconeApiKey,
   *   'my-index',
   *   { maxConcurrentFiles: 2 } // Conservative for background
   * );
   * console.log(`Re-embedded ${result.successfulFiles} files`);
   */
  async embedPendingFiles(
    repoId: string,
    repoRoot: string,
    googleApiKey: string,
    pineconeApiKey: string,
    pineconeIndexName: string,
    config: EmbeddingPipelineConfig = {},
    onProgress?: (current: number, total: number, filePath: string) => void,
    signal?: AbortSignal
  ): Promise<{
    totalFiles: number;
    successfulFiles: number;
    failedFiles: number;
    totalVectors: number;
    errors: Array<{ filePath: string; error: string }>;
  }> {
    const orchestrationStart = Date.now();

    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] ===== EMBED PENDING FILES START =====`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Repo: ${repoId}`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Root: ${repoRoot}`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Index: ${pineconeIndexName}`);

    // Step 1: Fetch all files marked as pending in the database
    // These are files that the background watcher detected as changed
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Step 1: Fetching pending files from database...`);
    const pending = await this.databaseService.getPendingRepoFiles(repoId);

    if (pending.length === 0) {
      console.log(`[REPO_EMBEDDING_ORCHESTRATOR] No pending files found - nothing to do`);
      console.log(`[REPO_EMBEDDING_ORCHESTRATOR] ===== EMBED PENDING FILES COMPLETE (skip) =====`);
      logger.both.info(`[RepoEmbeddingOrchestrator] No pending files for repo: ${repoId}`);
      return { totalFiles: 0, successfulFiles: 0, failedFiles: 0, totalVectors: 0, errors: [] };
    }

    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Step 1 complete: Found ${pending.length} pending files`);
    if (pending.length <= 10) {
      console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Files:`, pending);
    } else {
      console.log(`[REPO_EMBEDDING_ORCHESTRATOR] First 10:`, pending.slice(0, 10), `... and ${pending.length - 10} more`);
    }

    // Log configuration
    const concurrency = config.maxConcurrentFiles ?? 1;
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Configuration: concurrency=${concurrency} (sequential for background)`);

    logger.both.info(`[RepoEmbeddingOrchestrator] Embedding ${pending.length} pending files for repo: ${repoId}`);

    // Step 2: Process each pending file
    let successfulFiles = 0;
    let totalVectors = 0;
    const errors: Array<{ filePath: string; error: string }> = [];
    const fileTimes: Array<{ file: string; time: number; vectors: number }> = [];

    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Step 2: Processing pending files...`);

    for (let i = 0; i < pending.length; i++) {
      // Check for abort signal (graceful cancellation)
      if (signal?.aborted) {
        console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Abort signal received - stopping...`);
        throw new Error('Aborted');
      }

      const filePath = pending[i];
      const absolutePath = path.join(repoRoot, filePath);
      const fileStart = Date.now();

      // Report progress to caller (for UI updates)
      onProgress?.(i + 1, pending.length, filePath);

      console.log(`[REPO_EMBEDDING_ORCHESTRATOR] --- [${i + 1}/${pending.length}] ${filePath} ---`);

      try {
        // 2a. Check if file still exists (might have been deleted after being queued)
        if (!fs.existsSync(absolutePath)) {
          console.log(`[REPO_EMBEDDING_ORCHESTRATOR] File not found (likely deleted), marking as deleted: ${filePath}`);
          await this.databaseService.markRepoFileDeleted(repoId, filePath);
          continue; // Skip to next file
        }

        // 2b. Delete old vectors before re-upserting (CRITICAL - prevents duplicates)
        // This uses Pinecone's metadata filtering to delete all vectors for this file
        console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Deleting old vectors...`);
        const deleteStart = Date.now();
        await this.pineconeService.deleteVectorsForFile(
          pineconeApiKey,
          pineconeIndexName,
          repoId,
          filePath
        );
        const deleteDuration = Date.now() - deleteStart;
        console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Old vectors deleted (${deleteDuration}ms)`);

        // 2c. Embed the file and upsert new vectors
        console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Embedding file...`);
        const embedStart = Date.now();
        const vectorCount = await embedAndUpsertFile(
          absolutePath,
          repoId,
          repoRoot,
          googleApiKey,
          pineconeApiKey,
          this.pineconeService,
          pineconeIndexName,
          config,
          signal
        );
        const embedDuration = Date.now() - embedStart;

        totalVectors += vectorCount;
        successfulFiles++;

        const fileTime = Date.now() - fileStart;
        fileTimes.push({ file: filePath, time: fileTime, vectors: vectorCount });

        console.log(`[REPO_EMBEDDING_ORCHESTRATOR] File embedded: ${vectorCount} vectors in ${embedDuration}ms (total: ${fileTime}ms)`);

        // 2d. Mark as indexed with content hash (SHA256)
        // The hash allows future optimizations (skip re-embedding if unchanged)
        const contentHash = sha256File(absolutePath);
        const hashPreview = contentHash.substring(0, 8) + '...';
        await this.databaseService.markRepoFileIndexed(repoId, filePath, contentHash);
        console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Marked as indexed (hash: ${hashPreview})`);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const errorName = error instanceof Error ? error.name : '';

        // If aborted, re-throw to signal caller
        if (errorMsg === 'Aborted' || errorName === 'AbortError') {
          console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Processing aborted`);
          throw error;
        }

        // Log error but continue with next file
        console.error(`[REPO_EMBEDDING_ORCHESTRATOR] Failed to embed ${filePath}: ${errorMsg}`);
        errors.push({ filePath, error: errorMsg });
      }
    }

    // Step 3: Calculate and report results
    const failedFiles = pending.length - successfulFiles;
    const orchestrationDuration = Date.now() - orchestrationStart;

    // Calculate statistics
    const avgTimePerFile = successfulFiles > 0 ? Math.round(fileTimes.reduce((sum, f) => sum + f.time, 0) / successfulFiles) : 0;
    const avgVectorsPerFile = successfulFiles > 0 ? Math.round(totalVectors / successfulFiles) : 0;
    const slowestFiles = fileTimes.sort((a, b) => b.time - a.time).slice(0, 3);

    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] ===== EMBED PENDING FILES COMPLETE =====`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Results:`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR]   - Total pending: ${pending.length}`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR]   - Successful: ${successfulFiles}`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR]   - Failed: ${failedFiles}`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR]   - Total vectors: ${totalVectors}`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR]   - Total time: ${orchestrationDuration}ms`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR]   - Avg time per file: ${avgTimePerFile}ms`);
    console.log(`[REPO_EMBEDDING_ORCHESTRATOR]   - Avg vectors per file: ${avgVectorsPerFile}`);
    if (slowestFiles.length > 0) {
      console.log(`[REPO_EMBEDDING_ORCHESTRATOR]   - Slowest files:`, slowestFiles.map(f => `${f.file} (${f.time}ms)`));
    }

    if (errors.length > 0) {
      console.error(`[REPO_EMBEDDING_ORCHESTRATOR] Errors (${errors.length}):`, errors);
    }

    logger.both.info(
      `[RepoEmbeddingOrchestrator] Incremental embedding complete: ${successfulFiles}/${pending.length} files, ${totalVectors} vectors, ${orchestrationDuration}ms`
    );

    return { totalFiles: pending.length, successfulFiles, failedFiles, totalVectors, errors };
  }

  /**
   * Process multiple files concurrently with a limit on concurrent operations.
   *
   * @param files Array of file paths to process
   * @param repoRoot Repository root directory
   * @param repoId Repository identifier
   * @param googleApiKey Google Gemini API key
   * @param pineconeApiKey Pinecone API key
   * @param pineconeIndexName Pinecone index name
   * @param config Pipeline configuration
   * @param concurrency Maximum number of concurrent file operations
   * @param onProgress Optional callback for progress updates
   * @param signal Optional AbortSignal for cancellation
   * @returns Array of processing results
   */
  private async processFilesConcurrently(
    files: string[],
    repoRoot: string,
    repoId: string,
    googleApiKey: string,
    pineconeApiKey: string,
    pineconeIndexName: string,
    config: EmbeddingPipelineConfig,
    concurrency: number,
    onProgress?: (current: number, total: number, filePath: string) => void,
    signal?: AbortSignal
  ): Promise<Array<{ success: boolean; filePath: string; vectors: number; time: number; error?: string }>> {
    const results: Array<{ success: boolean; filePath: string; vectors: number; time: number; error?: string }> = new Array(files.length);
    let currentIndex = 0;
    let completedCount = 0;
    const pineconeService = this.pineconeService;


    const processNext = async (): Promise<void> => {
      while (currentIndex < files.length) {
        // Check for abort before claiming next file (graceful stop)
        if (signal?.aborted) {
          break; // Exit loop, don't start new files
        }

        const index = currentIndex++;
        const filePath = files[index];
        const absolutePath = path.join(repoRoot, filePath);
        const fileStart = Date.now();

        // Log every 20th file to avoid too much output
        const currentCount = ++completedCount;
        if (currentCount % 20 === 0 || currentCount === 1 || currentCount === files.length) {
          console.log(`[REPO_EMBEDDING_ORCHESTRATOR] Processing file ${currentCount}/${files.length}: ${filePath}`);
        }

        onProgress?.(currentCount, files.length, filePath);

        try {
          const vectorCount = await embedAndUpsertFile(
            absolutePath,
            repoId,
            repoRoot,
            googleApiKey,
            pineconeApiKey,
            pineconeService,
            pineconeIndexName,
            config,
            signal
          );

          const fileTime = Date.now() - fileStart;
          results[index] = { success: true, filePath, vectors: vectorCount, time: fileTime };
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          // If aborted, don't mark as failed - abort is intentional
          const errorName =
            error instanceof Error
              ? error.name
              : typeof error === 'object' && error !== null && 'name' in error
                ? String((error as any).name)
                : '';

          if (errorMsg === 'Aborted' || errorName === 'AbortError') {
            break; // Exit the loop
          }
          console.error(`[REPO_EMBEDDING_ORCHESTRATOR] Failed to embed ${filePath}: ${errorMsg}`);
          const fileTime = Date.now() - fileStart;
          results[index] = { success: false, filePath, vectors: 0, time: fileTime, error: errorMsg };
        }
      }
    }

    // Create worker pool
    const workers = Array.from({ length: Math.min(concurrency, files.length) }, () => processNext());
    await Promise.all(workers);

    return results;
  }
}

