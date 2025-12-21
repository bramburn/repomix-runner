import * as vscode from 'vscode';

export interface IWebviewContext {
  webview: vscode.Webview;
  postMessage(message: any): Thenable<boolean>;
}

export abstract class BaseController {
  constructor(protected readonly context: IWebviewContext) {}

  // Abstract method to handle messages, returns true if handled
  abstract handleMessage(message: any): Promise<boolean>;

  // Optional: Called when the webview is initially loaded
  async onWebviewLoaded(): Promise<void> {}

  // Optional: Called when the controller is disposed
  dispose(): void {}
}