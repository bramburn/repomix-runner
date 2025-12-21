import * as vscode from 'vscode';
import * as path from 'path';
import { BundleManager } from '../core/bundles/bundleManager.js';
import { DatabaseService } from '../core/storage/databaseService.js';
import { WebviewMessageSchema } from './messageSchemas.js';

// Controllers
import { BaseController } from './controllers/BaseController.js';
import { BundleController } from './controllers/BundleController.js';
import { AgentController } from './controllers/AgentController.js';
import { ConfigController } from './controllers/ConfigController.js';
import { DebugController } from './controllers/DebugController.js';
import { IndexingController } from './controllers/IndexingController.js';
import { ExecutionQueueManager } from './services/ExecutionQueueManager.js';
import * as fs from 'fs';

export class RepomixWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'repomixRunner.controlPanel';
  private _view?: vscode.WebviewView;
  private _controllers: BaseController[] = [];
  private _queueManager?: ExecutionQueueManager;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _bundleManager: BundleManager,
    private readonly _context: vscode.ExtensionContext,
    private readonly _databaseService: DatabaseService
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

    // Initialize Services & Controllers
    const webviewContext = {
      webview: webviewView.webview,
      postMessage: (msg: any) => webviewView.webview.postMessage(msg)
    };

    // Callback when run completes -> refresh bundles
    const onRunComplete = () => {
      const bundleCtrl = this._controllers.find(c => c instanceof BundleController) as BundleController;
      bundleCtrl?.refreshBundles();
      bundleCtrl?.refreshDefaultRepomixState();
    };

    this._queueManager = new ExecutionQueueManager(webviewContext, this._bundleManager, onRunComplete);

    this._controllers = [
      new BundleController(webviewContext, this._bundleManager, this._queueManager),
      new AgentController(webviewContext, this._databaseService, this._context),
      new ConfigController(webviewContext, this._context),
      new IndexingController(webviewContext, this._databaseService),
      new DebugController(webviewContext, this._databaseService)
    ];

    // Main Message Dispatcher
    webviewView.webview.onDidReceiveMessage(async (data) => {
      let message;
      try {
        message = WebviewMessageSchema.parse(data);

        // Manual refine check for SaveSecretSchema because discriminatedUnion
        // uses the base schema which lacks the superRefine validation
        if (message.command === 'saveSecret') {
            const { SaveSecretSchema } = await import('./messageSchemas.js');
            message = SaveSecretSchema.parse(data);
        }
      } catch (error) {
        console.error('Invalid webview message:', error);
        vscode.window.showErrorMessage(`Invalid message: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      // Handle global events
      if (message.command === 'webviewLoaded') {
        await this._sendVersion();
        await Promise.all(this._controllers.map(c => c.onWebviewLoaded()));
        // Also get initial Pinecone index status
        const configCtrl = this._controllers.find(c => c instanceof ConfigController) as ConfigController;
        await configCtrl.handleMessage({ command: 'getPineconeIndex' });
        return;
      }

      if (message.command === 'openFile') {
        await this._handleOpenFile(message.path);
        return;
      }

      // Dispatch to controllers
      let handled = false;
      for (const controller of this._controllers) {
        if (await controller.handleMessage(message)) {
          handled = true;
          break;
        }
      }

      if (!handled) {
        console.warn(`Unhandled command: ${message.command}`);
      }
    });

    // Handle view visibility for refreshing
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._controllers.forEach(c => c.onWebviewLoaded());
      }
    });

    // Listen for window focus to re-check file existence
    const focusSubscription = vscode.window.onDidChangeWindowState((e) => {
      if (e.focused && this._view?.visible) {
        const bundleCtrl = this._controllers.find(c => c instanceof BundleController) as BundleController;
        bundleCtrl?.refreshBundles();
        bundleCtrl?.refreshDefaultRepomixState();
      }
    });

    // Cleanup on dispose
    webviewView.onDidDispose(() => {
      this._controllers.forEach(c => c.dispose());
      focusSubscription.dispose();
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

  private async _handleOpenFile(filePath: string): Promise<void> {
    try {
      if (!fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`File not found: ${filePath}`);
        return;
      }

      const uri = vscode.Uri.file(filePath);
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
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