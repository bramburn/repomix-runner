import * as assert from 'assert';
import * as sinon from 'sinon';
import { RepoIndexMonitor } from '../../../core/indexing/repoIndexMonitor.js';

suite('RepoIndexMonitor', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
  });

  teardown(() => {
    sandbox.restore();
  });

  test('flush should expand directory-like path to concrete file paths from DB state', async () => {
    const markRepoFilesPending = sandbox.stub().resolves();
    const addIndexHistoryEvent = sandbox.stub().resolves();
    const addIndexHistoryBatch = sandbox.stub().resolves();
    const getRepoFilePathsByPathOrPrefix = sandbox.stub()
      .withArgs('repo-1', 'src/utils')
      .resolves(['src/utils/a.ts', 'src/utils/b.ts']);

    const dbService = {
      markRepoFilesPending,
      addIndexHistoryEvent,
      addIndexHistoryBatch,
      getRepoFilePathsByPathOrPrefix
    } as any;

    const onFlush = sandbox.stub().resolves();
    const monitor = new RepoIndexMonitor('/repo', 'repo-1', dbService, onFlush, 2500);

    monitor.queue('src/utils');
    await monitor.flush();
    monitor.dispose();

    assert.strictEqual(markRepoFilesPending.calledOnce, true);
    assert.deepStrictEqual(markRepoFilesPending.firstCall.args[1], ['src/utils/a.ts', 'src/utils/b.ts']);
    assert.strictEqual(onFlush.calledOnce, true);
    assert.deepStrictEqual(onFlush.firstCall.args[0], ['src/utils/a.ts', 'src/utils/b.ts']);
  });

  test('flush should keep original path when no DB expansion match exists', async () => {
    const markRepoFilesPending = sandbox.stub().resolves();
    const addIndexHistoryEvent = sandbox.stub().resolves();
    const addIndexHistoryBatch = sandbox.stub().resolves();
    const getRepoFilePathsByPathOrPrefix = sandbox.stub().resolves([]);

    const dbService = {
      markRepoFilesPending,
      addIndexHistoryEvent,
      addIndexHistoryBatch,
      getRepoFilePathsByPathOrPrefix
    } as any;

    const onFlush = sandbox.stub().resolves();
    const monitor = new RepoIndexMonitor('/repo', 'repo-1', dbService, onFlush, 2500);

    monitor.queue('src/new-file.ts');
    await monitor.flush();
    monitor.dispose();

    assert.strictEqual(markRepoFilesPending.calledOnce, true);
    assert.deepStrictEqual(markRepoFilesPending.firstCall.args[1], ['src/new-file.ts']);
  });

  test('flush should de-duplicate overlapping expanded paths', async () => {
    const markRepoFilesPending = sandbox.stub().resolves();
    const addIndexHistoryEvent = sandbox.stub().resolves();
    const addIndexHistoryBatch = sandbox.stub().resolves();
    const getRepoFilePathsByPathOrPrefix = sandbox.stub();

    getRepoFilePathsByPathOrPrefix.withArgs('repo-1', 'src/utils').resolves([
      'src/utils/a.ts',
      'src/utils/b.ts'
    ]);
    getRepoFilePathsByPathOrPrefix.withArgs('repo-1', 'src/utils/a.ts').resolves(['src/utils/a.ts']);

    const dbService = {
      markRepoFilesPending,
      addIndexHistoryEvent,
      addIndexHistoryBatch,
      getRepoFilePathsByPathOrPrefix
    } as any;

    const onFlush = sandbox.stub().resolves();
    const monitor = new RepoIndexMonitor('/repo', 'repo-1', dbService, onFlush, 2500);

    monitor.queue('src/utils');
    monitor.queue('src/utils/a.ts');
    await monitor.flush();
    monitor.dispose();

    assert.strictEqual(markRepoFilesPending.calledOnce, true);
    assert.deepStrictEqual(markRepoFilesPending.firstCall.args[1], ['src/utils/a.ts', 'src/utils/b.ts']);
  });
});
