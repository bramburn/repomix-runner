import * as vscode from 'vscode';
import { BundleManager } from '../../core/bundles/bundleManager.js';
import { runRepomix, defaultRunRepomixDeps } from '../../commands/runRepomix.js';
import { runBundle } from '../../commands/runBundle.js';
import { IWebviewContext } from '../controllers/BaseController.js';

export interface QueueItem {
  executionId: string;
  bundleId: string;
  compress?: boolean;
}

export const DEFAULT_REPOMIX_ID = '__default__';

export class ExecutionQueueManager {
  private _executionQueue: QueueItem[] = [];
  private _isProcessingQueue = false;
  private _runningBundles: Map<string, AbortController> = new Map();

  constructor(
    private readonly context: IWebviewContext,
    private readonly bundleManager: BundleManager,
    private readonly onRunComplete: () => void // Callback to refresh UI after runs
  ) {}

  public async addToQueue(bundleId: string, compress?: boolean) {
    this._executionQueue.push({ bundleId, compress, executionId: '' });

    // Notify UI
    this.context.postMessage({
      command: 'executionStateChange',
      bundleId,
      status: 'queued'
    });

    const name = await this._getBundleName(bundleId);
    vscode.window.showInformationMessage(`${name} queued${compress ? ' (compressed)' : ''}.`);

    this._processQueue();
  }

  public async cancel(bundleId: string) {
    // Case 1: Currently running
    const controller = this._runningBundles.get(bundleId);
    if (controller) {
      controller.abort();
      const name = await this._getBundleName(bundleId);
      vscode.window.showInformationMessage(`Cancelling "${name}"...`);
      return;
    }

    // Case 2: In queue
    const queueIndex = this._executionQueue.findIndex(item => item.bundleId === bundleId);
    if (queueIndex !== -1) {
      this._executionQueue.splice(queueIndex, 1);
      this._notifyIdle(bundleId);
      const name = await this._getBundleName(bundleId);
      vscode.window.showInformationMessage(`"${name}" removed from queue.`);
    }
  }

  private async _processQueue() {
    if (this._isProcessingQueue) return;
    this._isProcessingQueue = true;

    while (this._executionQueue.length > 0) {
      const queueItem = this._executionQueue[0];
      const { bundleId, compress } = queueItem;

      this.context.postMessage({
        command: 'executionStateChange',
        bundleId,
        status: 'running'
      });

      const isDefault = bundleId === DEFAULT_REPOMIX_ID;
      const bundleName = await this._getBundleName(bundleId);

      vscode.window.showInformationMessage(`Starting ${bundleName}${compress ? ' (compressed)' : ''}...`);

      const controller = new AbortController();
      this._runningBundles.set(bundleId, controller);

      try {
        if (isDefault) {
          await runRepomix({
            ...defaultRunRepomixDeps,
            mergeConfigOverride: compress ? { output: { compress: true } } : null,
            signal: controller.signal,
          });
        } else {
          const overrides = compress ? { output: { compress: true } } : undefined;
          await runBundle(this.bundleManager, bundleId, controller.signal, overrides);
        }
        vscode.window.showInformationMessage(`${bundleName} completed successfully.`);

        // Notify completion to trigger refreshes (stats, file existence)
        this.onRunComplete();

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage === 'Aborted' || (error instanceof Error && error.name === 'AbortError')) {
          vscode.window.showInformationMessage(`${bundleName} was cancelled.`);
        } else {
          console.error('Error running from webview:', error);
          vscode.window.showErrorMessage(`Failed to run: ${errorMessage}`);
        }
      } finally {
        this._runningBundles.delete(bundleId);
        // Remove from queue - check head to ensure robustness
        if (this._executionQueue.length > 0 && this._executionQueue[0].bundleId === bundleId) {
          this._executionQueue.shift();
        }
        this._notifyIdle(bundleId);
      }
    }
    this._isProcessingQueue = false;
  }

  private _notifyIdle(bundleId: string) {
    this.context.postMessage({
      command: 'executionStateChange',
      bundleId,
      status: 'idle'
    });
  }

  private async _getBundleName(bundleId: string): Promise<string> {
    if (bundleId === DEFAULT_REPOMIX_ID) return "Default Repomix";
    const bundle = await this.bundleManager.getBundle(bundleId);
    return bundle ? `Bundle "${bundle.name}"` : "Unknown Bundle";
  }
}