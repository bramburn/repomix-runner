import * as vscode from 'vscode';
import { BundleManager } from '../core/bundles/bundleManager.js';
import { runBundle } from '../commands/runBundle.js';

export class RepomixWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'repomixRunner.controlPanel';
  private _view?: vscode.WebviewView;
  private _executionQueue: string[] = [];
  private _isProcessingQueue = false;
  private _runningBundles: Map<string, AbortController> = new Map();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _bundleManager: BundleManager
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist')],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case 'webviewLoaded': {
          await this._sendBundles();
          await this._sendVersion();
          break;
        }
        case 'runBundle': {
          const { bundleId } = data;
          await this._handleRunBundle(bundleId);
          break;
        }
        case 'cancelBundle': {
          const { bundleId } = data;
          await this._handleCancelBundle(bundleId);
          break;
        }
      }
    });

    // Listen for bundle changes
    const changeSubscription = this._bundleManager.onDidChangeBundles.event(() => {
      if (this._view?.visible) {
        this._sendBundles();
      }
    });

    // Clean up subscription when webview is disposed
    webviewView.onDidDispose(() => {
      changeSubscription.dispose();
      // Cancel all running bundles on dispose?
      // Maybe not, the user might close the view but expect the job to continue.
    });
  }

  private async _sendBundles() {
    if (!this._view) {
      return;
    }
    const bundleMetadata = await this._bundleManager.getAllBundles();
    // Convert object to array for easier frontend handling
    const bundles = Object.entries(bundleMetadata.bundles).map(([id, bundle]) => ({
      id,
      ...bundle,
    }));

    this._view.webview.postMessage({
      command: 'updateBundles',
      bundles,
    });
  }

  private async _sendVersion() {
    if (!this._view) {
      return;
    }
    try {
      const packageJsonPath = vscode.Uri.joinPath(this._extensionUri, 'package.json');
      const packageJsonData = await vscode.workspace.fs.readFile(packageJsonPath);
      const packageJson = JSON.parse(Buffer.from(packageJsonData).toString());
      const version = packageJson.version;

      this._view.webview.postMessage({
        command: 'updateVersion',
        version,
      });
    } catch (error) {
      console.error('Failed to get version:', error);
    }
  }

  private async _handleRunBundle(bundleId: string) {
    if (!this._view) {
      return;
    }

    // Add to queue
    this._executionQueue.push(bundleId);

    // Notify queued
    this._view.webview.postMessage({
      command: 'executionStateChange',
      bundleId,
      status: 'queued',
    });

    // Get bundle name for notification
    const bundle = await this._bundleManager.getBundle(bundleId);
    vscode.window.showInformationMessage(`Bundle "${bundle.name}" queued.`);

    this._processQueue();
  }

  private async _handleCancelBundle(bundleId: string) {
    // Case 1: Bundle is currently running
    const controller = this._runningBundles.get(bundleId);
    if (controller) {
        controller.abort();
        // The _processQueue loop will handle the cleanup and notification via catch/finally
        // But we can notify immediately that cancellation was requested
        const bundle = await this._bundleManager.getBundle(bundleId);
        vscode.window.showInformationMessage(`Cancelling bundle "${bundle.name}"...`);
        return;
    }

    // Case 2: Bundle is in the queue (waiting)
    // Note: A running bundle is also in the queue (at index 0), but we handled it above.
    // If it's in the queue but NOT in runningBundles, it's waiting.
    const queueIndex = this._executionQueue.indexOf(bundleId);
    if (queueIndex !== -1) {
      this._executionQueue.splice(queueIndex, 1);

      if (this._view) {
        this._view.webview.postMessage({
            command: 'executionStateChange',
            bundleId,
            status: 'idle',
        });
      }

      const bundle = await this._bundleManager.getBundle(bundleId);
      vscode.window.showInformationMessage(`Bundle "${bundle.name}" removed from queue.`);
      return;
    }
  }

  private async _processQueue() {
    if (this._isProcessingQueue) {
      return;
    }

    this._isProcessingQueue = true;

    while (this._executionQueue.length > 0) {
      const bundleId = this._executionQueue[0];

      if (!this._view) {
        break;
      }

      // Notify running
      this._view.webview.postMessage({
        command: 'executionStateChange',
        bundleId,
        status: 'running',
      });

      const bundle = await this._bundleManager.getBundle(bundleId);
      vscode.window.showInformationMessage(`Starting bundle "${bundle.name}"...`);

      const controller = new AbortController();
      this._runningBundles.set(bundleId, controller);

      try {
        await runBundle(this._bundleManager, bundleId, controller.signal);
        vscode.window.showInformationMessage(`Bundle "${bundle.name}" completed successfully.`);
      } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'Aborted') {
            vscode.window.showInformationMessage(`Bundle "${bundle.name}" was cancelled.`);
        } else {
            console.error('Error running bundle from webview:', error);
            vscode.window.showErrorMessage(`Failed to run bundle: ${error}`);
        }
      } finally {
        // Cleanup
        this._runningBundles.delete(bundleId);

        // Remove from queue - ONLY if it's still the head (safe check)
        if (this._executionQueue.length > 0 && this._executionQueue[0] === bundleId) {
             this._executionQueue.shift();
        }

        // Notify idle
        if (this._view) {
          this._view.webview.postMessage({
            command: 'executionStateChange',
            bundleId,
            status: 'idle',
          });
        }
      }
    }

    this._isProcessingQueue = false;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview.js')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Repomix Runner Control Panel</title>
      </head>
      <body>
        <div id="root"></div>
        <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
