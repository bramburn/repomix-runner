import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import { BaseController } from './BaseController.js';
import { getRepoId } from '../../utils/repoIdentity.js';

export class ConfigController extends BaseController {
  constructor(context: any, private readonly extensionContext: ExtensionContext) {
    super(context);
  }

  async handleMessage(message: any): Promise<boolean> {
    console.log('[ConfigController] handleMessage received command:', message.command);
    if (message.command === 'testQdrantConnection') {
      console.log('[ConfigController] testQdrantConnection details:', JSON.stringify(message, null, 2));
    }

    switch (message.command) {
      // --- Secrets Management ---
      case 'checkSecret':
        await this.handleCheckSecret(message.key);
        return true;
      case 'saveSecret':
        await this.handleSaveSecret(message.key, message.value);
        return true;

      // --- Pinecone Index Management ---
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

      // --- Vector DB Provider & Qdrant ---
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
        // Ensure inputs are strings
        await this.handleSetQdrantConfig(String(message.url), String(message.collection));
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

  // --- Pinecone Index Logic ---
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

  private async handleSetQdrantConfig(url: string, collection: string) {
    // Explicitly validate strings to prevent bad state
    const nextUrl = url || '';
    const nextCollection = collection || '';

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
    console.log('[ConfigController] === Qdrant Test Connection Handler Started ===');
    console.log('[ConfigController] Received URL:', url);
    console.log('[ConfigController] Received collection:', collection);
    console.log('[ConfigController] Received apiKey present:', !!apiKey);
    console.log('[ConfigController] Received apiKey length:', apiKey?.length);

    try {
      // Step 1: Validate URL format
      console.log('[ConfigController] Step 1: Validating URL format...');
      if (!this.validateQdrantUrl(url)) {
        console.error('[ConfigController] URL validation FAILED');
        throw new Error('Invalid URL format. Must be a valid http:// or https:// URL');
      }
      console.log('[ConfigController] URL validation PASSED');

      // Step 2: Import QdrantClient
      console.log('[ConfigController] Step 2: Importing @qdrant/js-client-rest...');
      const { QdrantClient } = await import('@qdrant/js-client-rest');
      console.log('[ConfigController] QdrantClient imported successfully');

      // Step 3: Build client config
      console.log('[ConfigController] Step 3: Building client config...');
      const clientConfig: any = {
        url,
        timeout: 30000,
        // Custom fetch for VSCode extension host compatibility
        // Fix: Use standard AbortController logic compatible with older Node versions
        fetch: (input: any, init: any) => {
          console.log('[ConfigController] Custom fetch called with input:', input);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 30000);

          // Merge signals if one is already provided
          const signal = init?.signal
             ? (anySignal(init.signal, controller.signal)) // Simplified logic below
             : controller.signal;

          console.log('[ConfigController] Fetch request about to be sent...');
          return fetch(input, {
            ...init,
            cache: 'no-store',
            signal: signal
          }).finally(() => clearTimeout(timeoutId));
        }
      };
      console.log('[ConfigController] Client config built:', JSON.stringify({ url: clientConfig.url, timeout: clientConfig.timeout, hasApiKey: !!clientConfig.apiKey }));

      if (apiKey) {
        clientConfig.apiKey = apiKey;
        console.log('[ConfigController] API key added to config (first 8 chars):', apiKey.substring(0, 8) + '...');
      }

      // Step 4: Create client
      console.log('[ConfigController] Step 4: Creating QdrantClient instance...');
      const client = new QdrantClient(clientConfig);
      console.log('[ConfigController] QdrantClient instance created');

      // Step 5: Test connection by listing collections
      console.log('[ConfigController] Step 5: Calling client.getCollections()...');
      const response = await client.getCollections();
      console.log('[ConfigController] getCollections() succeeded!');
      console.log('[ConfigController] Response status:', response.status ? response.status : 'no status field');
      console.log('[ConfigController] Collections found:', response.collections?.length || 0);
      console.log('[ConfigController] Collection names:', response.collections?.map((c: any) => c.name) || []);

      const exists = response.collections.some((c: any) => c.name === collection);
      console.log('[ConfigController] Collection "' + collection + '" exists:', exists);

      // Step 6: Create collection if it doesn't exist
      if (!exists) {
        console.log('[ConfigController] Step 6: Creating collection "' + collection + '"...');
        await client.createCollection(collection, {
          vectors: {
            size: 768,
            distance: 'Cosine'
          }
        });
        console.log('[ConfigController] Collection created successfully');

        const resultMessage = `Connected to Qdrant and created collection "${collection}"`;
        console.log('[ConfigController] Sending success result:', resultMessage);
        this.context.postMessage({
          command: 'qdrantConnectionResult',
          success: true,
          message: resultMessage
        });
        vscode.window.showInformationMessage(resultMessage);
      } else {
        const resultMessage = `Connected to Qdrant. Collection "${collection}" already exists.`;
        console.log('[ConfigController] Sending success result:', resultMessage);
        this.context.postMessage({
          command: 'qdrantConnectionResult',
          success: true,
          message: resultMessage
        });
        vscode.window.showInformationMessage(resultMessage);
      }
      console.log('[ConfigController] === Qdrant Test Connection Completed Successfully ===');

    } catch (error: unknown) {
      let errorMessage = error instanceof Error ? error.message : String(error);

      // More descriptive error for fetch failures
      if (errorMessage.includes('fetch failed')) {
        errorMessage = `Could not connect to ${url}. Please check if the Qdrant server is running and accessible.`;
      }

      console.error('[ConfigController] === Qdrant Test Connection Failed ===');
      console.error('[ConfigController] Error message:', errorMessage);
      console.error('[ConfigController] Error name:', error instanceof Error ? error.name : 'unknown');
      console.error('[ConfigController] Full error:', error);
      console.error('[ConfigController] Stack trace:', error instanceof Error ? error.stack : 'no stack');

      console.error('[ConfigController] Sending failure result to webview...');
      this.context.postMessage({
        command: 'qdrantConnectionResult',
        success: false,
        error: errorMessage
      });
      vscode.window.showErrorMessage(`Qdrant connection failed: ${errorMessage}`);
    }
  }
}

// Helper to support signal composition if needed (though usually not strict for this case)
function anySignal(s1: AbortSignal, s2: AbortSignal): AbortSignal {
  if (s1.aborted) return s1;
  if (s2.aborted) return s2;
  // Fallback: just return the controller signal as it's the timeout one which is most critical
  return s2;
}