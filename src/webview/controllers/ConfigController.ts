import * as vscode from 'vscode';
import { BaseController } from './BaseController.js';

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
      await this.extensionContext.globalState.update('repomix.pinecone.selectedIndex', index);
      // Optional: Confirm save back to UI?
      // For now, let's just assume it saved.
    } catch (error) {
      console.error('Failed to save Pinecone index:', error);
      vscode.window.showErrorMessage(`Failed to save selected index: ${error}`);
    }
  }

  private async handleGetPineconeIndex() {
    try {
      const index = this.extensionContext.globalState.get('repomix.pinecone.selectedIndex');
      this.context.postMessage({
        command: 'updateSelectedIndex',
        index
      });
    } catch (error) {
      console.error('Failed to get Pinecone index:', error);
    }
  }
}