import * as vscode from 'vscode';
import type { Pool } from 'pg';
import { ChatController } from './controllers/ChatController.js';
import type { BatchPoller } from '../chat/batch/batchPoller.js';
import type { BatchManager } from '../chat/batch/batchManager.js';

export class AiChatWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'repomixRunner.aiChatMain';
  private _view?: vscode.WebviewView;
  private _chatController?: ChatController;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _extensionContext: vscode.ExtensionContext,
    private readonly _pgPool: Pool | null,
    private readonly _sharedBatchManager?: BatchManager,
    private readonly _sharedBatchPoller?: BatchPoller
  ) {
    console.log('[AiChatWebviewProvider] Constructor called');
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    console.log('[AiChatWebviewProvider] resolveWebviewView called');
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'dist')],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    console.log('[AiChatWebviewProvider] Webview HTML set');

    if (this._pgPool) {
      const webviewContext = {
        webview: webviewView.webview,
        postMessage: (msg: any) => webviewView.webview.postMessage(msg),
      };

      this._chatController = new ChatController(
        webviewContext,
        this._extensionContext,
        this._pgPool,
        this._sharedBatchManager,
        this._sharedBatchPoller
      );

      webviewView.webview.onDidReceiveMessage(async (data) => {
        console.log('[AiChatWebviewProvider] Received message:', data.command);

        if (data.command === 'webviewLoaded') {
          await this._chatController!.onWebviewLoaded();
          return;
        }

        await this._chatController!.handleMessage(data);
      });

      webviewView.onDidDispose(() => {
        this._chatController?.dispose();
        this._chatController = undefined;
      });
    } else {
      // No database pool — handle settings/secret commands so users can configure
      // the connection string, while showing a disabled message for chat features.
      webviewView.webview.onDidReceiveMessage(async (data) => {
        if (data.command === 'webviewLoaded') {
          webviewView.webview.postMessage({
            command: 'chatDisabled',
            message:
              'PostgreSQL connection not configured. Set the PostgreSQL connection string in the Settings tab to enable chat, then reload the window.',
          });
          return;
        }

        // Delegate to the lightweight settings handler
        await this._handleMessageWithoutDb(data, webviewView.webview);
      });
    }
  }

  /**
   * Handles settings-related webview messages when the database pool is not available.
   * This ensures the Settings tab is always functional so users can configure
   * the PostgreSQL connection string even before the pool is initialized.
   */
  private async _handleMessageWithoutDb(data: any, webview: vscode.Webview): Promise<void> {
    if (data.command === 'getChatSettings') {
      try {
        const config = vscode.workspace.getConfiguration('repomix.chat');
        webview.postMessage({
          command: 'chatSettingsResult',
          settings: {
            postgresConnectionString: undefined,
            planningModel: config.get<'gemini-2.5-flash' | 'gemini-2.5-flash-lite'>('planningModel', 'gemini-2.5-flash'),
            planningRpm: config.get<number>('planningRpm', 60),
            batchModel: config.get<string>('batchModel', 'claude-opus-4-20250514'),
            batchMaxTokens: config.get<number>('batchMaxTokens', 16384),
            batchThinkingBudget: config.get<number>('batchThinkingBudget', 10000),
            batchPollIntervalSeconds: config.get<number>('batchPollIntervalSeconds', 60),
            contextThresholdPercent: config.get<number>('contextThresholdPercent', 80),
            maxRecentMessages: config.get<number>('maxRecentMessages', 10),
            fileCompressionLevel: config.get<'auto' | 'full' | 'skeleton' | 'summary'>('fileCompressionLevel', 'auto'),
            editMode: config.get<'full' | 'search_replace' | 'hybrid'>('editMode', 'hybrid'),
            hybridThresholdLines: config.get<number>('hybridThresholdLines', 300),
            fuzzyMatchThreshold: config.get<number>('fuzzyMatchThreshold', 0.8),
            architectureRefreshHours: config.get<number>('architectureRefreshHours', 24),
            architectureLastGenerated: undefined,
            architectureStatus: 'missing' as const,
          },
        });
      } catch (error) {
        console.error('[AiChatWebviewProvider] Failed to get chat settings', error);
      }
      return;
    }

    if (data.command === 'setChatSetting') {
      try {
        const config = vscode.workspace.getConfiguration('repomix.chat');
        await config.update(data.key, data.value, vscode.ConfigurationTarget.Global);
        // Re-send settings to confirm
        await this._handleMessageWithoutDb({ command: 'getChatSettings' }, webview);
      } catch (error) {
        console.error('[AiChatWebviewProvider] Failed to set chat setting', error);
      }
      return;
    }

    if (data.command === 'saveSecret') {
      try {
        if (!data.value || !data.value.trim()) {
          await this._extensionContext.secrets.delete(data.key);
        } else {
          await this._extensionContext.secrets.store(data.key, data.value);
        }
        webview.postMessage({
          command: 'secretStatus',
          key: data.key,
          exists: !!(data.value && data.value.trim()),
        });
      } catch (error) {
        console.error('[AiChatWebviewProvider] Failed to save secret', error);
        webview.postMessage({
          command: 'showNotification',
          type: 'error',
          message: `Failed to save secret: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      return;
    }

    if (data.command === 'checkSecret') {
      try {
        const exists = !!(await this._extensionContext.secrets.get(data.key));
        webview.postMessage({
          command: 'secretStatus',
          key: data.key,
          exists,
        });
      } catch (error) {
        console.error('[AiChatWebviewProvider] Failed to check secret', error);
      }
      return;
    }

    if (data.command === 'testPostgresConnection') {
      try {
        // Check settings first, then secrets
        const config = vscode.workspace.getConfiguration('repomix.chat');
        const settingValue = config.get<string>('postgresConnectionString');
        const secretValue = await this._extensionContext.secrets.get('postgresConnectionString');
        const connectionString = settingValue?.trim() || secretValue;

        if (!connectionString) {
          webview.postMessage({
            command: 'postgresConnectionResult',
            success: false,
            error: 'PostgreSQL connection string not configured. Set it in VS Code Settings (repomix.chat.postgresConnectionString) or save it in the Repomix Settings tab.',
          });
          return;
        }
        const { testConnectionString } = await import('../chat/db/postgresClient.js');
        const result = await testConnectionString(connectionString);
        webview.postMessage({
          command: 'postgresConnectionResult',
          success: result.success,
          error: result.success ? undefined : result.message,
        });
      } catch (error) {
        webview.postMessage({
          command: 'postgresConnectionResult',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (data.command === 'runMigrations') {
      try {
        // Check settings first, then secrets
        const config = vscode.workspace.getConfiguration('repomix.chat');
        const settingValue = config.get<string>('postgresConnectionString');
        const secretValue = await this._extensionContext.secrets.get('postgresConnectionString');
        const connectionString = settingValue?.trim() || secretValue;

        if (!connectionString) {
          webview.postMessage({
            command: 'migrationsComplete',
            success: false,
            error: 'PostgreSQL connection string not configured. Set it in VS Code Settings (repomix.chat.postgresConnectionString) or save it in the Repomix Settings tab.',
          });
          return;
        }
        const { initPool, verifyMigration } = await import('../chat/db/postgresClient.js');
        await initPool(connectionString);
        const migrationResult = await verifyMigration();
        webview.postMessage({
          command: 'migrationsComplete',
          success: migrationResult.success,
          error: migrationResult.success ? undefined : migrationResult.message,
        });
      } catch (error) {
        webview.postMessage({
          command: 'migrationsComplete',
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (data.command === 'getMemories') {
      // No DB available — return empty list
      webview.postMessage({
        command: 'memoryList',
        scope: data.scope,
        memories: [],
      });
      return;
    }

    if (data.command === 'searchMemories') {
      webview.postMessage({
        command: 'memoryList',
        scope: data.scope,
        memories: [],
      });
      return;
    }

    if (data.command === 'searchThreads') {
      webview.postMessage({
        command: 'threadsSearchResult',
        threads: [],
        total: 0,
      });
      return;
    }

    // Any other command while DB is unavailable — silently ignore
    console.log('[AiChatWebviewProvider] Ignoring command (no DB):', data.command);
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
        <title>AI Developer Chat</title>
        <script nonce="${nonce}">
          window.initialView = 'ai-chat';
        </script>
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
