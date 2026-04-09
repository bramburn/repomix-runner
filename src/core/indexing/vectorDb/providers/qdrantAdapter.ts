import type { VectorDbQueryResult, Vector, VectorDbAdapter, IndexMetadata } from '../types.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';

// Deterministic ID generation for vectors - matches embedding pipeline pattern
function generateVectorId(repoId: string, branchName: string | undefined, filePath: string, chunkIndex: number, text: string): string {
    const NAMESPACE = '9b9f8f7e-6e5d-4c3b-a2a1-f0e9d8c7b6a5'; // Fixed UUID namespace
    const name = `${repoId}:${branchName ?? ''}:${filePath}:${chunkIndex}:${text.substring(0, 100)}`;
    return uuidv5(name, NAMESPACE);
}

export class QdrantAdapter implements VectorDbAdapter {
    readonly provider = 'qdrant' as const;
    private client: QdrantClient;

    constructor(
        private readonly baseUrl: string,
        private readonly apiKey: string | undefined,
        private readonly collection: string,
        private readonly dimension?: number
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

    /**
     * Ensures a collection exists with the correct dimension.
     * Creates the collection if it doesn't exist, or throws if dimension mismatches.
     *
     * @param collectionName - Name of the collection
     * @param dimension - Expected vector dimension
     * @throws Error if collection exists with wrong dimension
     */
    async ensureCollection(collectionName: string, dimension: number): Promise<void> {
        try {
            const collectionInfo = await this.client.getCollection(collectionName);

            // Collection exists - check dimension
            const vectorsConfig = collectionInfo.config?.params?.vectors;
            let actualDim: number | undefined;

            if (typeof vectorsConfig === 'object' && vectorsConfig !== null && 'size' in vectorsConfig) {
                actualDim = (vectorsConfig as { size: number }).size;
            }

            if (actualDim !== undefined && actualDim !== dimension) {
                throw new Error(
                    `Collection '${collectionName}' exists with dimension ${actualDim} but expected ${dimension}. ` +
                    `Please delete the collection or re-index with correct embedding config.`
                );
            }

            console.log(`[QdrantAdapter] Collection "${collectionName}" exists with correct dimension ${dimension}`);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);

            // If error is not "not found", re-throw dimension mismatch errors
            if (!errorMsg.toLowerCase().includes('not found') && !errorMsg.includes('404')) {
                if (errorMsg.includes('exists with dimension')) {
                    throw error;
                }
                // Log other errors but continue to try creation
                console.warn(`[QdrantAdapter] Could not verify collection "${collectionName}":`, errorMsg);
            }

            // Collection doesn't exist - create it
            console.log(`[QdrantAdapter] Creating collection "${collectionName}" with ${dimension} dimensions...`);
            try {
                await this.client.createCollection(collectionName, {
                    vectors: {
                        size: dimension,
                        distance: 'Cosine'
                    }
                });
                console.log(`[QdrantAdapter] Collection "${collectionName}" created successfully`);
            } catch (createError) {
                const createErrorMsg = createError instanceof Error ? createError.message : String(createError);
                // Check if collection was created by another process between our check and create
                if (createErrorMsg.includes('already exists') || createErrorMsg.includes('409')) {
                    console.log(`[QdrantAdapter] Collection "${collectionName}" was created by another process`);
                    return;
                }
                throw createError;
            }
        }
    }

    async upsertVectors(args: { repoId: string; vectors: Vector[]; dimension?: number }): Promise<void> {
        if (!args.vectors || args.vectors.length === 0) {
            return;
        }

        // Use dimension from args if provided, otherwise fall back to instance dimension (set by factory)
        const effectiveDimension = args.dimension ?? this.dimension;

        // Ensure collection exists before upserting (only if dimension is known)
        if (effectiveDimension !== undefined) {
            await this.ensureCollection(this.collection, effectiveDimension);
        }

        // Ensure all vectors have deterministic IDs and proper metadata
        const points = args.vectors.map(v => {
            // Generate deterministic ID if not already a valid UUID
            const id = v.id && v.id.length === 36 ? v.id : generateVectorId(
                args.repoId,
                v.metadata.branch_name,
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

        // Pre-flight validation: Check collection exists and validate dimensions
        try {
            const collectionInfo = await this.client.getCollection(this.collection);
            
            // Extract expected dimension from collection config
            const vectorsConfig = collectionInfo.config?.params?.vectors;
            let expectedDim: number | undefined;
            
            if (typeof vectorsConfig === 'object' && vectorsConfig !== null && 'size' in vectorsConfig) {
                expectedDim = (vectorsConfig as { size: number }).size;
            }

            if (expectedDim !== undefined) {
                // Validate all vectors have correct dimension
                for (const point of points) {
                    if (point.vector.length !== expectedDim) {
                        throw new Error(
                            `Vector dimension mismatch: collection "${this.collection}" expects ${expectedDim} dimensions, ` +
                            `but vector "${point.id}" has ${point.vector.length} dimensions. ` +
                            `Please ensure your embedding provider configuration matches the collection dimension.`
                        );
                    }
                    
                    // Validate vector values are valid numbers
                    if (!point.vector.every(v => typeof v === 'number' && !isNaN(v) && isFinite(v))) {
                        throw new Error(
                            `Invalid vector values in point "${point.id}": contains NaN or Infinity. ` +
                            `This may indicate an issue with the embedding provider.`
                        );
                    }
                }

                console.log(`[QdrantAdapter] Pre-flight validation passed: ${points.length} vectors, ${expectedDim} dimensions`);
            } else {
                console.warn(`[QdrantAdapter] Could not determine collection dimension, skipping validation`);
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes('dimension mismatch')) {
                // Re-throw dimension mismatch errors
                throw error;
            }
            if (error instanceof Error && error.message.includes('Invalid vector values')) {
                // Re-throw validation errors
                throw error;
            }
            // Collection might not exist or getCollection failed
            const collectionError = error instanceof Error ? error.message : String(error);
            if (collectionError.toLowerCase().includes('not found') || collectionError.includes('404')) {
                throw new Error(
                    `Collection "${this.collection}" does not exist in Qdrant. ` +
                    `Please open Settings tab and click "Test Connection" to create it with the correct dimensions.`
                );
            }
            // Log other collection check errors but continue (may be transient)
            console.warn(`[QdrantAdapter] Collection validation warning:`, collectionError);
        }

        try {
            await this.client.upsert(this.collection, {
                wait: true,
                points: points
            });
        } catch (error) {
            // Enhanced error logging with full API response details
            const errorDetails: any = {
                collection: this.collection,
                repoId: args.repoId,
                vectorCount: args.vectors.length,
                errorType: error instanceof Error ? error.constructor.name : typeof error,
                errorMessage: error instanceof Error ? error.message : String(error)
            };

            // Log sample vector for debugging (first vector only)
            if (points.length > 0) {
                const sample = points[0];
                errorDetails.sampleVector = {
                    id: sample.id,
                    dimension: sample.vector.length,
                    metadataKeys: Object.keys(sample.payload || {}),
                    hasValidValues: sample.vector.every(v => typeof v === 'number' && !isNaN(v) && isFinite(v))
                };
            }

            // Extract additional error details if available
            if (error && typeof error === 'object') {
                const err = error as any;
                if (err.status) errorDetails.httpStatus = err.status;
                if (err.statusText) errorDetails.statusText = err.statusText;
                if (err.response) errorDetails.apiResponse = err.response;
                if (err.code) errorDetails.errorCode = err.code;
            }

            console.error('QdrantAdapter: Failed to upsert vectors', errorDetails);

            // Provide specific error messages based on error type
            let errorMessage = `Failed to upsert vectors to Qdrant: ${error instanceof Error ? error.message : String(error)}`;
            
            if (error instanceof Error) {
                const msg = error.message.toLowerCase();
                if (msg.includes('not found') || msg.includes('404')) {
                    errorMessage = `Collection "${this.collection}" does not exist in Qdrant. Please use the Settings tab to create it.`;
                } else if (msg.includes('dimension') || msg.includes('422')) {
                    errorMessage = `Vector dimension mismatch for collection "${this.collection}". Check that your embedding provider matches the collection configuration.`;
                } else if (msg.includes('bad request') || msg.includes('400')) {
                    errorMessage = `Bad request to Qdrant collection "${this.collection}". This may indicate dimension mismatch or invalid vector data. Check the console for details.`;
                }
            }

            throw new Error(errorMessage);
        }
    }

    async queryVectors(args: { 
        repoId: string; 
        vector: number[]; 
        topK: number; 
        scoreThreshold?: number;
        groupBy?: string;
        groupSize?: number;
        branchName?: string;
    }): Promise<VectorDbQueryResult> {
        try {
            const mustFilters: any[] = [
                {
                    key: 'repoId',
                    match: {
                        value: args.repoId
                    }
                }
            ];
            if (args.branchName) {
                mustFilters.push({
                    key: 'branch_name',
                    match: {
                        value: args.branchName
                    }
                });
            }

            // Use searchPointGroups when groupBy is specified
            if (args.groupBy) {
                const searchResult = await this.client.searchPointGroups(this.collection, {
                    vector: args.vector,
                    limit: args.topK,
                    group_by: args.groupBy,  // Field to group by (e.g., 'filePath')
                    group_size: args.groupSize ?? 1,  // Results per group
                    score_threshold: args.scoreThreshold,
                    filter: {
                        must: mustFilters
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
                        must: mustFilters
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

    async deleteVectorsForFile(args: { repoId: string; filePath: string; branchName?: string }): Promise<void> {
        try {
            const mustFilters: any[] = [
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
            ];
            if (args.branchName) {
                mustFilters.push({
                    key: 'branch_name',
                    match: {
                        value: args.branchName
                    }
                });
            }

            await this.client.delete(this.collection, {
                wait: true,
                filter: {
                    must: mustFilters
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

    async deleteVectorsForBranch(args: { repoId: string; branchName: string }): Promise<void> {
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
                            key: 'branch_name',
                            match: {
                                value: args.branchName
                            }
                        }
                    ]
                }
            });
        } catch (error) {
            throw new Error(`Failed to delete branch vectors from Qdrant: ${error instanceof Error ? error.message : String(error)}`);
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

    /**
     * Helper method to validate collection dimension matches expected embedding dimension
     * @param expectedDim The expected dimension from the embedding provider
     * @throws Error if dimension mismatch detected
     */
    private async validateCollectionDimension(expectedDim: number): Promise<void> {
        const metadata = await this.getIndexMetadata({ repoId: 'validate' });
        if (metadata && metadata.dimension !== expectedDim) {
            throw new Error(
                `Collection dimension mismatch: collection "${this.collection}" has ${metadata.dimension} dimensions ` +
                `but embedding provider produces ${expectedDim} dimensions. ` +
                `Please recreate the collection in Settings with the correct dimension, or change your embedding provider.`
            );
        }
    }
}
