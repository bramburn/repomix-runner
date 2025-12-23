// -----------------------------------------------------------------------------
// 2) src/core/indexing/fileEmbeddingPipeline.ts
// -----------------------------------------------------------------------------
import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../shared/logger.js';
import { chunkText, ChunkingConfig } from './textChunker.js';
import { generateVectorId, computeTextHash } from './vectorIdentity.js';
import { embeddingService } from './embeddingService.js';
import { PineconeService, Vector, VectorMetadata } from './pineconeService.js';
import { retryWithBackoff, batchArray } from './retryService.js';
import { TreeSitterService } from './treeSitterService.js';

/**
 * List of binary file extensions to skip during embedding
 */
const BINARY_EXTENSIONS = new Set([
  // Executables
  '.exe', '.dll', '.so', '.dylib', '.app', '.bin',
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg', '.webp',
  // Videos
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm',
  // Audio
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a',
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
  // Documents (binary formats)
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // Fonts
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  // Other binary files
  '.sqlite', '.db', '.jar', '.war', '.ear', '.class', '.pyc', '.pyo',
  '.obj', '.lib', '.pdb', '.idb', '.suo', '.sln', '.dmg', '.pkg',
]);

/**
 * Known text basenames (including dotfiles) that often have NO extension.
 * NOTE: Node's path.extname('.gitignore') is '' (so we must whitelist by basename).
 */
const TEXT_BASENAMES = new Set([
  // Docs
  'readme', 'license', 'changelog',

  // Build / tooling
  'makefile', 'dockerfile', 'podfile', 'gemfile', 'fastfile', 'appfile', 'brewfile',

  // iOS / CocoaPods
  'podfile.lock',

  // Python
  'pipfile', 'pipfile.lock', 'requirements.txt',

  // Rust
  'cargo.toml', 'cargo.lock',

  // JS
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',

  // Java / Android
  'gradle.properties', 'settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts',

  // Dotfiles
  '.env', '.env.local', '.env.development', '.env.production', '.env.test',
  '.gitignore', '.gitattributes', '.gitmodules',
  '.editorconfig', '.npmrc', '.nvmrc',
  '.prettierrc', '.prettierignore', '.eslintrc', '.eslintignore',
].map((s) => s.toLowerCase()));

/**
 * List of text-based file extensions to process
 */
const TEXT_EXTENSIONS = new Set([
  // Code files
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.kts', '.scala', '.dart',
  '.m', '.mm',

  // Web / markup
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.styl',
  '.xml',

  // Data / config
  '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.properties', '.env',
  '.plist', '.xcconfig', '.pbxproj',
  '.sql', '.graphql', '.gql', '.proto',

  // Docs / plain text
  '.md', '.mdx', '.txt', '.log',

  // Shell / scripts
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
]);

/**
 * Check if a file is likely a binary file.
 * Strategy:
 * - Known binary extensions => binary
 * - Known text extensions or known text basenames (including dotfiles) => text
 * - No extension => text ONLY if basename is in TEXT_BASENAMES
 * - Unknown extension => assume binary (conservative)
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();

  if (BINARY_EXTENSIONS.has(ext)) return true;

  if (TEXT_EXTENSIONS.has(ext)) return false;

  // Basename whitelist (covers extensionless + dotfiles)
  if (TEXT_BASENAMES.has(basename)) return false;

  // Common text files without extensions
  if (basename === 'readme' || basename === 'license' || basename === 'changelog') return false;

  // If no extension, default to binary unless whitelisted above
  if (!ext) return true;

  // Unknown extensions - assume binary for safety
  return true;
}

export interface EmbeddingPipelineConfig {
  chunkingConfig?: ChunkingConfig;
  embeddingBatchSize?: number;
  pineconeUpsertBatchSize?: number;
  maxConcurrentFiles?: number;
  maxConcurrentBatches?: number;
  maxConcurrentUpserts?: number;
}

export const DEFAULT_EMBEDDING_BATCH_SIZE = 10;
export const DEFAULT_PINECONE_BATCH_SIZE = 50;
export const DEFAULT_MAX_CONCURRENT_FILES = 3;
export const DEFAULT_MAX_CONCURRENT_BATCHES = 2;
export const DEFAULT_MAX_CONCURRENT_UPSERTS = 2;

async function processConcurrently<T, R>(
  items: T[],
  handler: (item: T, index: number) => Promise<R>,
  concurrency: number,
  onProgress?: (index: number, total: number) => void
): Promise<Array<{ success: boolean; result?: R; error?: string; index: number }>> {
  const results: Array<{ success: boolean; result?: R; error?: string; index: number }> = new Array(items.length);
  let currentIndex = 0;

  async function processNext(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      onProgress?.(index, items.length);

      try {
        const result = await handler(items[index], index);
        results[index] = { success: true, result, index };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results[index] = { success: false, error: errorMsg, index };
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => processNext());
  await Promise.all(workers);

  return results;
}

export async function embedAndUpsertFile(
  filePath: string,
  repoId: string,
  repoRoot: string,
  googleApiKey: string,
  pineconeApiKey: string,
  pineconeService: PineconeService,
  indexName: string,
  config: EmbeddingPipelineConfig = {},
  signal?: AbortSignal
): Promise<number> {
  const startTime = Date.now();
  const relativeFilePath = path.relative(repoRoot, filePath);
  const context = `embedAndUpsertFile[${relativeFilePath}]`;
  console.log(`[EMBEDDING_PIPELINE] Starting processing: ${relativeFilePath}`);

  // 0. Check if file is binary and skip if so
  if (isBinaryFile(relativeFilePath)) {
    console.log(`[EMBEDDING_PIPELINE] Skipping binary file: ${relativeFilePath}`);
    logger.both.info(`${context}: Skipping binary file`);
    return 0;
  }

  try {
    // 1. Read file content
    console.log(`[EMBEDDING_PIPELINE] Reading file: ${relativeFilePath}`);
    const readStart = Date.now();
    const content = await retryWithBackoff(
      () => fs.readFile(filePath, 'utf-8'),
      `${context}:readFile`,
      { maxRetries: 2 }
    );
    const readDuration = Date.now() - readStart;
    console.log(`[EMBEDDING_PIPELINE] File read in ${readDuration}ms, size: ${content.length} chars`);

    if (!content || content.trim().length === 0) {
      console.log(`[EMBEDDING_PIPELINE] Skipping empty file: ${relativeFilePath}`);
      logger.both.info(`${context}: Skipping empty file`);
      return 0;
    }

    if (signal?.aborted) throw new Error('Aborted');

    const language = TreeSitterService.detectLanguage(relativeFilePath);
    const isASTSupported = language && TreeSitterService.isLanguageSupported(language);

    const chunkingConfig: ChunkingConfig = {
      ...config.chunkingConfig,
      filePath: relativeFilePath,
      useSemanticChunking: isASTSupported || false,
      useTokenEstimation: !isASTSupported,
    };

    console.log(
      `[EMBEDDING_PIPELINE] Language: ${language || 'unknown'}, AST supported: ${isASTSupported}, semantic chunking: ${chunkingConfig.useSemanticChunking}`
    );

    console.log(`[EMBEDDING_PIPELINE] Chunking content...`);
    const chunkStart = Date.now();
    const chunks = await chunkText(content, chunkingConfig);
    const chunkDuration = Date.now() - chunkStart;
    console.log(`[EMBEDDING_PIPELINE] Chunking completed in ${chunkDuration}ms, generated ${chunks.length} chunks`);

    const validChunks = chunks.filter((c) => c.text.trim().length > 0);
    const emptyChunksCount = chunks.length - validChunks.length;
    if (emptyChunksCount > 0) console.log(`[EMBEDDING_PIPELINE] Filtered out ${emptyChunksCount} empty chunks`);

    if (validChunks.length === 0) {
      console.log(`[EMBEDDING_PIPELINE] No valid chunks (all empty/whitespace) for ${relativeFilePath}`);
      logger.both.warn(`${context}: No valid chunks after filtering`);
      return 0;
    }

    logger.both.info(`${context}: Generated ${validChunks.length} valid chunks`);

    if (signal?.aborted) throw new Error('Aborted');

    const embeddingBatchSize = config.embeddingBatchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE;
    const maxConcurrentBatches = config.maxConcurrentBatches ?? DEFAULT_MAX_CONCURRENT_BATCHES;
    const chunkBatches = batchArray(validChunks, embeddingBatchSize);
    const vectors: Vector[] = [];
    let totalEmbeddingTime = 0;

    console.log(
      `[EMBEDDING_PIPELINE] Starting embedding for ${chunkBatches.length} batches (batch size: ${embeddingBatchSize}, concurrency: ${maxConcurrentBatches})`
    );

    if (maxConcurrentBatches > 1 && chunkBatches.length > 1) {
      const batchResults = await processConcurrently(
        chunkBatches,
        async (batch, batchIdx) => {
          const texts = batch.map((c) => c.text);
          const batchTextSize = texts.reduce((sum, text) => sum + text.length, 0);

          console.log(
            `[EMBEDDING_PIPELINE] Processing embedding batch ${batchIdx + 1}/${chunkBatches.length} (${texts.length} chunks, ${batchTextSize} chars)`
          );
          const embedStart = Date.now();

          const embeddings = await retryWithBackoff(
            () => embeddingService.embedTexts(googleApiKey, texts),
            `${context}:embed[batch ${batchIdx + 1}/${chunkBatches.length}]`,
            { maxRetries: 2 }
          );

          const embedDuration = Date.now() - embedStart;
          console.log(`[EMBEDDING_PIPELINE] Embedding batch ${batchIdx + 1} completed in ${embedDuration}ms`);

          const batchVectors: Vector[] = [];
          for (let i = 0; i < batch.length; i++) {
            const chunk = batch[i];
            const embedding = embeddings[i];
            const vectorId = generateVectorId(repoId, relativeFilePath, chunk.chunkIndex, chunk.text);
            const metadata: VectorMetadata = {
              repoId,
              filePath: relativeFilePath,
              chunkIndex: chunk.chunkIndex,
              startLine: chunk.startLine,
              endLine: chunk.endLine,
              source: 'repomix',
              textHash: computeTextHash(chunk.text),
              updatedAt: new Date().toISOString(),
            };

            batchVectors.push({ id: vectorId, values: embedding, metadata });
          }

          return { vectors: batchVectors, duration: embedDuration };
        },
        maxConcurrentBatches
      );

      for (const result of batchResults) {
        if (result.success && result.result) {
          vectors.push(...result.result.vectors);
          totalEmbeddingTime += result.result.duration;
        }
      }
    } else {
      for (let batchIdx = 0; batchIdx < chunkBatches.length; batchIdx++) {
        const batch = chunkBatches[batchIdx];
        const texts = batch.map((c) => c.text);
        const batchTextSize = texts.reduce((sum, text) => sum + text.length, 0);

        console.log(
          `[EMBEDDING_PIPELINE] Processing embedding batch ${batchIdx + 1}/${chunkBatches.length} (${texts.length} chunks, ${batchTextSize} chars)`
        );
        const embedStart = Date.now();

        const embeddings = await retryWithBackoff(
          () => embeddingService.embedTexts(googleApiKey, texts),
          `${context}:embed[batch ${batchIdx + 1}/${chunkBatches.length}]`,
          { maxRetries: 2 }
        );

        const embedDuration = Date.now() - embedStart;
        totalEmbeddingTime += embedDuration;
        console.log(`[EMBEDDING_PIPELINE] Embedding batch ${batchIdx + 1} completed in ${embedDuration}ms`);

        for (let i = 0; i < batch.length; i++) {
          const chunk = batch[i];
          const embedding = embeddings[i];
          const vectorId = generateVectorId(repoId, relativeFilePath, chunk.chunkIndex, chunk.text);
          const metadata: VectorMetadata = {
            repoId,
            filePath: relativeFilePath,
            chunkIndex: chunk.chunkIndex,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            source: 'repomix',
            textHash: computeTextHash(chunk.text),
            updatedAt: new Date().toISOString(),
          };

          vectors.push({ id: vectorId, values: embedding, metadata });
        }
      }
    }

    console.log(`[EMBEDDING_PIPELINE] Total embedding time: ${totalEmbeddingTime}ms for ${vectors.length} vectors`);

    if (signal?.aborted) throw new Error('Aborted');

    const upsertBatchSize = config.pineconeUpsertBatchSize ?? DEFAULT_PINECONE_BATCH_SIZE;
    const maxConcurrentUpserts = config.maxConcurrentUpserts ?? DEFAULT_MAX_CONCURRENT_UPSERTS;
    const vectorBatches = batchArray(vectors, upsertBatchSize);
    let totalUpsertTime = 0;

    console.log(
      `[EMBEDDING_PIPELINE] Starting Pinecone upsert for ${vectorBatches.length} batches (batch size: ${upsertBatchSize}, concurrency: ${maxConcurrentUpserts})`
    );

    if (maxConcurrentUpserts > 1 && vectorBatches.length > 1) {
      const upsertResults = await processConcurrently(
        vectorBatches,
        async (batch, batchIdx) => {
          console.log(`[EMBEDDING_PIPELINE] Upserting batch ${batchIdx + 1}/${vectorBatches.length} (${batch.length} vectors)`);
          const upsertStart = Date.now();

          await retryWithBackoff(
            () => pineconeService.upsertVectors(pineconeApiKey, indexName, repoId, batch),
            `${context}:upsert[batch ${batchIdx + 1}/${vectorBatches.length}]`,
            { maxRetries: 2 }
          );

          const upsertDuration = Date.now() - upsertStart;
          console.log(`[EMBEDDING_PIPELINE] Upsert batch ${batchIdx + 1} completed in ${upsertDuration}ms`);
          return { duration: upsertDuration };
        },
        maxConcurrentUpserts
      );

      for (const result of upsertResults) {
        if (result.success && result.result) totalUpsertTime += result.result.duration;
      }
    } else {
      for (let batchIdx = 0; batchIdx < vectorBatches.length; batchIdx++) {
        const batch = vectorBatches[batchIdx];
        console.log(`[EMBEDDING_PIPELINE] Upserting batch ${batchIdx + 1}/${vectorBatches.length} (${batch.length} vectors)`);
        const upsertStart = Date.now();

        await retryWithBackoff(
          () => pineconeService.upsertVectors(pineconeApiKey, indexName, repoId, batch),
          `${context}:upsert[batch ${batchIdx + 1}/${vectorBatches.length}]`,
          { maxRetries: 2 }
        );

        const upsertDuration = Date.now() - upsertStart;
        totalUpsertTime += upsertDuration;
        console.log(`[EMBEDDING_PIPELINE] Upsert batch ${batchIdx + 1} completed in ${upsertDuration}ms`);
      }
    }

    if (signal?.aborted) throw new Error('Aborted');

    const totalDuration = Date.now() - startTime;
    console.log(
      `[EMBEDDING_PIPELINE] Completed ${relativeFilePath} in ${totalDuration}ms (read/chunk/embed/upsert timings available in logs)`
    );
    logger.both.info(`${context}: Successfully upserted ${vectors.length} vectors`);
    return vectors.length;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[EMBEDDING_PIPELINE] Failed ${relativeFilePath} after ${totalDuration}ms:`, error);
    logger.both.error(`${context}: Failed`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
