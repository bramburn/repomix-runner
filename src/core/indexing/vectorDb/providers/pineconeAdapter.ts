import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeService } from '../../pineconeService.js';
import type { VectorDbAdapter, VectorDbQueryResult, IndexMetadata } from '../types.js';

export class PineconeAdapter implements VectorDbAdapter {
  provider: 'pinecone' = 'pinecone';

  constructor(
    private readonly cfg: { apiKey: string; indexName: string; host?: string },
    private readonly svc = new PineconeService()
  ) {}

  async upsertVectors(args: { repoId: string; vectors: any[] }) {
    await this.svc.upsertVectors(this.cfg.apiKey, this.cfg.indexName, args.repoId, args.vectors);
  }

  async queryVectors(args: { repoId: string; vector: number[]; topK: number }): Promise<VectorDbQueryResult> {
    const response = await this.svc.queryVectors(
      this.cfg.apiKey,
      this.cfg.indexName,
      args.repoId,
      args.vector,
      args.topK
    );

    return {
      matches: (response.matches || []).map((m) => ({
        id: m.id,
        score: m.score ?? 0,
        metadata: m.metadata,
      })),
    };
  }

  async deleteRepo(args: { repoId: string }) {
    await this.svc.deleteRepo(this.cfg.apiKey, this.cfg.indexName, args.repoId);
  }

  async deleteVectorsForFile(args: { repoId: string; filePath: string }) {
    await this.svc.deleteVectorsForFile(this.cfg.apiKey, this.cfg.indexName, args.repoId, args.filePath);
  }

  async describeRepoStats(args: { repoId: string }) {
    // mirrors handleGetRepoVectorCount but returned as data
    const pc = new Pinecone({ apiKey: this.cfg.apiKey });
    const index = this.cfg.host ? pc.index(this.cfg.indexName, this.cfg.host) : pc.index(this.cfg.indexName);
    const stats = await index.describeIndexStats();
    const count =
      (stats as any)?.namespaces?.[args.repoId]?.vectorCount ??
      (stats as any)?.namespaces?.[args.repoId]?.recordCount ??
      0;
    return { vectorCount: count };
  }

  async getIndexMetadata(args: { repoId: string }): Promise<IndexMetadata | null> {
    try {
      const pc = new Pinecone({ apiKey: this.cfg.apiKey });
      const indexDescription = await pc.describeIndex(this.cfg.indexName);
      const stats = await this.describeRepoStats(args);

      // Dimension must be present for a valid index
      if (indexDescription.dimension === undefined) {
        console.warn('PineconeAdapter: Index dimension not available');
        return null;
      }

      return {
        dimension: indexDescription.dimension,
        count: stats?.vectorCount ?? 0,
        metric: indexDescription.metric,
      };
    } catch (error) {
      console.error('PineconeAdapter: Failed to get index metadata', error);
      return null;  // Fail-safe: return null on error
    }
  }

  async deleteIndex(args: { repoId: string }): Promise<void> {
    // Delete namespace (repo-level), not entire index
    await this.svc.deleteRepo(this.cfg.apiKey, this.cfg.indexName, args.repoId);
  }
}