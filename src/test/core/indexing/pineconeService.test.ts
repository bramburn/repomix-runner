import * as assert from 'assert';
import * as sinon from 'sinon';
import { PineconeService } from '../../../core/indexing/pineconeService.js';
import { Pinecone } from '@pinecone-database/pinecone';

suite('PineconeService', () => {
  let sandbox: sinon.SinonSandbox;
  let pineconeService: PineconeService;
  let clientMock: any;
  let indexStub: sinon.SinonStub;
  let namespaceStub: sinon.SinonStub;
  let upsertStub: sinon.SinonStub;
  let queryStub: sinon.SinonStub;
  let deleteAllStub: sinon.SinonStub;
  let clientFactoryStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Mock the chain: client.index(name).namespace(id).upsert(...)
    upsertStub = sandbox.stub().resolves();
    queryStub = sandbox.stub().resolves({ matches: [] });
    deleteAllStub = sandbox.stub().resolves();

    namespaceStub = sandbox.stub().returns({
      upsert: upsertStub,
      query: queryStub,
      deleteAll: deleteAllStub
    });

    indexStub = sandbox.stub().returns({
      namespace: namespaceStub
    });

    clientMock = {
      index: indexStub
    };

    clientFactoryStub = sandbox.stub().returns(clientMock);

    pineconeService = new PineconeService(clientFactoryStub as any);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('upsertVectors should use repoId as namespace and add metadata', async () => {
    const apiKey = 'test-api-key';
    const indexName = 'test-index';
    const repoId = 'test-repo-id';
    const vectors = [
      { id: '1', values: [0.1, 0.2], metadata: { foo: 'bar' } }
    ];

    await pineconeService.upsertVectors(apiKey, indexName, repoId, vectors);

    assert.strictEqual(clientFactoryStub.calledWith({ apiKey }), true, 'Should initialize Pinecone with API key using factory');
    assert.strictEqual(indexStub.calledWith(indexName), true, 'Should select correct index');
    assert.strictEqual(namespaceStub.calledWith(repoId), true, 'Should use repoId as namespace');

    const upsertArgs = upsertStub.firstCall.args[0];
    assert.strictEqual(upsertArgs.length, 1);
    assert.strictEqual(upsertArgs[0].metadata.repoId, repoId, 'Should add repoId to metadata');
    assert.strictEqual(upsertArgs[0].metadata.foo, 'bar', 'Should preserve existing metadata');
  });

  test('queryVectors should use repoId as namespace', async () => {
    const apiKey = 'test-api-key';
    const indexName = 'test-index';
    const repoId = 'test-repo-id';
    const vector = [0.1, 0.2];

    await pineconeService.queryVectors(apiKey, indexName, repoId, vector);

    assert.strictEqual(namespaceStub.calledWith(repoId), true, 'Should use repoId as namespace');
    const queryArgs = queryStub.firstCall.args[0];
    assert.deepStrictEqual(queryArgs.vector, vector);
    assert.strictEqual(queryArgs.includeMetadata, true);
  });

  test('deleteRepo should use repoId as namespace and call deleteAll', async () => {
    const apiKey = 'test-api-key';
    const indexName = 'test-index';
    const repoId = 'test-repo-id';

    await pineconeService.deleteRepo(apiKey, indexName, repoId);

    assert.strictEqual(namespaceStub.calledWith(repoId), true, 'Should use repoId as namespace');
    assert.strictEqual(deleteAllStub.calledOnce, true, 'Should call deleteAll');
  });
});
