import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BundleManager } from '../core/bundles/bundleManager.js';
import { DatabaseService } from '../core/storage/databaseService.js';
import { WebviewMessageSchema } from './messageSchemas.js';
import { setClientInfo } from '../core/files/remoteDetection.js';
import { ExtensionServices } from '../core/services/ExtensionServices.js';
import { IndexingState } from '../core/services/IndexingService.js';
import { getCwd } from '../config/getCwd.js';
import { getRepoId } from '../utils/repoIdentity.js';
import { getRepomixOutputPath } from '../utils/repomix_output_detector.js';
import { resolveBundleOutputPath } from '../core/files/outputPathResolver.js';
import { Bundle } from '../core/bundles/types.js';

// Controllers
import { BaseController } from './controllers/BaseController.js';
import { BundleController } from './controllers/BundleController.js';
import { AgentController } from './controllers/AgentController.js';
import { ConfigController } from './controllers/ConfigController.js';
import { DebugController } from './controllers/DebugController.js';
import { IndexingController } from './controllers/IndexingController.js';
import { IndexHistoryController } from './controllers/IndexHistoryController.js';
import { ExecutionQueueManager } from './services/ExecutionQueueManager.js';
import type { Pool } from 'pg';

/**
 * HydrateState - Combined initial state sent to webview on load.
 * This consolidates all initial state into a single message to avoid
 * race conditions and UI flicker.
 */
interface HydrateState {
  // Version
  version: string;
  
  // Indexing state
  indexingState: IndexingState;
  indexingProgress?: { completed: number; total: number };
  indexingBlocked: boolean;
  repoIndexCount: number;
  
  // Bundles
  bundles: any[];
  defaultRepomix: {
    outputFileExists: boolean;
    outputFilePath: string;
  };
}


export class RepomixWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'repomixRunner.controlPanel';
  private _view?: vscode.WebviewView;
  private _controllers: BaseController[] = [];
  private _queueManager?: ExecutionQueueManager;

  // Derived references from ExtensionServices for convenience
  private readonly _bundleManager: BundleManager;
  private readonly _databaseService: DatabaseService;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _services: ExtensionServices,
    private readonly _pgPool: Pool | null = null
  ) {
    console.log('[quick-repomix] RepomixWebviewProvider constructor called');
    this._bundleManager = _services.bundleManager;
    this._databaseService = _services.databaseService;
  }

  /**
   * Posts a message to the webview
   */
  public postMessage(message: any): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    console.log('[quick-repomix] ===== resolveWebviewView START =====');
    this._view = webviewView;
    console.log('[quick-repomix] Webview view reference stored');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist')],
    };
    console.log('[quick-repomix] Webview options configured');

    console.log('[quick-repomix] Generating HTML for webview...');
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    console.log('[quick-repomix] HTML generated and set for webview');

    // Initialize Services & Controllers
    console.log('[quick-repomix] Initializing controllers...');
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

    const indexingCtrl = new IndexingController(webviewContext, this._databaseService, this._context, this._services.indexingService);
    this._controllers = [
      new BundleController(webviewContext, this._bundleManager, this._queueManager),
      new AgentController(webviewContext, this._databaseService, this._context),
      new ConfigController(webviewContext, this._context, this._databaseService, indexingCtrl),
      indexingCtrl,
      new DebugController(webviewContext, this._databaseService),
      new IndexHistoryController(webviewContext, this._databaseService),
    ];
    console.log('[quick-repomix] Controllers initialized:', this._controllers.length, 'controllers');

    // Main Message Dispatcher
    console.log('[quick-repomix] Setting up message handler...');
    webviewView.webview.onDidReceiveMessage(async (data) => {
      // Debug: Log incoming message before parsing
      console.log('[RepomixWebviewProvider] Received message from webview, command:', data.command);
      if (data.command === 'testQdrantConnection') {
        console.log('[RepomixWebviewProvider] testQdrantConnection message details:', JSON.stringify(data, null, 2));
      }

      let message;
      try {
        message = WebviewMessageSchema.parse(data);
        console.log('[RepomixWebviewProvider] Message schema validation passed for command:', message.command);

        // Manual refine check for SaveSecretSchema because discriminatedUnion
        // uses the base schema which lacks the superRefine validation
        if (message.command === 'saveSecret') {
          const { SaveSecretSchema } = await import('./messageSchemas.js');
          message = SaveSecretSchema.parse(data);
        }
      } catch (error) {
        console.error('[RepomixWebviewProvider] Message validation FAILED for command:', data.command);
        console.error('[RepomixWebviewProvider] Validation error:', error);
        console.error('[RepomixWebviewProvider] Original data:', data);
        vscode.window.showErrorMessage(`Invalid message: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }

      // Handle global events
      if (message.command === 'webviewLoaded') {
        console.log('[quick-repomix] ===== WEBVIEW LOADED MESSAGE RECEIVED =====');
        
        // Send consolidated hydrate state
        const hydrateState = await this._buildHydrateState();
        webviewView.webview.postMessage({
          command: 'hydrate',
          ...hydrateState
        });
        console.log('[quick-repomix] Hydrate state sent to webview');

        // Also call onWebviewLoaded for controllers that need to set up watchers, etc.
        // (backwards compatibility - controllers may still send individual updates)
        console.log('[quick-repomix] Calling onWebviewLoaded for all controllers...');
        await Promise.all(this._controllers.map(c => c.onWebviewLoaded()));
        console.log('[quick-repomix] All controllers initialized');

        // Also get initial Pinecone index status
        const configCtrl = this._controllers.find(c => c instanceof ConfigController) as ConfigController;
        await configCtrl.handleMessage({ command: 'getPineconeIndex' });
        console.log('[quick-repomix] Pinecone index status fetched');
        return;
      }

      if (message.command === 'openFile') {
        await this._handleOpenFile(message.path);
        return;
      }

      // Handle showNotification command for displaying notifications from controllers
      if (message.command === 'showNotification') {
        console.log('[RepomixWebviewProvider] Handling showNotification:', message);
        if (message.type === 'error') {
          vscode.window.showErrorMessage(message.message);
        } else if (message.type === 'warning') {
          vscode.window.showWarningMessage(message.message);
        } else {
          vscode.window.showInformationMessage(message.message);
        }
        return;
      }

      // Handle reportClientInfo command for client OS detection
      if (message.command === 'reportClientInfo') {
        console.log('[RepomixWebviewProvider] Received client info:', message);
        setClientInfo(message.clientOs, message.clientArch);
        return;
      }

      // Handle remote clipboard processing result
      if (message.command === 'remoteClipboardProcessingComplete') {
        console.log('[RepomixWebviewProvider] Handling remoteClipboardProcessingComplete:', message);
        const resolverKey = (message as any).resolverKey;
        if (resolverKey) {
          const resolver = this._context.workspaceState.get(resolverKey) as any;
          if (resolver) {
            if ((message as any).success) {
              resolver.resolve(message);
            } else {
              resolver.reject(new Error((message as any).error || 'Unknown error'));
            }
            // Clean up resolver
            this._context.workspaceState.update(resolverKey, undefined);
          }
        }
        return;
      }

      // Dispatch to controllers
      console.log('[RepomixWebviewProvider] Dispatching to controllers...');
      let handled = false;
      for (const controller of this._controllers) {
        const controllerName = controller.constructor.name;
        console.log(`[RepomixWebviewProvider] Trying ${controllerName}.handleMessage(${message.command})...`);
        if (await controller.handleMessage(message)) {
          console.log(`[RepomixWebviewProvider] ${controllerName}.handleMessage() handled the command`);
          handled = true;
          break;
        }
      }

      if (!handled) {
        console.warn(`[RepomixWebviewProvider] Unhandled command: ${message.command}`);
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

  /**
   * Build consolidated hydrate state for the webview.
   * This combines all initial state into a single object to avoid
   * race conditions where the UI briefly shows incorrect state.
   */
  private async _buildHydrateState(): Promise<HydrateState> {
    // Get version
    let version = '';
    try {
      const packageJsonPath = vscode.Uri.joinPath(this._extensionUri, 'package.json');
      const packageJsonData = await vscode.workspace.fs.readFile(packageJsonPath);
      const packageJson = JSON.parse(Buffer.from(packageJsonData).toString());
      version = packageJson.version;
    } catch (error) {
      console.error('Failed to get version:', error);
    }

    // Get indexing state from service
    const { state: indexingState, progress: indexingProgress } = await this._services.indexingService.getState();
    
    // Get indexing blocked status
    const indexingBlocked = !!this._context.globalState.get('repomix.indexingBlocked');

    // Get repo index count
    let repoIndexCount = 0;
    try {
      const cwd = getCwd();
      const repoId = await getRepoId(cwd);
      repoIndexCount = await this._databaseService.getRepoFileCount(repoId);
    } catch (error) {
      console.error('Failed to get repo index count:', error);
    }

    // Get bundles
    const bundleMetadata = await this._bundleManager.getAllBundles();
    const bundles = await Promise.all(
      Object.entries(bundleMetadata.bundles).map(async ([bundleId, bundle]) => {
        const outputFilePath = await resolveBundleOutputPath(bundle);
        return {
          id: bundleId,
          ...bundle,
          outputFilePath,
          outputFileExists: fs.existsSync(outputFilePath),
        };
      })
    );

    // Get default repomix state
    let defaultRepomix = { outputFileExists: false, outputFilePath: '' };
    try {
      const cwd = getCwd();
      const outputFilePath = getRepomixOutputPath(cwd);
      defaultRepomix = {
        outputFilePath,
        outputFileExists: fs.existsSync(outputFilePath),
      };
    } catch (error) {
      console.error('Failed to get default repomix state:', error);
    }

    return {
      version,
      indexingState,
      indexingProgress,
      indexingBlocked,
      repoIndexCount,
      bundles,
      defaultRepomix,
    };
  }

  private async _handleOpenFile(filePath: string): Promise<void> {
    try {
      // Search results store repo-relative paths (e.g. "src/foo.ts").
      // Convert to absolute path using the current workspace/repo root.
      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(vscode.workspace.rootPath ?? '', filePath);

      const uri = vscode.Uri.file(resolvedPath); // Convert resolvedPath to Uri
      try {
        await vscode.workspace.fs.stat(uri); // Check existence using VS Code's fs API
      } catch (error) {
        vscode.window.showErrorMessage(`File not found or inaccessible: ${filePath}`);
        return;
      }
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
        <title>Repomix Runner Plus Control Panel</title>
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
