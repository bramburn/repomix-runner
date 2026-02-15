import * as vscode from 'vscode';

export class AiChatWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'repomixRunner.aiChatMain';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {
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
    } as vscode.WebviewOptions & { enableNodeIntegration?: boolean };
    (webviewView.webview.options as any).enableNodeIntegration = true;

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    console.log('[AiChatWebviewProvider] Webview HTML set');

    // Set up message handler if needed in the future
    webviewView.webview.onDidReceiveMessage(async (data) => {
      console.log('[AiChatWebviewProvider] Received message:', data.command);
      // Future message handling will go here
    });
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