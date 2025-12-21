import * as assert from 'assert';
import * as sinon from 'sinon';
import { embedAndUpsertFile } from '../../../core/indexing/fileEmbeddingPipeline.js';
import { PineconeService } from '../../../core/indexing/pineconeService.js';
import * as embeddingServiceModule from '../../../core/indexing/embeddingService.js';
import * as fsModule from 'fs/promises';

suite('fileEmbeddingPipeline', () => {
  let sandbox: sinon.SinonSandbox;
  let readFileStub: sinon.SinonStub;
  let embedTextsStub: sinon.SinonStub;
  let upsertVectorsStub: sinon.SinonStub;
  let pineconeService: PineconeService;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Stub file reading
    readFileStub = sandbox.stub(fsModule, 'readFile').resolves('Sample text content.');

    // Stub embedding
    embedTextsStub = sandbox.stub(embeddingServiceModule.embeddingService, 'embedTexts')
      .resolves([[0.1, 0.2, 0.3]]);

    // Stub Pinecone upsert
    upsertVectorsStub = sandbox.stub().resolves();
    const indexStub = sandbox.stub().returns({
      namespace: sandbox.stub().returns({
        upsert: upsertVectorsStub
      })
    });
    const clientStub = {
      index: indexStub
    };
    const clientFactoryStub = sandbox.stub().returns(clientStub);

    pineconeService = new PineconeService(clientFactoryStub as any);
  });

  teardown(() => {
    sandbox.restore();
  });

  test('embedAndUpsertFile should read, chunk, embed, and upsert', async () => {
    const vectorCount = await embedAndUpsertFile(
      '/repo/src/file.ts',
      'test-repo',
      '/repo',
      'test-api-key',
      pineconeService,
      'test-index'
    );

    assert.ok(readFileStub.called, 'Should read file');
    assert.ok(embedTextsStub.called, 'Should embed text');
    assert.ok(upsertVectorsStub.called, 'Should upsert vectors');
    assert.ok(vectorCount > 0, 'Should return vector count');
  });

  test('embedAndUpsertFile should include required metadata', async () => {
    await embedAndUpsertFile(
      '/repo/src/file.ts',
      'test-repo',
      '/repo',
      'test-api-key',
      pineconeService,
      'test-index'
    );

    const upsertCall = upsertVectorsStub.firstCall;
    assert.ok(upsertCall, 'Upsert should be called');

    const vectors = upsertCall.args[0];
    assert.ok(vectors.length > 0, 'Should have vectors');

    const firstVector = vectors[0];
    assert.strictEqual(firstVector.metadata.repoId, 'test-repo');
    assert.strictEqual(firstVector.metadata.filePath, 'src/file.ts');
    assert.strictEqual(firstVector.metadata.chunkIndex, 0);
    assert.ok(firstVector.metadata.textHash, 'Should have textHash');
    assert.ok(firstVector.metadata.updatedAt, 'Should have updatedAt');
    assert.strictEqual(firstVector.metadata.source, 'repomix');
  });
});

