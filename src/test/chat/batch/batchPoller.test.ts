import * as assert from 'assert';
import * as sinon from 'sinon';
import { BatchPoller } from '../../../chat/batch/batchPoller.js';
import type { BatchManager } from '../../../chat/batch/batchManager.js';
import type { BatchCompletionResult, BatchPendingView } from '../../../chat/batch/types.js';

suite('batchPoller', () => {
  let clock: sinon.SinonFakeTimers;

  setup(() => {
    clock = sinon.useFakeTimers();
  });

  teardown(() => {
    clock.restore();
  });

  test('fails polling when max duration is already exceeded', async () => {
    const pollBatchJob = sinon.stub().resolves({
      batchJobId: 'job-1',
      batchApiId: 'api-1',
      status: 'processing',
    } as BatchCompletionResult);
    const manager = {
      pollBatchJob,
      getPendingBatches: sinon.stub().resolves([] as BatchPendingView[]),
    } as unknown as BatchManager;
    const onTerminalState = sinon.stub().resolves();

    const poller = new BatchPoller(manager, {
      pollIntervalSeconds: 60,
      maxDurationMs: 1000,
    });

    poller.startPolling('job-1', onTerminalState, Date.now() - 5000);
    await clock.tickAsync(5000);

    sinon.assert.notCalled(pollBatchJob);
    sinon.assert.calledOnce(onTerminalState);
    assert.strictEqual(onTerminalState.firstCall.args[0].batchJobId, 'job-1');
    assert.strictEqual(onTerminalState.firstCall.args[0].status, 'failed');
    assert.strictEqual(onTerminalState.firstCall.args[0].errorMessage, 'Batch polling timed out.');
  });

  test('does not reschedule polling after dispose while a poll is in flight', async () => {
    let resolvePoll: ((result: BatchCompletionResult) => void) | undefined;
    const pollBatchJob = sinon.stub().callsFake(
      () =>
        new Promise<BatchCompletionResult>((resolve) => {
          resolvePoll = resolve;
        })
    );
    const manager = {
      pollBatchJob,
      getPendingBatches: sinon.stub().resolves([] as BatchPendingView[]),
    } as unknown as BatchManager;
    const onTerminalState = sinon.stub().resolves();

    const poller = new BatchPoller(manager, {
      pollIntervalSeconds: 1,
      maxDurationMs: 60_000,
    });

    poller.startPolling('job-2', onTerminalState);
    await clock.tickAsync(5000);
    sinon.assert.calledOnce(pollBatchJob);

    poller.dispose();
    resolvePoll?.({
      batchJobId: 'job-2',
      batchApiId: 'api-2',
      status: 'processing',
    });

    await clock.tickAsync(0);
    await clock.tickAsync(15_000);

    sinon.assert.calledOnce(pollBatchJob);
    sinon.assert.notCalled(onTerminalState);
  });

  test('uses persisted startedAt timestamp when resuming pending jobs', async () => {
    const pollBatchJob = sinon.stub().resolves({
      batchJobId: 'job-3',
      batchApiId: 'api-3',
      status: 'processing',
    } as BatchCompletionResult);
    const manager = {
      pollBatchJob,
      getPendingBatches: sinon.stub().resolves([
        {
          batchJobId: 'job-3',
          threadId: 'thread-1',
          batchApiId: 'api-3',
          status: 'processing',
          startedAtMs: Date.now() - 5000,
        } as BatchPendingView,
      ]),
    } as unknown as BatchManager;
    const onTerminalState = sinon.stub().resolves();

    const poller = new BatchPoller(manager, {
      pollIntervalSeconds: 60,
      maxDurationMs: 1000,
    });

    await poller.resumeAllPending(onTerminalState);
    await clock.tickAsync(5000);

    sinon.assert.notCalled(pollBatchJob);
    sinon.assert.calledOnce(onTerminalState);
    assert.strictEqual(onTerminalState.firstCall.args[0].batchJobId, 'job-3');
    assert.strictEqual(onTerminalState.firstCall.args[0].status, 'failed');
  });
});
