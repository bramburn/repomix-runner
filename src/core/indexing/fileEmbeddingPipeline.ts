import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from '../../shared/logger.js';
import { chunkText, ChunkingConfig } from './textChunker.js';
import { generateVectorId, computeTextHash } from './vectorIdentity.js';
import { embeddingService } from './embeddingService.js';
import { PineconeService, Vector, VectorMetadata } from './pineconeService.js';
import { retryWithBackoff, batchArray } from './retryService.js';

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
 * Flow: Read file → Chunk → Embed → Upsert
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
  const relativeFilePath = path.relative(repoRoot, filePath);
  const context = `embedAndUpsertFile[${relativeFilePath}]`;

  try {
    // 1. Read file content
    const content = await retryWithBackoff(
      () => fs.readFile(filePath, 'utf-8'),
      `${context}:readFile`,
      { maxRetries: 2 }
    );

    // 2. Chunk the content
    const chunks = chunkText(content, config.chunkingConfig);
    if (chunks.length === 0) {
      logger.both.warn(`${context}: No chunks generated`);
      return 0;
    }

    logger.both.info(`${context}: Generated ${chunks.length} chunks`);

    // 3. Embed chunks in batches
    const embeddingBatchSize = config.embeddingBatchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE;
    const chunkBatches = batchArray(chunks, embeddingBatchSize);
    const vectors: Vector[] = [];

    for (let batchIdx = 0; batchIdx < chunkBatches.length; batchIdx++) {
      const batch = chunkBatches[batchIdx];
      const texts = batch.map(c => c.text);

      const embeddings = await retryWithBackoff(
        () => embeddingService.embedTexts(apiKey, texts),
        `${context}:embed[batch ${batchIdx + 1}/${chunkBatches.length}]`,
        { maxRetries: 2 }
      );

      for (let i = 0; i < batch.length; i++) {
        const chunk = batch[i];
        const embedding = embeddings[i];
        const vectorId = generateVectorId(repoId, relativeFilePath, chunk.chunkIndex, chunk.text);
        const metadata: VectorMetadata = {
          repoId,
          filePath: relativeFilePath,
          chunkIndex: chunk.chunkIndex,
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

    // 4. Upsert vectors to Pinecone in batches
    const upsertBatchSize = config.pineconeUpsertBatchSize ?? DEFAULT_PINECONE_BATCH_SIZE;
    const vectorBatches = batchArray(vectors, upsertBatchSize);

    for (let batchIdx = 0; batchIdx < vectorBatches.length; batchIdx++) {
      const batch = vectorBatches[batchIdx];
      await retryWithBackoff(
        () => pineconeService.upsertVectors(apiKey, indexName, repoId, batch),
        `${context}:upsert[batch ${batchIdx + 1}/${vectorBatches.length}]`,
        { maxRetries: 2 }
      );
    }

    logger.both.info(`${context}: Successfully upserted ${vectors.length} vectors`);
    return vectors.length;
  } catch (error) {
    logger.both.error(`${context}: Failed`, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

