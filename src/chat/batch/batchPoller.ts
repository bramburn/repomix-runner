import { logger } from '../../shared/logger.js';
import type { BatchCompletionResult, BatchPollerOptions } from './types.js';
import { BatchManager } from './batchManager.js';

const DEFAULT_OPTIONS: BatchPollerOptions = {
  pollIntervalSeconds: 60,
  maxDurationMs: 25 * 60 * 60 * 1000,
};

interface PollHandle {
  timeout: NodeJS.Timeout;
  startedAt: number;
  runId: number;
}

export class BatchPoller {
  private readonly handles = new Map<string, PollHandle>();
  private readonly options: BatchPollerOptions;
  private nextRunId = 0;
  private disposed = false;

  constructor(
    private readonly manager: BatchManager,
    options?: Partial<BatchPollerOptions>
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  isPolling(batchJobId: string): boolean {
    return this.handles.has(batchJobId);
  }

  async resumePendingForThread(
    threadId: string,
    onTerminalState: (result: BatchCompletionResult) => Promise<void>
  ): Promise<void> {
    const pending = await this.manager.getPendingBatches(threadId);
    for (const job of pending) {
      this.startPolling(job.batchJobId, onTerminalState, job.startedAtMs);
    }
  }

  async resumeAllPending(
    onTerminalState: (result: BatchCompletionResult) => Promise<void>
  ): Promise<void> {
    const pending = await this.manager.getPendingBatches();
    for (const job of pending) {
      this.startPolling(job.batchJobId, onTerminalState, job.startedAtMs);
    }
  }

  startPolling(
    batchJobId: string,
    onTerminalState: (result: BatchCompletionResult) => Promise<void>,
    startedAtMs?: number
  ): void {
    if (this.disposed || this.handles.has(batchJobId)) {
      return;
    }

    const startedAt =
      typeof startedAtMs === 'number' && Number.isFinite(startedAtMs) && startedAtMs > 0
        ? startedAtMs
        : Date.now();
    const runId = ++this.nextRunId;

    const isRunActive = () =>
      !this.disposed && this.handles.get(batchJobId)?.runId === runId;

    const scheduleNextTick = (delayMs: number) => {
      if (!isRunActive()) {
        return;
      }

      const timeout = setTimeout(() => {
        void tick();
      }, delayMs);
      this.handles.set(batchJobId, { timeout, startedAt, runId });
    };

    const tick = async () => {
      if (!isRunActive()) {
        return;
      }

      try {
        if (Date.now() - startedAt > this.options.maxDurationMs) {
          const timeoutResult: BatchCompletionResult = {
            batchJobId,
            batchApiId: '',
            status: 'failed',
            errorMessage: 'Batch polling timed out.',
          };
          this.stopPolling(batchJobId);
          await onTerminalState(timeoutResult);
          return;
        }

        const result = await this.manager.pollBatchJob(batchJobId);
        if (!isRunActive()) {
          return;
        }
        if (result.status === 'completed' || result.status === 'failed' || result.status === 'cancelled') {
          this.stopPolling(batchJobId);
          await onTerminalState(result);
          return;
        }
      } catch (error) {
        if (!isRunActive()) {
          return;
        }
        logger.both.error(`BatchPoller: Polling failed for ${batchJobId}`, error);
      }

      scheduleNextTick(this.options.pollIntervalSeconds * 1000);
    };

    const initialTimeout = setTimeout(() => {
      void tick();
    }, 5000);
    this.handles.set(batchJobId, { timeout: initialTimeout, startedAt, runId });
  }

  stopPolling(batchJobId: string): void {
    const handle = this.handles.get(batchJobId);
    if (!handle) {
      return;
    }

    clearTimeout(handle.timeout);
    this.handles.delete(batchJobId);
  }

  dispose(): void {
    this.disposed = true;
    for (const handle of this.handles.values()) {
      clearTimeout(handle.timeout);
    }
    this.handles.clear();
  }
}
