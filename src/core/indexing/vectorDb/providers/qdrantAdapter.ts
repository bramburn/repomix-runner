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
            apiKey: apiKey,
            timeout: 30000,  // 30 second timeout for all operations
            checkCompatibility: false  // Disable version compatibility check to prevent warnings
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

    async queryVectors(args: { 
        repoId: string; 
        vector: number[]; 
        topK: number; 
        scoreThreshold?: number;
        groupBy?: string;
        groupSize?: number;
    }): Promise<VectorDbQueryResult> {
        try {
            // Use searchPointGroups when groupBy is specified
            if (args.groupBy) {
                const searchResult = await this.client.searchPointGroups(this.collection, {
                    vector: args.vector,
                    limit: args.topK,
                    group_by: args.groupBy,  // Field to group by (e.g., 'filePath')
                    group_size: args.groupSize ?? 1,  // Results per group
                    score_threshold: args.scoreThreshold,
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

                // Transform grouped results to flat matches format
                const groupedMatches: Array<{ id: string; score: number; metadata?: any; groupId: string }> = [];
                
                for (const group of searchResult.groups) {
                    for (const hit of group.hits) {
                        groupedMatches.push({
                            id: hit.id as string,
                            score: hit.score,
                            metadata: hit.payload,
                            groupId: String(group.id)  // The grouping key (e.g., filePath)
                        });
                    }
                }

                return {
                    matches: [], // Legacy field - keep empty when using grouping
                    groupedMatches
                };
            } else {
                // Existing behavior for non-grouped queries
                const searchResult = await this.client.search(this.collection, {
                    vector: args.vector,
                    limit: args.topK,
                    score_threshold: args.scoreThreshold,
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
            }
        } catch (error) {
            console.error('QdrantAdapter: Failed to query vectors', {
                collection: this.collection,
                repoId: args.repoId,
                groupBy: args.groupBy,
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
            // Only log as warning since this is a non-critical operation
            console.warn('QdrantAdapter: Failed to get repository stats', {
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
            // Only log as warning since this is a non-critical metadata operation
            console.warn('QdrantAdapter: Failed to get index metadata', {
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
