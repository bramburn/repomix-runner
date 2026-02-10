export type VectorDbProvider = 'pinecone' | 'qdrant';

export type Vector = {
  id: string;
  values: number[];
  metadata: any;
};

export type VectorDbQueryResult = {
  matches: Array<{ id: string; score: number; metadata?: any }>;
  groupedMatches?: Array<{ 
    id: string; 
    score: number; 
    metadata?: any;
    groupId: string;  // New field for group identifier
  }>;
};

export interface IndexMetadata {
  dimension: number;
  count: number;
  metric?: string;  // 'cosine', 'euclidean', 'dotproduct'
}

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
    scoreThreshold?: number;
    groupBy?: string;  // NEW: Optional grouping field
    groupSize?: number; // NEW: Number of results per group (default: 1)
  }): Promise<VectorDbQueryResult>;

  deleteRepo(args: { repoId: string }): Promise<void>;

  deleteVectorsForFile(args: { repoId: string; filePath: string }): Promise<void>;

  describeRepoStats?(args: { repoId: string }): Promise<{ vectorCount?: number } | null>;

  getIndexMetadata?(args: { repoId: string }): Promise<IndexMetadata | null>;

  deleteIndex(args: { repoId: string }): Promise<void>;
}

