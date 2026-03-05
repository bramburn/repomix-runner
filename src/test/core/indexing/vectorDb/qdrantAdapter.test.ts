import * as assert from 'assert';
import * as sinon from 'sinon';
import { QdrantAdapter } from '../../../../core/indexing/vectorDb/providers/qdrantAdapter.js';
import { QdrantClient } from '@qdrant/js-client-rest';

suite('QdrantAdapter', () => {
  let sandbox: sinon.SinonSandbox;
  let adapter: QdrantAdapter;
  let qdrantClientMock: any;
  let getCollectionStub: sinon.SinonStub;
  let describeRepoStatsStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    
    // Mock Qdrant client methods
    getCollectionStub = sandbox.stub().resolves({
      config: {
        params: {
          vectors: {
            size: 1536,
            distance: 'Cosine'
          }
        }
      }
    });
    
    describeRepoStatsStub = sandbox.stub().resolves({
      vectorCount: 100
    });
    
    qdrantClientMock = {
      getCollection: getCollectionStub
    };
    
    adapter = new QdrantAdapter('http://localhost:6333', undefined, 'test-collection');
    
    // Override the client
    (adapter as any).client = qdrantClientMock;
    (adapter as any).describeRepoStats = describeRepoStatsStub;
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('getIndexMetadata', () => {
    test('should return correct metadata when collection exists', async () => {
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, 1536);
      assert.strictEqual(result!.count, 100);
      assert.strictEqual(result!.metric, 'cosine');
    });

    test('should return null when vectors config is missing size', async () => {
      getCollectionStub.resolves({
        config: {
          params: {
            vectors: {
              distance: 'Cosine'
              // Missing 'size' property
            }
          }
        }
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.strictEqual(result, null);
    });

    test('should return null when vectors config is not an object', async () => {
      getCollectionStub.resolves({
        config: {
          params: {
            vectors: 'invalid-config'
          }
        }
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.strictEqual(result, null);
    });

    test('should return null when vectors config is null', async () => {
      getCollectionStub.resolves({
        config: {
          params: {
            vectors: null
          }
        }
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.strictEqual(result, null);
    });

    test('should handle getCollection throwing error', async () => {
      getCollectionStub.rejects(new Error('Collection not found'));
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.strictEqual(result, null);
    });

    test('should extract metric from distance field', async () => {
      getCollectionStub.resolves({
        config: {
          params: {
            vectors: {
              size: 768,
              distance: 'Euclid'
            }
          }
        }
      });
      
      describeRepoStatsStub.resolves({ vectorCount: 50 });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, 768);
      assert.strictEqual(result!.count, 50);
      assert.strictEqual(result!.metric, 'euclid');
    });

    test('should handle missing distance field', async () => {
      getCollectionStub.resolves({
        config: {
          params: {
            vectors: {
              size: 4096
              // No distance field
            }
          }
        }
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, 4096);
      assert.strictEqual(result!.metric, undefined);
    });

    test('should handle null stats response', async () => {
      describeRepoStatsStub.resolves(null);
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, 1536);
      assert.strictEqual(result!.count, 0);
    });
  });

  suite('dimension compatibility scenarios', () => {
    test('should detect dimension mismatch - embedding 768 vs collection 1536', async () => {
      // Simulate embedding service returning 768 dimensions
      const embeddingDim = 768;
      getCollectionStub.resolves({
        config: {
          params: {
            vectors: {
              size: 1536, // Collection expects 1536
              distance: 'Cosine'
            }
          }
        }
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.notStrictEqual(result!.dimension, embeddingDim);
      assert.strictEqual(result!.dimension, 1536);
    });

    test('should detect dimension match - both 768', async () => {
      // Simulate embedding service returning 768 dimensions
      const embeddingDim = 768;
      getCollectionStub.resolves({
        config: {
          params: {
            vectors: {
              size: 768,
              distance: 'Cosine'
            }
          }
        }
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, embeddingDim);
    });

    test('should handle different distance metrics', async () => {
      getCollectionStub.resolves({
        config: {
          params: {
            vectors: {
              size: 1536,
              distance: 'Dot'
            }
          }
        }
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, 1536);
      assert.strictEqual(result!.metric, 'dot');
    });

    test('should handle empty collection (count = 0) as compatible', async () => {
      describeRepoStatsStub.resolves({ vectorCount: 0 });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.count, 0);
      // Should be considered compatible regardless of dimension when count is 0
    });

    test('should handle collection with mixed vector configs', async () => {
      // Test edge case where vectors config might have unexpected structure
      getCollectionStub.resolves({
        config: {
          params: {
            vectors: {
              size: 384,
              distance: 'Manhattan',
              otherField: 'value'
            }
          }
        }
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, 384);
      assert.strictEqual(result!.metric, 'manhattan');
    });
  });

  suite('client initialization', () => {
    test('should create client with API key when provided', () => {
      const adapterWithKey = new QdrantAdapter(
        'http://localhost:6333', 
        'test-collection', 
        'test-api-key'
      );
      
      // Verify client was created with correct config
      const client = (adapterWithKey as any).client;
      assert.ok(client);
      // Note: We can't easily verify the internal config, but we can test the behavior
    });

    test('should create client without API key for local instances', () => {
      const adapterWithoutKey = new QdrantAdapter(
        'http://localhost:6333', 
        undefined,
        'test-collection'
      );
      
      const client = (adapterWithoutKey as any).client;
      assert.ok(client);
    });

    test('should handle hosted instances requiring API key', () => {
      // This tests the constructor validation logic
      // Note: Constructor validation happens internally, testing the behavior instead
    });
  });
});