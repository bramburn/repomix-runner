import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import { BaseController } from './BaseController.js';
import { getRepoId } from '../../utils/repoIdentity.js'; //

export class ConfigController extends BaseController {
  constructor(context: any, private readonly extensionContext: ExtensionContext) {
    super(context);
  }

  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      // --- Secrets Management (New & Correct) ---
      case 'checkSecret':
        await this.handleCheckSecret(message.key);
        return true;
      case 'saveSecret':
        await this.handleSaveSecret(message.key, message.value);
        return true;

      // --- Pinecone Index Management (RESTORED) ---
      // These are required for the Settings Dropdown to work
      case 'fetchPineconeIndexes':
        await this.handleFetchPineconeIndexes(message.apiKey);
        return true;
      case 'savePineconeIndex':
        await this.handleSavePineconeIndex(message.index);
        return true;
      case 'getPineconeIndex':
        await this.handleGetPineconeIndex();
        return true;

      // --- Copy Mode ---
      case 'getCopyMode':
        await this.handleGetCopyMode();
        return true;
      case 'setCopyMode':
        await this.handleSetCopyMode(message.mode);
        return true;

      // --- Vector DB Provider & Qdrant (New) ---
      case 'getVectorDbProvider':
        await this.handleGetVectorDbProvider();
        return true;
      case 'setVectorDbProvider':
        await this.handleSetVectorDbProvider(message.provider);
        return true;

      case 'getQdrantConfig':
        await this.handleGetQdrantConfig();
        return true;
      case 'setQdrantConfig':
        await this.handleSetQdrantConfig(message.url, message.collection);
        return true;

      case 'testQdrantConnection':
        await this.handleTestQdrantConnection(message.url, message.collection, message.apiKey);
        return true;
    }
    return false;
  }

  // --- Handlers ---

  private async handleCheckSecret(key: 'googleApiKey' | 'pineconeApiKey' | 'qdrantApiKey') {
    try {
      const storageKey =
        key === 'googleApiKey'
          ? 'repomix.agent.googleApiKey'
          : key === 'pineconeApiKey'
            ? 'repomix.agent.pineconeApiKey'
            : 'repomix.agent.qdrantApiKey';
      const secret = await this.extensionContext.secrets.get(storageKey);
      this.context.postMessage({ command: 'secretStatus', key, exists: !!secret });
    } catch (err) {
      console.error('Failed to check secret:', err);
    }
  }

  private async handleSaveSecret(key: 'googleApiKey' | 'pineconeApiKey' | 'qdrantApiKey', value: string) {
    try {
      const storageKey =
        key === 'googleApiKey'
          ? 'repomix.agent.googleApiKey'
          : key === 'pineconeApiKey'
            ? 'repomix.agent.pineconeApiKey'
            : 'repomix.agent.qdrantApiKey';
      await this.extensionContext.secrets.store(storageKey, value);
      this.context.postMessage({ command: 'secretStatus', key, exists: true });

      const label =
        key === 'googleApiKey' ? 'Google' : key === 'pineconeApiKey' ? 'Pinecone' : 'Qdrant';
      vscode.window.showInformationMessage(`${label} API Key saved successfully!`);
    } catch (err) {
      console.error('Failed to save secret:', err);
      vscode.window.showErrorMessage('Failed to save API Key.');
    }
  }

  // --- RESTORED: Pinecone Index Logic ---
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

      const rootPath = workspaceFolders[0].uri.fsPath;
      const repoId = await getRepoId(rootPath);

      // Get existing map or initialize new one
      const repoConfigs: Record<string, any> = this.extensionContext.globalState.get('repomix.pinecone.selectedIndexByRepo') || {};

      // Update for this repo
      repoConfigs[repoId] = index;

      await this.extensionContext.globalState.update('repomix.pinecone.selectedIndexByRepo', repoConfigs);

      // Clear legacy global key if it exists
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
  // --- END RESTORED ---

  private async handleGetCopyMode() {
    // Note: Switched to globalState as per your diff (was config.get before)
    const mode = this.extensionContext.globalState.get('repomix.runner.copyMode') ?? 'content';
    this.context.postMessage({ command: 'updateCopyMode', mode });
  }

  private async handleSetCopyMode(mode: string) {
    await this.extensionContext.globalState.update('repomix.runner.copyMode', mode);
    this.context.postMessage({ command: 'updateCopyMode', mode });
  }

  private async handleGetVectorDbProvider() {
    const provider =
      (this.extensionContext.globalState.get('repomix.vectorDb.provider') as string) ?? 'pinecone';
    this.context.postMessage({ command: 'vectorDbProvider', provider });
  }

  private async handleSetVectorDbProvider(provider: any) {
    const normalized = provider === 'qdrant' ? 'qdrant' : 'pinecone';
    await this.extensionContext.globalState.update('repomix.vectorDb.provider', normalized);
    this.context.postMessage({ command: 'vectorDbProvider', provider: normalized });
  }

  private async handleGetQdrantConfig() {
    const url = (this.extensionContext.globalState.get('repomix.qdrant.url') as string) ?? '';
    const collection =
      (this.extensionContext.globalState.get('repomix.qdrant.collection') as string) ?? '';
    this.context.postMessage({ command: 'qdrantConfig', url, collection });
  }

  private async handleSetQdrantConfig(url: any, collection: any) {
    const nextUrl = typeof url === 'string' ? url : '';
    const nextCollection = typeof collection === 'string' ? collection : '';

    await this.extensionContext.globalState.update('repomix.qdrant.url', nextUrl);
    await this.extensionContext.globalState.update('repomix.qdrant.collection', nextCollection);

    this.context.postMessage({
      command: 'qdrantConfig',
      url: nextUrl,
      collection: nextCollection,
    });
    vscode.window.showInformationMessage('Qdrant settings saved.');
  }

  private validateQdrantUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }


  private async handleTestQdrantConnection(url: string, collection: string, apiKey?: string) {
    try {
      // Validate URL format
      if (!this.validateQdrantUrl(url)) {
        throw new Error('Invalid URL format. Must be a valid http:// or https:// URL');
      }

      // DYNAMIC IMPORT: Use the new official client
      const { QdrantClient } = await import('@qdrant/js-client-rest');

      const clientConfig: any = {
        url,
        timeout: 30000,
        // Custom fetch for VSCode extension host compatibility
        fetch: (input: any, init: any) => {
          return fetch(input, {
            ...init,
            cache: 'no-store',
            signal: AbortSignal.timeout(30000)
          });
        }
      };

      if (apiKey) {
        clientConfig.apiKey = apiKey;
      }

      const client = new QdrantClient(clientConfig);

      // Test connection by listing collections
      const response = await client.getCollections();

      // API DIFFERENCE: The new client returns { collections: [{ name: string }] }
      const exists = response.collections.some((c: any) => c.name === collection);

      if (!exists) {
        // Create collection if it doesn't exist
        // API DIFFERENCE: structure for vectors config is slightly stricter
        await client.createCollection(collection, {
          vectors: {
            size: 768,
            distance: 'Cosine'
          }
        });

        this.context.postMessage({
          command: 'qdrantConnectionResult',
          success: true,
          message: `Connected to Qdrant and created collection "${collection}"`
        });
        vscode.window.showInformationMessage(`Connected to Qdrant and created collection "${collection}"`);
      } else {
        this.context.postMessage({
          command: 'qdrantConnectionResult',
          success: true,
          message: `Connected to Qdrant. Collection "${collection}" already exists.`
        });
        vscode.window.showInformationMessage(`Connected to Qdrant. Collection "${collection}" already exists.`);
      }

    } catch (error: unknown) {
      let errorMessage = error instanceof Error ? error.message : String(error);

      // Log full error details for debugging
      console.error('Failed to test Qdrant connection', {
        message: errorMessage,
        cause: error instanceof Error ? error.cause : undefined,
        stack: error instanceof Error ? error.stack : undefined,
        url: url
      });


      this.context.postMessage({
        command: 'qdrantConnectionResult',
        success: false,
        error: errorMessage
      });
      vscode.window.showErrorMessage(`Qdrant connection failed: ${errorMessage}`);
    }

  }
}