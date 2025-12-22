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
  '.obj', '.lib', '.pdb', '.idb', '.suo', '.sln', '.dmg', '.pkg'
]);

/**
 * List of text-based file extensions to process
 */
const TEXT_EXTENSIONS = new Set([
  // Code files
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.dart',
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.styl',
  '.xml', '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
  '.sql', '.graphql', '.gql', '.md', '.mdx', '.txt', '.log',
  // Config files
  '.env', '.gitignore', '.dockerfile', 'dockerfile.yml', 'dockerfile.yaml',
  // Package files
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'composer.json', 'requirements.txt', 'Pipfile', 'poetry.lock',
  'Cargo.toml', 'Cargo.lock', 'pom.xml', 'build.gradle'
]);

/**
 * Check if a file is likely a binary file
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();

  // Check against known binary extensions
  if (BINARY_EXTENSIONS.has(ext)) {
    return true;
  }

  // Check against known text files
  if (TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has(basename)) {
    return false;
  }

  // Common text files without extensions
  if (basename === 'readme' || basename === 'license' || basename === 'changelog') {
    return false;
  }

  // If no extension, assume it's binary (conservative approach)
  if (!ext) {
    return true;
  }

  // Unknown extensions - assume binary for safety
  return true;
}

/**
 * Configuration for the embedding pipeline.
 */
export interface EmbeddingPipelineConfig {
  chunkingConfig?: ChunkingConfig;
  embeddingBatchSize?: number;
  pineconeUpsertBatchSize?: number;
}

const DEFAULT_EMBEDDING_BATCH_SIZE = 10;
const DEFAULT_PINECONE_BATCH_SIZE = 50;

/**
 * Embeds a single file and upserts vectors to Pinecone.
 *
 * Flow: Read file → Check Language → Chunk (with token estimation for non-AST files) → Embed → Upsert
 *
 * @param filePath Absolute path to file
 * @param repoId Repository identifier
 * @param repoRoot Repository root directory
 * @param apiKey Google Gemini API key
 * @param pineconeService Pinecone service instance
 * @param indexName Pinecone index name
 * @param config Pipeline configuration
 * @returns Number of vectors upserted
 */
export async function embedAndUpsertFile(
  filePath: string,
  repoId: string,
  repoRoot: string,
  apiKey: string,
  pineconeService: PineconeService,
  indexName: string,
  config: EmbeddingPipelineConfig = {}
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

    // 2. Determine chunking strategy based on language support
    const language = TreeSitterService.detectLanguage(relativeFilePath);
    const isASTSupported = language && TreeSitterService.isLanguageSupported(language);

    // Configure chunking based on file type and language
    const chunkingConfig: ChunkingConfig = {
      ...config.chunkingConfig,
      filePath: relativeFilePath,
      useSemanticChunking: isASTSupported, // Enable semantic chunking for supported languages
      useTokenEstimation: !isASTSupported // Use token estimation for non-AST files
    };

    console.log(`[EMBEDDING_PIPELINE] Language: ${language || 'unknown'}, AST supported: ${isASTSupported}, semantic chunking: ${chunkingConfig.useSemanticChunking}`);

    // 3. Chunk the content
    console.log(`[EMBEDDING_PIPELINE] Chunking content...`);
    const chunkStart = Date.now();
    const chunks = await chunkText(content, chunkingConfig);
    const chunkDuration = Date.now() - chunkStart;
    console.log(`[EMBEDDING_PIPELINE] Chunking completed in ${chunkDuration}ms, generated ${chunks.length} chunks`);

    if (chunks.length === 0) {
      console.log(`[EMBEDDING_PIPELINE] No chunks generated for ${relativeFilePath}`);
      logger.both.warn(`${context}: No chunks generated`);
      return 0;
    }

    logger.both.info(`${context}: Generated ${chunks.length} chunks`);

    // 4. Embed chunks in batches
    const embeddingBatchSize = config.embeddingBatchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE;
    const chunkBatches = batchArray(chunks, embeddingBatchSize);
    const vectors: Vector[] = [];
    let totalEmbeddingTime = 0;

    console.log(`[EMBEDDING_PIPELINE] Starting embedding for ${chunkBatches.length} batches (batch size: ${embeddingBatchSize})`);

    for (let batchIdx = 0; batchIdx < chunkBatches.length; batchIdx++) {
      const batch = chunkBatches[batchIdx];
      const texts = batch.map(c => c.text);
      const batchTextSize = texts.reduce((sum, text) => sum + text.length, 0);

      console.log(`[EMBEDDING_PIPELINE] Processing embedding batch ${batchIdx + 1}/${chunkBatches.length} (${texts.length} chunks, ${batchTextSize} chars)`);
      const embedStart = Date.now();

      const embeddings = await retryWithBackoff(
        () => embeddingService.embedTexts(apiKey, texts),
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
          updatedAt: new Date().toISOString()
        };

        vectors.push({
          id: vectorId,
          values: embedding,
          metadata
        });
      }
    }

    console.log(`[EMBEDDING_PIPELINE] Total embedding time: ${totalEmbeddingTime}ms for ${vectors.length} vectors`);

    // 5. Upsert vectors to Pinecone in batches
    const upsertBatchSize = config.pineconeUpsertBatchSize ?? DEFAULT_PINECONE_BATCH_SIZE;
    const vectorBatches = batchArray(vectors, upsertBatchSize);
    let totalUpsertTime = 0;

    console.log(`[EMBEDDING_PIPELINE] Starting Pinecone upsert for ${vectorBatches.length} batches (batch size: ${upsertBatchSize})`);

    for (let batchIdx = 0; batchIdx < vectorBatches.length; batchIdx++) {
      const batch = vectorBatches[batchIdx];
      console.log(`[EMBEDDING_PIPELINE] Upserting batch ${batchIdx + 1}/${vectorBatches.length} (${batch.length} vectors)`);
      const upsertStart = Date.now();

      await retryWithBackoff(
        () => pineconeService.upsertVectors(apiKey, indexName, repoId, batch),
        `${context}:upsert[batch ${batchIdx + 1}/${vectorBatches.length}]`,
        { maxRetries: 2 }
      );

      const upsertDuration = Date.now() - upsertStart;
      totalUpsertTime += upsertDuration;
      console.log(`[EMBEDDING_PIPELINE] Upsert batch ${batchIdx + 1} completed in ${upsertDuration}ms`);
    }

    const totalDuration = Date.now() - startTime;
    console.log(`[EMBEDDING_PIPELINE] Completed ${relativeFilePath} in ${totalDuration}ms (read: ${readDuration}ms, chunk: ${chunkDuration}ms, embed: ${totalEmbeddingTime}ms, upsert: ${totalUpsertTime}ms)`);
    logger.both.info(`${context}: Successfully upserted ${vectors.length} vectors`);
    return vectors.length;
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    console.error(`[EMBEDDING_PIPELINE] Failed ${relativeFilePath} after ${totalDuration}ms:`, error);
    logger.both.error(`${context}: Failed`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

