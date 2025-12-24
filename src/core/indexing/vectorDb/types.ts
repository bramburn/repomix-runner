export type VectorDbProvider = 'pinecone' | 'qdrant';

export type Vector = {
  id: string;
  values: number[];
  metadata: any;
};

export type VectorDbQueryResult = {
  matches: Array<{ id: string; score: number; metadata?: any }>;
};

export interface VectorDbAdapter {
  provider: VectorDbProvider;

  upsertVectors(args: {
    repoId: string;
    vectors: Array<{ id: string; values: number[]; metadata: any }>;
  }): Promise<void>;

  queryVectors(args: {
    repoId: string;
    vector: number[];
    topK: number;
  }): Promise<VectorDbQueryResult>;

  deleteRepo(args: { repoId: string }): Promise<void>;

  deleteVectorsForFile(args: { repoId: string; filePath: string }): Promise<void>;

  describeRepoStats?(args: { repoId: string }): Promise<{ vectorCount?: number } | null>;
}

