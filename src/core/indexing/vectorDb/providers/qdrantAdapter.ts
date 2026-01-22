import type { VectorDbQueryResult, Vector, VectorDbAdapter, IndexMetadata } from '../types.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';

// Deterministic ID generation for vectors - matches embedding pipeline pattern
function generateVectorId(repoId: string, filePath: string, chunkIndex: number, text: string): string {
    const NAMESPACE = '9b9f8f7e-6e5d-4c3b-a2a1-f0e9d8c7b6a5'; // Fixed UUID namespace
    const name = `${repoId}:${filePath}:${chunkIndex}:${text.substring(0, 100)}`;
    return uuidv5(name, NAMESPACE);
}

export class QdrantAdapter implements VectorDbAdapter {
    readonly provider = 'qdrant' as const;
    private client: QdrantClient;

    constructor(
        private readonly baseUrl: string,
        private readonly apiKey: string | undefined,
        private readonly collection: string
    ) {
        // Validate configuration
        if (!baseUrl || !collection) {
            throw new Error('QdrantAdapter requires baseUrl and collection');
        }

        // Check if this is a hosted instance (not localhost/127.0.0.1)
        const isHostedInstance = !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1');

        if (isHostedInstance && !apiKey) {
            throw new Error(
                'Qdrant API key is required for hosted instances. ' +
                'Please configure your API key in the extension settings.'
            );
        }

        this.client = new QdrantClient({
            url: baseUrl,
            apiKey: apiKey
        });
    }

    async upsertVectors(args: { repoId: string; vectors: Vector[] }): Promise<void> {
        if (!args.vectors || args.vectors.length === 0) {
            return;
        }

        // Ensure all vectors have deterministic IDs and proper metadata
        const points = args.vectors.map(v => {
            // Generate deterministic ID if not already a valid UUID
            const id = v.id && v.id.length === 36 ? v.id : generateVectorId(
                args.repoId,
                v.metadata.filePath,
                v.metadata.chunkIndex,
                v.metadata.textHash || ''
            );

            return {
                id,
                vector: v.values,
                payload: {
                    repoId: args.repoId,
                    ...v.metadata
                }
            };
        });

        try {
            await this.client.upsert(this.collection, {
                wait: true,
                points: points
            });
        } catch (error) {
            console.error('QdrantAdapter: Failed to upsert vectors', {
                collection: this.collection,
                repoId: args.repoId,
                vectorCount: args.vectors.length,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to upsert vectors to Qdrant: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async queryVectors(args: { repoId: string; vector: number[]; topK: number }): Promise<VectorDbQueryResult> {
        try {
            const searchResult = await this.client.search(this.collection, {
                vector: args.vector,
                limit: args.topK,
                filter: {
                    must: [
                        {
                            key: 'repoId',
                            match: {
                                value: args.repoId
                            }
                        }
                    ]
                },
                with_payload: true,
                with_vector: false
            });

            return {
                matches: searchResult.map(res => ({
                    id: res.id as string,
                    score: res.score,
                    metadata: res.payload
                }))
            };
        } catch (error) {
            console.error('QdrantAdapter: Failed to query vectors', {
                collection: this.collection,
                repoId: args.repoId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to query vectors from Qdrant: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async deleteRepo(args: { repoId: string }): Promise<void> {
        try {
            await this.client.delete(this.collection, {
                wait: true,
                filter: {
                    must: [
                        {
                            key: 'repoId',
                            match: {
                                value: args.repoId
                            }
                        }
                    ]
                }
            });
        } catch (error) {
            console.error('QdrantAdapter: Failed to delete repository vectors', {
                collection: this.collection,
                repoId: args.repoId,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to delete repository vectors from Qdrant: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async deleteVectorsForFile(args: { repoId: string; filePath: string }): Promise<void> {
        try {
            await this.client.delete(this.collection, {
                wait: true,
                filter: {
                    must: [
                        {
                            key: 'repoId',
                            match: {
                                value: args.repoId
                            }
                        },
                        {
                            key: 'filePath',
                            match: {
                                value: args.filePath
                            }
                        }
                    ]
                }
            });
        } catch (error) {
            console.error('QdrantAdapter: Failed to delete file vectors', {
                collection: this.collection,
                repoId: args.repoId,
                filePath: args.filePath,
                error: error instanceof Error ? error.message : String(error)
            });
            throw new Error(`Failed to delete file vectors from Qdrant: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async describeRepoStats(args: { repoId: string }): Promise<{ vectorCount?: number } | null> {
        try {
            const countResult = await this.client.count(this.collection, {
                filter: {
                    must: [
                        {
                            key: 'repoId',
                            match: {
                                value: args.repoId
                            }
                        }
                    ]
                }
            });
            return { vectorCount: countResult.count };
        } catch (error) {
            console.error('QdrantAdapter: Failed to get repository stats', {
                collection: this.collection,
                repoId: args.repoId,
                error: error instanceof Error ? error.message : String(error)
            });
            // Return null instead of throwing to match interface signature
            return null;
        }
    }

    async getIndexMetadata(args: { repoId: string }): Promise<IndexMetadata | null> {
        try {
            const collectionInfo = await this.client.getCollection(this.collection);
            const stats = await this.describeRepoStats(args);

            // Extract dimension from vector config
            const vectorsConfig = collectionInfo.config?.params?.vectors;
            let dimension: number;

            if (typeof vectorsConfig === 'object' && vectorsConfig !== null && 'size' in vectorsConfig) {
                dimension = (vectorsConfig as { size: number }).size;
            } else {
                console.warn('QdrantAdapter: Could not determine dimension from collection config');
                return null;
            }

            // Extract distance metric
            let metric: string | undefined;
            if (typeof vectorsConfig === 'object' && vectorsConfig !== null && 'distance' in vectorsConfig) {
                metric = String((vectorsConfig as { distance: string }).distance).toLowerCase();
            }

            return {
                dimension,
                count: stats?.vectorCount ?? 0,
                metric,
            };
        } catch (error) {
            console.error('QdrantAdapter: Failed to get index metadata', {
                collection: this.collection,
                repoId: args.repoId,
                error: error instanceof Error ? error.message : String(error)
            });
            return null;  // Fail-safe: return null on error
        }
    }

    async deleteIndex(args: { repoId: string }): Promise<void> {
        // Use existing deleteRepo which does filtered deletion
        await this.deleteRepo(args);
    }
}
