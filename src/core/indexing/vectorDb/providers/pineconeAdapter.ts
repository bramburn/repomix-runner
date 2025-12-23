import { Pinecone } from '@pinecone-database/pinecone';
import { PineconeService } from '../../pineconeService.js';
import type { VectorDbAdapter, VectorDbQueryResult } from '../types.js';

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
}