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
}

export class BatchPoller {
  private readonly handles = new Map<string, PollHandle>();
  private readonly options: BatchPollerOptions;

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
      this.startPolling(job.batchJobId, onTerminalState);
    }
  }

  async resumeAllPending(
    onTerminalState: (result: BatchCompletionResult) => Promise<void>
  ): Promise<void> {
    const pending = await this.manager.getPendingBatches();
    for (const job of pending) {
      this.startPolling(job.batchJobId, onTerminalState);
    }
  }

  startPolling(
    batchJobId: string,
    onTerminalState: (result: BatchCompletionResult) => Promise<void>
  ): void {
    if (this.handles.has(batchJobId)) {
      return;
    }

    const startedAt = Date.now();

    const tick = async () => {
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
        if (result.status === 'completed' || result.status === 'failed' || result.status === 'cancelled') {
          this.stopPolling(batchJobId);
          await onTerminalState(result);
          return;
        }
      } catch (error) {
        logger.both.error(`BatchPoller: Polling failed for ${batchJobId}`, error);
      }

      const timeout = setTimeout(tick, this.options.pollIntervalSeconds * 1000);
      this.handles.set(batchJobId, { timeout, startedAt });
    };

    const timeout = setTimeout(tick, 5000);
    this.handles.set(batchJobId, { timeout, startedAt });
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
    for (const [batchJobId, handle] of this.handles.entries()) {
      clearTimeout(handle.timeout);
      this.handles.delete(batchJobId);
    }
  }
}
