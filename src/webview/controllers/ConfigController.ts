import * as vscode from 'vscode';
import { BaseController } from './BaseController.js';
import { getRepoId } from '../../utils/repoIdentity.js';

export class ConfigController extends BaseController {
  constructor(context: any, private readonly extensionContext: vscode.ExtensionContext) {
    super(context);
  }

  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      case 'checkApiKey':
        await this.checkApiKey();
        return true;
      case 'saveApiKey':
        await this.handleSaveApiKey(message.apiKey);
        return true;
      case 'checkSecret':
        await this.checkSecret(message.key);
        return true;
      case 'saveSecret':
        await this.saveSecret(message.key, message.value);
        return true;
      case 'fetchPineconeIndexes':
        await this.handleFetchPineconeIndexes(message.apiKey);
        return true;
      case 'savePineconeIndex':
        await this.handleSavePineconeIndex(message.index);
        return true;
      case 'getPineconeIndex':
        await this.handleGetPineconeIndex();
        return true;
      case 'getCopyMode':
        await this.handleGetCopyMode();
        return true;
      case 'setCopyMode':
        await this.handleSetCopyMode(message.mode);
        return true;
    }
    return false;
  }

  private async checkApiKey() {
    const key = await this.extensionContext.secrets.get('repomix.agent.googleApiKey');
    this.context.postMessage({ command: 'apiKeyStatus', hasKey: !!key });
  }

  private async handleSaveApiKey(apiKey: string) {
    if (apiKey) {
      await this.extensionContext.secrets.store('repomix.agent.googleApiKey', apiKey);
      vscode.window.showInformationMessage('API Key saved successfully!');
      await this.checkApiKey();
    }
  }

  private async checkSecret(key: 'googleApiKey' | 'pineconeApiKey') {
    try {
      const storageKey = key === 'googleApiKey' ? 'repomix.agent.googleApiKey' : 'repomix.agent.pineconeApiKey';
      const value = await this.extensionContext.secrets.get(storageKey);

      this.context.postMessage({
        command: 'secretStatus',
        key,
        exists: !!value
      });
    } catch (error) {
      console.error(`Failed to check secret for ${key}:`, error);
    }
  }

  private async saveSecret(key: 'googleApiKey' | 'pineconeApiKey', value: string) {
    try {
      const storageKey = key === 'googleApiKey' ? 'repomix.agent.googleApiKey' : 'repomix.agent.pineconeApiKey';
      await this.extensionContext.secrets.store(storageKey, value);

      // Send updated status back to UI
      await this.checkSecret(key);
      vscode.window.showInformationMessage(`${key === 'googleApiKey' ? 'Google' : 'Pinecone'} API Key saved successfully!`);
    } catch (error) {
      console.error(`Failed to save secret for ${key}:`, error);
      vscode.window.showErrorMessage(`Failed to save ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleFetchPineconeIndexes(explicitKey?: string) {
    try {
      let apiKey = explicitKey;
      if (!apiKey) {
        apiKey = await this.extensionContext.secrets.get('repomix.agent.pineconeApiKey');
      }

      if (!apiKey) {
        this.context.postMessage({
          command: 'updatePineconeIndexes',
          indexes: [],
          error: 'Missing Pinecone API Key'
        });
        return;
      }

      const { Pinecone } = await import('@pinecone-database/pinecone');
      const pc = new Pinecone({ apiKey });
      const indexList = await pc.listIndexes();

      this.context.postMessage({
        command: 'updatePineconeIndexes',
        indexes: indexList.indexes || [],
      });
    } catch (error: unknown) {
      console.error('Failed to fetch Pinecone indexes:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.postMessage({
        command: 'updatePineconeIndexes',
        indexes: [],
        error: errorMessage
      });
    }
  }

  private async handleSavePineconeIndex(index: any) {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder open');
      }

      if (workspaceFolders.length > 1) {
        vscode.window.showWarningMessage('Multiple workspace roots detected. Saving Pinecone index for the first root only.');
      }

      const rootPath = workspaceFolders[0].uri.fsPath;
      const repoId = await getRepoId(rootPath);

      // Get existing map or initialize new one
      const repoConfigs: Record<string, any> = this.extensionContext.globalState.get('repomix.pinecone.selectedIndexByRepo') || {};

      // Update for this repo
      repoConfigs[repoId] = index;

      await this.extensionContext.globalState.update('repomix.pinecone.selectedIndexByRepo', repoConfigs);

      // Also clear the legacy global key to avoid confusion
      await this.extensionContext.globalState.update('repomix.pinecone.selectedIndex', undefined);

    } catch (error) {
      console.error('Failed to save Pinecone index:', error);
      vscode.window.showErrorMessage(`Failed to save selected index: ${error}`);
    }
  }

  private async handleGetPineconeIndex() {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        this.context.postMessage({ command: 'updateSelectedIndex', index: null });
        return;
      }

      const rootPath = workspaceFolders[0].uri.fsPath;
      const repoId = await getRepoId(rootPath);

      const repoConfigs: Record<string, any> = this.extensionContext.globalState.get('repomix.pinecone.selectedIndexByRepo') || {};
      const index = repoConfigs[repoId] || null;

      this.context.postMessage({
        command: 'updateSelectedIndex',
        index
      });
    } catch (error) {
      console.error('Failed to get Pinecone index:', error);
      this.context.postMessage({ command: 'updateSelectedIndex', index: null });
    }
  }

  private async handleGetCopyMode() {
    try {
      const config = vscode.workspace.getConfiguration('repomix.runner');
      const copyMode = config.get<string>('copyMode') || 'file'; // default to 'file' matching package.json (though package.json says default "content" - checking code)
      // Actually package.json default is "content". Let's stick to what we read.

      this.context.postMessage({
        command: 'updateCopyMode',
        mode: copyMode
      });
    } catch (error) {
      console.error('Failed to get copy mode:', error);
    }
  }

  private async handleSetCopyMode(mode: string) {
    try {
      if (mode !== 'content' && mode !== 'file') {
        throw new Error(`Invalid copy mode: ${mode}`);
      }

      const config = vscode.workspace.getConfiguration('repomix.runner');
      await config.update('copyMode', mode, vscode.ConfigurationTarget.Global);

      // Refresh the UI to confirm
      await this.handleGetCopyMode();
    } catch (error) {
      console.error('Failed to set copy mode:', error);
      vscode.window.showErrorMessage(`Failed to set copy mode: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}