import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BundleManager } from '../core/bundles/bundleManager.js';
import { runBundle } from '../commands/runBundle.js';
import { runRepomix } from '../commands/runRepomix.js';
import { resolveBundleOutputPath } from '../core/files/outputPathResolver.js';
import { calculateBundleStats, invalidateStatsCache } from '../core/files/fileStats.js';
import { getCwd } from '../config/getCwd.js';
import { WebviewBundle } from '../core/bundles/types.js';
import { copyToClipboard } from '../core/files/copyToClipboard.js';
import { tempDirManager } from '../core/files/tempDirManager.js';
import { mergeConfigs, readRepomixFileConfig, readRepomixRunnerVscodeConfig } from '../config/configLoader.js';

const DEFAULT_REPOMIX_ID = '__default__';

export class RepomixWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'repomixRunner.controlPanel';
  private _view?: vscode.WebviewView;
  private _executionQueue: string[] = [];
  private _isProcessingQueue = false;
  private _runningBundles: Map<string, AbortController> = new Map();
  private _outputFileWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private _defaultRepomixWatcher?: vscode.FileSystemWatcher;

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
          await this._sendDefaultRepomixState();
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
        case 'copyBundleOutput': {
          const { bundleId } = data;
          await this._handleCopyBundleOutput(bundleId);
          break;
        }
        case 'runDefaultRepomix': {
          await this._handleRunDefaultRepomix();
          break;
        }
        case 'cancelDefaultRepomix': {
          await this._handleCancelDefaultRepomix();
          break;
        }
        case 'copyDefaultRepomixOutput': {
          await this._handleCopyDefaultRepomixOutput();
          break;
        }
      }
    });

    // Listen for bundle changes
    const changeSubscription = this._bundleManager.onDidChangeBundles.event(() => {
      invalidateStatsCache(); // Invalidate stats when bundles change
      if (this._view?.visible) {
        this._sendBundles();
      }
    });

    // Listen for window focus to re-check file existence
    const focusSubscription = vscode.window.onDidChangeWindowState((e) => {
       if (e.focused && this._view?.visible) {
         this._sendBundles();
         this._sendDefaultRepomixState();
       }
    });

    // Clean up subscription when webview is disposed
    webviewView.onDidDispose(() => {
      changeSubscription.dispose();
      focusSubscription.dispose();
      this._disposeWatchers();
    });
  }

  private _disposeWatchers() {
      this._outputFileWatchers.forEach(w => w.dispose());
      this._outputFileWatchers.clear();
      this._defaultRepomixWatcher?.dispose();
  }

  private async _resolveDefaultRepomixOutputPath(): Promise<string> {
      const cwd = getCwd();
      const vscodeConfig = readRepomixRunnerVscodeConfig();
      const configFile = await readRepomixFileConfig(cwd);
      const mergedConfig = await mergeConfigs(cwd, configFile, vscodeConfig, null);
      return mergedConfig.output.filePath;
  }

  private async _sendDefaultRepomixState() {
      if (!this._view) {
          return;
      }
      try {
          const outputPath = await this._resolveDefaultRepomixOutputPath();
          const exists = fs.existsSync(outputPath);

          // Update watcher if path changed
          if (this._defaultRepomixWatcher) {
             // We can't easily check the pattern of existing watcher, so simple recreation might be easiest
             // Or optimize later.
             this._defaultRepomixWatcher.dispose();
          }

          const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(outputPath), path.basename(outputPath)));
          watcher.onDidCreate(() => this._sendDefaultRepomixState());
          watcher.onDidDelete(() => this._sendDefaultRepomixState());
          this._defaultRepomixWatcher = watcher;

          this._view.webview.postMessage({
              command: 'updateDefaultRepomix',
              data: {
                  outputFileExists: exists,
                  outputFilePath: outputPath
              }
          });

      } catch (e) {
          console.error('Failed to send default repomix state:', e);
      }
  }

  private async _sendBundles() {
    if (!this._view) {
      return;
    }
    const bundleMetadata = await this._bundleManager.getAllBundles();
    const cwd = getCwd();

    // Note: We don't dispose all watchers here because _sendDefaultRepomixState manages its own separately
    // But for bundles we do recreate them. Ideally we should track them better.
    this._outputFileWatchers.forEach(w => w.dispose());
    this._outputFileWatchers.clear();

    const webviewBundles: WebviewBundle[] = await Promise.all(
        Object.entries(bundleMetadata.bundles).map(async ([id, bundle]) => {
            const outputPath = await resolveBundleOutputPath(bundle);
            const exists = fs.existsSync(outputPath);

            // Watch for changes on this file
            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(outputPath), path.basename(outputPath)));
            watcher.onDidCreate(() => this._sendBundles());
            watcher.onDidDelete(() => this._sendBundles());
            // watcher.onDidChange(() => this._sendBundles()); // Maybe overkill?
            this._outputFileWatchers.set(id, watcher);

            // Calculate stats
            const stats = await calculateBundleStats(cwd, id, bundle.files);

            return {
                id,
                ...bundle,
                outputFilePath: outputPath,
                outputFileExists: exists,
                stats
            };
        })
    );

    this._view.webview.postMessage({
      command: 'updateBundles',
      bundles: webviewBundles,
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

  private async _handleCopyBundleOutput(bundleId: string) {
    const bundle = await this._bundleManager.getBundle(bundleId);
    if (!bundle) {return;}

    try {
        const outputPath = await resolveBundleOutputPath(bundle);
        if (!fs.existsSync(outputPath)) {
            vscode.window.showErrorMessage(`Output file not found: ${outputPath}`);
            return;
        }

        const tmpFilePath = path.join(
            tempDirManager.getTempDir(),
            `${Date.now().toString().slice(-3)}_${path.basename(outputPath)}`
        );

        await copyToClipboard(outputPath, tmpFilePath);
        vscode.window.showInformationMessage(`Copied "${path.basename(outputPath)}" to clipboard.`);

        await tempDirManager.cleanupFile(tmpFilePath);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to copy output: ${err.message}`);
    }
  }

  private async _handleCopyDefaultRepomixOutput() {
      try {
          const outputPath = await this._resolveDefaultRepomixOutputPath();
          if (!fs.existsSync(outputPath)) {
              vscode.window.showErrorMessage(`Output file not found: ${outputPath}`);
              return;
          }
          const tmpFilePath = path.join(
            tempDirManager.getTempDir(),
            `${Date.now().toString().slice(-3)}_${path.basename(outputPath)}`
          );

          await copyToClipboard(outputPath, tmpFilePath);
          vscode.window.showInformationMessage(`Copied "${path.basename(outputPath)}" to clipboard.`);
          await tempDirManager.cleanupFile(tmpFilePath);

      } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to copy output: ${err.message}`);
      }
  }

  private async _handleRunDefaultRepomix() {
      if (!this._view) { return; }

      // Add to queue
      this._executionQueue.push(DEFAULT_REPOMIX_ID);

      // Notify queued
      this._view.webview.postMessage({
        command: 'executionStateChange',
        bundleId: DEFAULT_REPOMIX_ID,
        status: 'queued',
      });

      vscode.window.showInformationMessage(`Default Repomix run queued.`);
      this._processQueue();
  }

  private async _handleCancelDefaultRepomix() {
     await this._handleCancelBundle(DEFAULT_REPOMIX_ID);
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
        const name = bundleId === DEFAULT_REPOMIX_ID ? "Default Repomix" : (await this._bundleManager.getBundle(bundleId)).name;
        vscode.window.showInformationMessage(`Cancelling "${name}"...`);
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

      const name = bundleId === DEFAULT_REPOMIX_ID ? "Default Repomix" : (await this._bundleManager.getBundle(bundleId)).name;
      vscode.window.showInformationMessage(`"${name}" removed from queue.`);
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

      const isDefault = bundleId === DEFAULT_REPOMIX_ID;
      let bundleName = "Default Repomix";
      if (!isDefault) {
          const bundle = await this._bundleManager.getBundle(bundleId);
          bundleName = `Bundle "${bundle.name}"`;
      }

      vscode.window.showInformationMessage(`Starting ${bundleName}...`);

      const controller = new AbortController();
      this._runningBundles.set(bundleId, controller);

      try {
        if (isDefault) {
            await runRepomix({ signal: controller.signal } as any);
            this._sendDefaultRepomixState();
        } else {
            await runBundle(this._bundleManager, bundleId, controller.signal);
            // Refresh bundles to update "exists" status for the newly generated file
            this._sendBundles();
        }

        vscode.window.showInformationMessage(`${bundleName} completed successfully.`);
      } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'Aborted') {
            vscode.window.showInformationMessage(`${bundleName} was cancelled.`);
        } else {
            console.error('Error running from webview:', error);
            vscode.window.showErrorMessage(`Failed to run: ${error}`);
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
