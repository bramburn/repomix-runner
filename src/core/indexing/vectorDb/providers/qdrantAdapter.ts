import type { VectorDbAdapter, VectorDbQueryResult } from '../types.js';

export class QdrantAdapter implements VectorDbAdapter {
  provider: 'qdrant' = 'qdrant';

  constructor(private readonly cfg: { baseUrl: string; apiKey?: string; collection: string }) {}

  // NOTE: implement with your preferred Qdrant client later.
  // Keeping methods present so the rest of the app compiles once wiring is done.

  async upsertVectors(_args: { repoId: string; vectors: any[] }): Promise<void> {
    throw new Error('QdrantAdapter.upsertVectors not implemented');
  }

  async queryVectors(_args: { repoId: string; vector: number[]; topK: number }): Promise<VectorDbQueryResult> {
    throw new Error('QdrantAdapter.queryVectors not implemented');
  }

  async deleteRepo(_args: { repoId: string }): Promise<void> {
    throw new Error('QdrantAdapter.deleteRepo not implemented');
  }

  async deleteVectorsForFile(_args: { repoId: string; filePath: string }): Promise<void> {
    throw new Error('QdrantAdapter.deleteVectorsForFile not implemented');
  }

  async describeRepoStats(_args: { repoId: string }) {
    return null;
  }
}


