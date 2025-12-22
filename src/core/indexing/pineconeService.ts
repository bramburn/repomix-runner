import { Pinecone, Index } from '@pinecone-database/pinecone';

/**
 * Metadata attached to each vector in Pinecone.
 * Includes repo scoping and chunk information for filtering and debugging.
 */
export interface VectorMetadata {
  // Required: Repository identifier for scoping
  repoId: string;

  // Required: File path relative to repo root
  filePath: string;

  // Required: Index of this chunk within the file
  chunkIndex: number;

  // Optional: Starting line number of the chunk
  startLine?: number;

  // Optional: Ending line number of the chunk
  endLine?: number;

  // Optional: Source system identifier (e.g., "repomix")
  source?: string;

  // Optional: SHA256 hash of chunk text for integrity checking
  textHash?: string;

  // Optional: ISO timestamp of when this vector was created/updated
  updatedAt?: string;

  // Optional: Additional metadata for future use
  [key: string]: any;
}

export interface Vector {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

export class PineconeService {
  private client: Pinecone | null = null;
  private currentApiKey: string | null = null;
  private clientFactory: (config: { apiKey: string }) => Pinecone;

  constructor(clientFactory?: (config: { apiKey: string }) => Pinecone) {
    this.clientFactory = clientFactory || ((config) => new Pinecone(config));
  }

  private async getClient(apiKey: string): Promise<Pinecone> {
    if (this.client && this.currentApiKey === apiKey) {
      return this.client;
    }

    this.client = this.clientFactory({ apiKey });
    this.currentApiKey = apiKey;
    return this.client;
  }

  /**
   * Upserts vectors to the specified index, scoped to the repository via namespace.
   * Ensures that essential metadata (repoId) is attached to every vector.
   */
  async upsertVectors(
    apiKey: string,
    indexName: string,
    repoId: string,
    vectors: Vector[]
  ): Promise<void> {
    const client = await this.getClient(apiKey);
    const index = client.index(indexName);

    // Ensure all vectors have the repoId in metadata as a fail-safe
    const scopedVectors = vectors.map(v => ({
      ...v,
      metadata: {
        ...v.metadata,
        repoId // Enforce repoId in metadata
      }
    }));

    // Use the repoId as the namespace for strict isolation
    await index.namespace(repoId).upsert(scopedVectors);
  }

  /**
   * Queries vectors from the specified index, scoped to the repository via namespace.
   */
  async queryVectors(
    apiKey: string,
    indexName: string,
    repoId: string,
    vector: number[],
    topK: number = 10
  ) {
    const client = await this.getClient(apiKey);
    const index = client.index(indexName);

    const result = await index.namespace(repoId).query({
      vector,
      topK,
      includeMetadata: true
    });

    return result;
  }

  /**
   * Deletes all vectors associated with the repository.
   *
   * Used when destroying the entire index for a repository.
   * This will remove ALL vectors in the repository's namespace.
   *
   * @param apiKey - Pinecone API key
   * @param indexName - Name of the Pinecone index
   * @param repoId - Repository identifier (used as namespace)
   */
  async deleteRepo(
    apiKey: string,
    indexName: string,
    repoId: string
  ): Promise<void> {
    const client = await this.getClient(apiKey);
    const index = client.index(indexName);

    await index.namespace(repoId).deleteAll();
  }

  /**
   * Deletes all vectors for a specific file within a repository.
   *
   * CRITICAL for incremental re-embedding (Option 1: delete-then-upsert):
   *
   * When a file changes, we must FIRST delete its old vectors before
   * re-upserting new ones. If we skip this step, Pinecone will accumulate
   * duplicate vectors for the same file, leading to:
   * - Bloated storage usage
   * - Stale search results (old content showing up)
   * - Increased query costs
   *
   * How it works:
   * 1. First tries Pinecone's metadata filtering feature (works on pod-based and newer serverless)
   * 2. If metadata filtering fails (e.g., on older serverless indexes), falls back to ID-based deletion
   * 3. Filters by filePath within the repo's namespace
   * 4. Deletes ALL matching vectors (all chunks for the file)
   *
   * Important note on metadata filtering:
   * This relies on vectors having `filePath` in their metadata.
   * The upsert pipeline ensures this is always included.
   *
   * Fallback mechanism:
   * Some serverless indexes don't yet support delete-by-metadata. In those cases,
   * we list vectors by ID prefix and delete them by ID instead.
   *
   * @param apiKey - Pinecone API key
   * @param indexName - Name of the Pinecone index
   * @param repoId - Repository identifier (used as namespace)
   * @param filePath - Repo-relative file path to delete vectors for
   *
   * @example
   * // Before re-embedding a changed file
   * await pineconeService.deleteVectorsForFile(
   *   apiKey,
   *   'my-index',
   *   'git:github.com/user/repo',
   *   'src/components/Button.tsx'
   * );
   * // Now safe to re-embed new vectors for this file
   */
  async deleteVectorsForFile(
    apiKey: string,
    indexName: string,
    repoId: string,
    filePath: string
  ): Promise<void> {
    const deleteStart = Date.now();

    console.log(`[PineconeService] deleteVectorsForFile: Starting...`);
    console.log(`[PineconeService]   Index: ${indexName}`);
    console.log(`[PineconeService]   Repo: ${repoId}`);
    console.log(`[PineconeService]   File: ${filePath}`);

    const client = await this.getClient(apiKey);
    const index = client.index(indexName);

    try {
      // Try metadata-based deletion first (works on pod-based and newer serverless indexes)
      console.log(`[PineconeService] Attempting metadata-based deletion...`);
      await index.namespace(repoId).deleteMany({
        filter: {
          filePath: { "$eq": filePath }
        }
      });

      const deleteDuration = Date.now() - deleteStart;
      console.log(`[PineconeService] deleteVectorsForFile: Complete via metadata filter (${deleteDuration}ms)`);
    } catch (error) {
      // Fallback to ID-based deletion for serverless indexes that don't support metadata filtering
      console.log(`[PineconeService] Metadata-based deletion failed, attempting ID-based fallback...`);
      console.log(`[PineconeService]   Error from metadata filter:`, (error as any)?.message);

      try {
        await this.deleteVectorsForFileByIdPrefix(apiKey, indexName, repoId, filePath);
        const deleteDuration = Date.now() - deleteStart;
        console.log(`[PineconeService] deleteVectorsForFile: Complete via ID-based fallback (${deleteDuration}ms)`);
      } catch (fallbackError) {
        const deleteDuration = Date.now() - deleteStart;
        console.error(`[PineconeService] deleteVectorsForFile: Both methods failed after ${deleteDuration}ms`);
        console.error(`[PineconeService]   Metadata filter error:`, error);
        console.error(`[PineconeService]   ID-based fallback error:`, fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Fallback method to delete vectors by ID prefix.
   * Used when metadata-based deletion is not supported (e.g., older serverless indexes).
   *
   * Vector IDs follow the format: {repoId}:{filePath}:{chunkIndex}:{shortHash}
   * We construct the prefix and list all matching vectors, then delete them by ID.
   *
   * @param apiKey - Pinecone API key
   * @param indexName - Name of the Pinecone index
   * @param repoId - Repository identifier (used as namespace)
   * @param filePath - Repo-relative file path to delete vectors for
   */
  private async deleteVectorsForFileByIdPrefix(
    apiKey: string,
    indexName: string,
    repoId: string,
    filePath: string
  ): Promise<void> {
    const client = await this.getClient(apiKey);
    const index = client.index(indexName);
    const namespace = index.namespace(repoId);

    // Construct the ID prefix: {repoId}:{filePath}:
    // This will match all chunks for this file
    const idPrefix = `${repoId}:${filePath}:`;

    console.log(`[PineconeService] Listing vectors with ID prefix: ${idPrefix}`);

    const vectorIds: string[] = [];
    let paginationToken: string | undefined;
    let pageCount = 0;

    // List all vectors with the matching ID prefix
    try {
      do {
        pageCount++;
        const listResponse = await namespace.listPaginated({
          prefix: idPrefix,
          paginationToken,
          limit: 100 // Pinecone's max limit per page
        });

        if (listResponse.vectors) {
          vectorIds.push(...listResponse.vectors.map(v => v.id));
          console.log(`[PineconeService] Listed page ${pageCount}: ${listResponse.vectors.length} vectors`);
        }

        paginationToken = listResponse.pagination?.next;
      } while (paginationToken);

      console.log(`[PineconeService] Total vectors found for deletion: ${vectorIds.length}`);

      // Delete vectors in batches (Pinecone has limits on delete batch size)
      const batchSize = 100;
      for (let i = 0; i < vectorIds.length; i += batchSize) {
        const batch = vectorIds.slice(i, i + batchSize);
        console.log(`[PineconeService] Deleting batch ${Math.floor(i / batchSize) + 1}: ${batch.length} vectors`);
        await namespace.deleteMany(batch);
      }

      console.log(`[PineconeService] Successfully deleted ${vectorIds.length} vectors by ID prefix`);
    } catch (error) {
      console.error(`[PineconeService] Error during ID-based deletion:`, error);
      throw new Error(`Failed to delete vectors by ID prefix: ${(error as any)?.message}`);
    }
  }
}
