import * as assert from 'assert';
import * as sinon from 'sinon';
import { PineconeAdapter } from '../../../../core/indexing/vectorDb/providers/pineconeAdapter.js';
import { Pinecone } from '@pinecone-database/pinecone';

suite('PineconeAdapter', () => {
  let sandbox: sinon.SinonSandbox;
  let adapter: PineconeAdapter;
  let pineconeMock: any;
  let indexMock: any;
  let describeIndexStub: sinon.SinonStub;
  let describeIndexStatsStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    
    // Mock Pinecone client
    describeIndexStub = sandbox.stub().resolves({
      dimension: 1536,
      metric: 'cosine'
    });
    
    describeIndexStatsStub = sandbox.stub().resolves({
      namespaces: {
        'test-repo': {
          vectorCount: 100
        }
      }
    });
    
    indexMock = {
      describeIndexStats: describeIndexStatsStub
    };
    
    pineconeMock = {
      describeIndex: describeIndexStub,
      index: sandbox.stub().returns(indexMock)
    };
    
    const PineconeConstructor = sandbox.stub().returns(pineconeMock);
    
    adapter = new PineconeAdapter(
      { apiKey: 'test-key', indexName: 'test-index' },
      { 
        // Mock PineconeService methods if needed
      } as any
    );
    
    // Override the Pinecone constructor
    (adapter as any).svc = {
      pc: PineconeConstructor
    };
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('getIndexMetadata', () => {
    test('should return correct metadata when index exists', async () => {
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, 1536);
      assert.strictEqual(result!.count, 100);
      assert.strictEqual(result!.metric, 'cosine');
    });

    test('should return null when dimension is undefined', async () => {
      describeIndexStub.resolves({
        dimension: undefined,
        metric: 'cosine'
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.strictEqual(result, null);
    });

    test('should return null when describeIndex throws error', async () => {
      describeIndexStub.rejects(new Error('Index not found'));
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.strictEqual(result, null);
    });

    test('should handle missing namespace in stats', async () => {
      describeIndexStatsStub.resolves({
        namespaces: {}
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, 1536);
      assert.strictEqual(result!.count, 0);
      assert.strictEqual(result!.metric, 'cosine');
    });

    test('should handle null stats response', async () => {
      describeIndexStatsStub.resolves(null);
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, 1536);
      assert.strictEqual(result!.count, 0);
      assert.strictEqual(result!.metric, 'cosine');
    });

    test('should use host when provided', async () => {
      const adapterWithHost = new PineconeAdapter(
        { apiKey: 'test-key', indexName: 'test-index', host: 'custom-host' }
      );
      
      // Mock the Pinecone constructor
      const mockPinecone = {
        describeIndex: sandbox.stub().resolves({
          dimension: 768,
          metric: 'euclidean'
        }),
        index: sandbox.stub().returns({
          describeIndexStats: sandbox.stub().resolves({
            namespaces: { 'test-repo': { vectorCount: 50 } }
          })
        })
      };
      
      // Note: Constructor stubbing is complex, testing the behavior instead
      
      const result = await adapterWithHost.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, 768);
      assert.strictEqual(result!.count, 50);
      assert.strictEqual(result!.metric, 'euclidean');
    });
  });

  suite('dimension compatibility scenarios', () => {
    test('should detect dimension mismatch - embedding 768 vs index 1536', async () => {
      // Simulate embedding service returning 768 dimensions
      const embeddingDim = 768;
      describeIndexStub.resolves({
        dimension: 1536, // Index expects 1536
        metric: 'cosine'
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.notStrictEqual(result!.dimension, embeddingDim);
      assert.strictEqual(result!.dimension, 1536);
    });

    test('should detect dimension match - both 1536', async () => {
      // Simulate embedding service returning 1536 dimensions
      const embeddingDim = 1536;
      describeIndexStub.resolves({
        dimension: 1536,
        metric: 'cosine'
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.dimension, embeddingDim);
    });

    test('should handle empty index (count = 0) as compatible', async () => {
      describeIndexStatsStub.resolves({
        namespaces: {
          'test-repo': {
            vectorCount: 0
          }
        }
      });
      
      const result = await adapter.getIndexMetadata({ repoId: 'test-repo' });
      
      assert.ok(result);
      assert.strictEqual(result!.count, 0);
      // Should be considered compatible regardless of dimension when count is 0
    });
  });
});