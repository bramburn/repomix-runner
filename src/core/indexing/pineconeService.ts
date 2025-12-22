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
}
