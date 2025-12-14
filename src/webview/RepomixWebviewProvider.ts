import * as vscode from 'vscode';
import { BundleManager } from '../core/bundles/bundleManager.js';
import { runBundle } from '../commands/runBundle.js';

export class RepomixWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'repomixRunner.controlPanel';
  private _view?: vscode.WebviewView;

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
          break;
        }
        case 'runBundle': {
          const { bundleId } = data;
          await this._handleRunBundle(bundleId);
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

  private async _handleRunBundle(bundleId: string) {
    if (!this._view) {
      return;
    }

    // Notify start
    this._view.webview.postMessage({
      command: 'executionStateChange',
      bundleId,
      status: 'running',
    });

    try {
      await runBundle(this._bundleManager, bundleId);
    } catch (error) {
      console.error('Error running bundle from webview:', error);
      vscode.window.showErrorMessage(`Failed to run bundle: ${error}`);
    } finally {
      // Notify end
      if (this._view) {
        this._view.webview.postMessage({
          command: 'executionStateChange',
          bundleId,
          status: 'idle',
        });
      }
    }
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
