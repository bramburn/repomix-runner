import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import { BaseController } from './BaseController.js';
import { getRepoId } from '../../utils/repoIdentity.js';
import { MigrationService } from '../../core/indexing/migrationService.js';
import { DatabaseService } from '../../core/storage/databaseService.js';
import { IndexingController } from './IndexingController.js';
import { getVectorDbAdapterForRepo } from '../../core/indexing/vectorDb/factory.js';
import { BlueprintService, initBlueprintService, getBlueprintService } from '../../fingerprint/blueprintService.js';

const SECRET_GOOGLE_GEMINI = 'repomix.agent.googleApiKey';
const SECRET_PINECONE = 'repomix.agent.pineconeApiKey';
const SECRET_QDRANT = 'repomix.agent.qdrantApiKey';
const SECRET_ANTHROPIC = 'repomix.chat.anthropicApiKey';
export const SECRET_POSTGRES_CONNECTION = 'postgresConnectionString';
type SecretKey = 'googleApiKey' | 'pineconeApiKey' | 'qdrantApiKey' | 'anthropicApiKey';

export class ConfigController extends BaseController {
  private migrationService: MigrationService;
  constructor(
    context: any,
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly databaseService: DatabaseService,
    private readonly indexingController: IndexingController
  ) {
    super(context);
    this.migrationService = new MigrationService(this.extensionContext.secrets, this.extensionContext.globalState, this.databaseService);
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

      // --- PostgreSQL Connection Management ---
      case 'checkPostgresConnection':
        await this.handleCheckPostgresConnection();
        return true;
      case 'savePostgresConnection':
        await this.handleSavePostgresConnection(message.value);
        return true;
      case 'deletePostgresConnection':
        await this.handleDeletePostgresConnection();
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

      // --- Token Budget ---
      case 'getTokenBudget':
        await this.handleGetTokenBudget();
        return true;
      case 'setTokenBudget':
        await this.handleSetTokenBudget(message.budget);
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

      case 'getVectorDbCollectionInfo':
        await this.handleGetVectorDbCollectionInfo();
        return true;

      case 'fetchQdrantCollections':
        await this.handleFetchQdrantCollections(message.apiKey);
        return true;

      // --- Embedding Provider Configuration ---
      case 'getEmbeddingConfig':
        await this.handleGetEmbeddingConfig();
        return true;
      case 'setEmbeddingConfig':
        await this.handleSetEmbeddingConfig(message);
        return true;
      case 'fetchOllamaModels':
        await this.handleFetchOllamaModels(message.url);
        return true;
      case 'testOllamaDimension':
        await this.handleTestOllamaDimension(message.url, message.model);
        return true;
      case 'fetchLMStudioModels':
        await this.handleFetchLMStudioModels(message.baseUrl, message.apiKey);
        return true;
      case 'testLMStudioDimension':
        await this.handleTestLMStudioDimension(message.baseUrl, message.apiKey, message.model);
        return true;
      case 'getLMStudioConfig':
        await this.handleGetLMStudioConfig();
        return true;

      // --- Dimension Compatibility ---
      case 'checkCompatibility':
        await this.handleCheckCompatibility();
        return true;
      case 'resetVectorIndex':
        await this.handleResetVectorIndex();
        return true;

      // --- Repository Analysis ---
      case 'analyzeRepository':
        await this.handleAnalyzeRepository();
        return true;
      case 'getAnalysisStatus':
        await this.handleGetAnalysisStatus();
        return true;

      // --- Runner Configuration ---
      case 'getRunnerConfig':
        await this.handleGetRunnerConfig();
        return true;
      case 'setRunnerConfig':
        await this.handleSetRunnerConfig(message.config);
        return true;
    }
    return false;
  }

  // --- Handlers ---

  private async handleCheckSecret(key: SecretKey) {
    try {
      const storageKey =
        key === 'googleApiKey'
          ? SECRET_GOOGLE_GEMINI
          : key === 'pineconeApiKey'
            ? SECRET_PINECONE
            : key === 'qdrantApiKey'
              ? SECRET_QDRANT
              : SECRET_ANTHROPIC;
      const secret = await this.extensionContext.secrets.get(storageKey);
      this.context.postMessage({ command: 'secretStatus', key, exists: !!secret });
    } catch (err) {
      console.error('Failed to check secret:', err);
    }
  }

  private async handleSaveSecret(key: SecretKey, value: string) {
    try {
      const storageKey =
        key === 'googleApiKey'
          ? SECRET_GOOGLE_GEMINI
          : key === 'pineconeApiKey'
            ? SECRET_PINECONE
            : key === 'qdrantApiKey'
              ? SECRET_QDRANT
              : SECRET_ANTHROPIC;
      await this.extensionContext.secrets.store(storageKey, value);
      this.context.postMessage({ command: 'secretStatus', key, exists: true });

      const label =
        key === 'googleApiKey'
          ? 'Google'
          : key === 'pineconeApiKey'
            ? 'Pinecone'
            : key === 'qdrantApiKey'
              ? 'Qdrant'
              : 'Anthropic';
      vscode.window.showInformationMessage(`${label} API Key saved successfully!`);
    } catch (err) {
      console.error('Failed to save secret:', err);
      vscode.window.showErrorMessage('Failed to save API Key.');
    }
  }

  // --- PostgreSQL Connection Management ---

  private async handleCheckPostgresConnection() {
    try {
      const secret = await this.extensionContext.secrets.get(SECRET_POSTGRES_CONNECTION);
      this.context.postMessage({ 
        command: 'postgresConnectionStatus', 
        exists: !!secret 
      });
    } catch (err) {
      console.error('Failed to check postgres connection:', err);
    }
  }

  private async handleSavePostgresConnection(value: string) {
    try {
      await this.extensionContext.secrets.store(SECRET_POSTGRES_CONNECTION, value);
      this.context.postMessage({ 
        command: 'postgresConnectionStatus', 
        exists: true 
      });
      vscode.window.showInformationMessage('PostgreSQL connection string saved successfully!');
    } catch (err) {
      console.error('Failed to save postgres connection:', err);
      vscode.window.showErrorMessage('Failed to save PostgreSQL connection string.');
    }
  }

  private async handleDeletePostgresConnection() {
    try {
      await this.extensionContext.secrets.delete(SECRET_POSTGRES_CONNECTION);
      this.context.postMessage({ 
        command: 'postgresConnectionStatus', 
        exists: false 
      });
      vscode.window.showInformationMessage('PostgreSQL connection string removed.');
    } catch (err) {
      console.error('Failed to delete postgres connection:', err);
    }
  }

  // --- Pinecone Index Logic ---
  private async handleFetchPineconeIndexes(explicitKey?: string) {
    try {
      let apiKey = explicitKey;
      if (!apiKey) {
        apiKey = await this.extensionContext.secrets.get(SECRET_PINECONE);
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

  private async handleGetTokenBudget() {
    const budget = this.extensionContext.globalState.get<number>('repomix.tokenBudget') ?? 50000;
    this.context.postMessage({ command: 'tokenBudget', budget });
  }

  private async handleSetTokenBudget(budget: number) {
    await this.extensionContext.globalState.update('repomix.tokenBudget', budget);
    this.context.postMessage({ command: 'tokenBudget', budget });
  }

  private async handleGetVectorDbProvider() {
    const provider =
      (this.extensionContext.globalState.get('repomix.vectorDb.provider') as string) ?? 'pinecone';
    this.context.postMessage({ command: 'vectorDbProvider', provider });
  }

  private async handleSetVectorDbProvider(provider: any) {
    const normalized = provider === 'qdrant' ? 'qdrant' : 'pinecone';

    try {
      // 0. Stop any in-flight indexing before switching
      // This ensures no races and a clean slate for the new provider.
      await this.indexingController.abortIndexing();

      // 1. Attempt the atomic switch via MigrationService
      // This validates credentials and clears the local index state (DatabaseService.clearRepoFiles)
      // to trigger a full re-index in the new database.
      const didSwitch = await this.migrationService.switchProvider(normalized);

      // 2. Update the UI state
      this.context.postMessage({ command: 'vectorDbProvider', provider: normalized });

      if (didSwitch) {
        // 3. Notify the webview that the index count is now 0 so it updates visually
        this.context.postMessage({ command: 'repoIndexDeleted' });
        vscode.window.showInformationMessage(
          `Successfully switched to ${normalized}. Local state reset to trigger re-indexing.`
        );

        // Trigger compatibility check after provider switch
        await this.handleCheckCompatibility();
      }
    } catch (error) {
      // 4. Handle validation failures (e.g. switching to Qdrant without a URL set)
      const errorMsg = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(errorMsg);

      // Revert the UI state to the currently stored provider to keep settings in sync
      const current = this.extensionContext.globalState.get('repomix.vectorDb.provider') || 'pinecone';
      this.context.postMessage({ command: 'vectorDbProvider', provider: current });
    }
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

    // FIX: Retrieve API Key from secrets if not provided in the message
    if (!apiKey) {
      console.log('[ConfigController] API Key missing in message payload. Attempting to retrieve from secrets...');
      apiKey = await this.extensionContext.secrets.get(SECRET_QDRANT);

      if (apiKey) {
        console.log('[ConfigController] API Key successfully retrieved from secrets (length:', apiKey.length, ')');
      } else {
        console.warn('[ConfigController] API Key not found in secrets. Connection will be attempted without authentication.');
      }
    }

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
        timeout: 30000
      };

      if (apiKey) {
        clientConfig.apiKey = apiKey;
        console.log('[ConfigController] API key added to config (first 8 chars):', apiKey.substring(0, 8) + '...');
      } else {
        console.warn('[ConfigController] No API key provided - connection may fail for hosted instances');
      }

      console.log('[ConfigController] Client config built:', JSON.stringify({ url: clientConfig.url, timeout: clientConfig.timeout, hasApiKey: !!clientConfig.apiKey }));

      // Step 4: Create client
      console.log('[ConfigController] Step 4: Creating QdrantClient instance...');
      const client = new QdrantClient(clientConfig);
      console.log('[ConfigController] QdrantClient instance created');

      // Step 5: Test connection by listing collections
      console.log('[ConfigController] Step 5: Calling client.getCollections()...');
      const response = await client.getCollections();
      console.log('[ConfigController] getCollections() succeeded!');
      // console.log('[ConfigController] Response status:', response.status ? response.status : 'no status field');
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

      // Provide more specific error messages based on error type
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        errorMessage = `Authentication failed. Please verify your Qdrant API key is correct.`;
      } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        errorMessage = `Access forbidden. Please check your Qdrant API key permissions.`;
      } else if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED')) {
        errorMessage = `Could not connect to ${url}. Please verify:\n1. The URL is correct\n2. The Qdrant server is running\n3. The server is accessible from your network`;
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        errorMessage = `Connection timed out. The Qdrant server at ${url} is not responding.`;
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

  private async handleGetVectorDbCollectionInfo() {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        this.context.postMessage({ command: 'vectorDbCollectionInfo', provider: 'pinecone', info: null });
        return;
      }

      const rootPath = workspaceFolders[0].uri.fsPath;
      const repoId = await getRepoId(rootPath);
      const provider = (this.extensionContext.globalState.get('repomix.vectorDb.provider') as string) ?? 'pinecone';

      let collectionName: string | null = null;

      if (provider === 'pinecone') {
        const repoConfigs: Record<string, any> =
          this.extensionContext.globalState.get('repomix.pinecone.selectedIndexByRepo') || {};
        const selected = repoConfigs[repoId];
        collectionName = typeof selected === 'string' ? selected : selected?.name;
      } else {
        collectionName = this.extensionContext.globalState.get('repomix.qdrant.collection') as string || null;
      }

      this.context.postMessage({
        command: 'vectorDbCollectionInfo',
        provider,
        info: collectionName ? { name: collectionName } : null
      });
    } catch (error) {
      console.error('Failed to get collection info:', error);
      this.context.postMessage({ command: 'vectorDbCollectionInfo', provider: 'pinecone', info: null });
    }
  }

  private async handleFetchQdrantCollections(providedApiKey?: string) {
    try {
      const url = this.extensionContext.globalState.get('repomix.qdrant.url') as string;
      // Use provided API key first, fall back to stored secret
      const effectiveApiKey = providedApiKey || await this.extensionContext.secrets.get(SECRET_QDRANT);

      console.log('[ConfigController] Fetching Qdrant collections with:', {
        url: url || 'NOT SET',
        hasProvidedKey: !!providedApiKey,
        hasStoredKey: !!effectiveApiKey,
        usingProvidedKey: !!providedApiKey
      });

      if (!url) {
        this.context.postMessage({
          command: 'updateQdrantCollections',
          collections: [],
          error: 'Qdrant URL not configured'
        });
        return;
      }

      const { QdrantClient } = await import('@qdrant/js-client-rest');
      const clientConfig: any = { url, timeout: 30000 };
      if (effectiveApiKey) clientConfig.apiKey = effectiveApiKey;

      console.log('[ConfigController] Creating Qdrant client with config:', {
        url: clientConfig.url,
        hasApiKey: !!clientConfig.apiKey,
        timeout: clientConfig.timeout
      });

      const client = new QdrantClient(clientConfig);
      const response = await client.getCollections();

      console.log('[ConfigController] Qdrant collections response:', response);

      this.context.postMessage({
        command: 'updateQdrantCollections',
        collections: response.collections?.map((c: any) => ({ name: c.name })) || []
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ConfigController] Failed to fetch Qdrant collections:', error);
      
      // Provide more specific error messages
      let userFriendlyError = errorMessage;
      if (errorMessage.includes('ECONNREFUSED')) {
        userFriendlyError = 'Could not connect to Qdrant server. Please check the URL and ensure the server is running.';
      } else if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
        userFriendlyError = 'Authentication failed. Please check your API key.';
      } else if (errorMessage.includes('Forbidden') || errorMessage.includes('403')) {
        userFriendlyError = 'Access forbidden. Please check your API key permissions.';
      } else if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
        userFriendlyError = 'Could not resolve Qdrant server address. Please check the URL.';
      }

      this.context.postMessage({
        command: 'updateQdrantCollections',
        collections: [],
        error: userFriendlyError
      });
    }
  }

  // --- Embedding Provider Configuration Handlers ---

  private async handleGetEmbeddingConfig() {
    try {
      const config = vscode.workspace.getConfiguration();
      const provider = config.get<string>('repomix.embedding.provider') || 'gemini';
      const ollamaUrl = config.get<string>('repomix.ollama.url') || 'http://localhost:11434';
      const ollamaModel = config.get<string>('repomix.ollama.model') || 'nomic-embed-text';
      const ollamaDimension = config.get<number>('repomix.ollama.dimension') || 768;
      
      // LM Studio config
      const lmstudioBaseUrl = config.get<string>('repomix.lmstudio.baseUrl') || 'http://localhost:1234/v1';
      const lmstudioApiKey = config.get<string>('repomix.lmstudio.apiKey') || '';
      const lmstudioModel = config.get<string>('repomix.lmstudio.model') || '';
      const lmstudioDimension = config.get<number>('repomix.lmstudio.dimension') || 768;

      this.context.postMessage({
        command: 'embeddingConfig',
        provider,
        ollamaUrl,
        ollamaModel,
        ollamaDimension,
        lmstudioBaseUrl,
        lmstudioApiKey,
        lmstudioModel,
        lmstudioDimension
      });
    } catch (error) {
      console.error('Failed to get embedding config:', error);
    }
  }

  /**
   * Fetch available models from Ollama server
   */
  private async handleFetchOllamaModels(explicitUrl?: string) {
    try {
      let ollamaUrl = explicitUrl;
      if (!ollamaUrl) {
        const config = vscode.workspace.getConfiguration();
        ollamaUrl = config.get<string>('repomix.ollama.url') || 'http://localhost:11434';
      }

      console.log(`[ConfigController] Fetching Ollama models from ${ollamaUrl}`);

      const response = await fetch(`${ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Ollama API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.models || [];

      console.log(`[ConfigController] Found ${models.length} Ollama models`);

      this.context.postMessage({
        command: 'ollamaModelsResult',
        models: models
      });
    } catch (error: unknown) {
      console.error('[ConfigController] Failed to fetch Ollama models:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.postMessage({
        command: 'ollamaModelsResult',
        models: [],
        error: errorMessage
      });
    }
  }

  /**
   * Test Ollama embedding dimension by running a single embedding
   */
  private async handleTestOllamaDimension(url: string, model: string) {
    try {
      console.log(`[ConfigController] Testing Ollama dimension for model ${model} at ${url}`);

      const response = await fetch(`${url}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: 'test',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ConfigController] Ollama dimension test failed: ${response.status}`, errorBody);
        throw new Error(`Ollama API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid response from Ollama API: missing or invalid embedding');
      }

      const dimension = data.embedding.length;
      console.log(`[ConfigController] Ollama dimension test successful: ${dimension}`);

      this.context.postMessage({
        command: 'ollamaDimensionResult',
        dimension: dimension
      });

      vscode.window.showInformationMessage(`Detected dimension: ${dimension}`);
    } catch (error: unknown) {
      console.error('[ConfigController] Failed to test Ollama dimension:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.postMessage({
        command: 'ollamaDimensionResult',
        error: errorMessage
      });
      vscode.window.showErrorMessage(`Failed to test dimension: ${errorMessage}`);
    }
  }

  /**
   * Save embedding configuration and switch provider
   * CRITICAL: If dimension changes, warn about Vector DB incompatibility
   */
  private async handleSetEmbeddingConfig(message: any) {
    try {
      const { provider, ollamaUrl, ollamaModel, ollamaDimension, lmstudioBaseUrl, lmstudioApiKey, lmstudioModel, lmstudioDimension } = message;

      console.log(`[ConfigController] Setting embedding config:`, { provider, ollamaUrl, ollamaModel, ollamaDimension, lmstudioBaseUrl, lmstudioModel, lmstudioDimension });

      // Get current dimension to detect changes
      const config = vscode.workspace.getConfiguration();
      const currentProvider = config.get<string>('repomix.embedding.provider') || 'gemini';
      let currentDimension = 768;
      
      if (currentProvider === 'gemini') {
        currentDimension = 768;
      } else if (currentProvider === 'ollama') {
        currentDimension = config.get<number>('repomix.ollama.dimension') || 768;
      } else if (currentProvider === 'lmstudio') {
        currentDimension = config.get<number>('repomix.lmstudio.dimension') || 768;
      }

      // Determine new dimension
      let newDimension = 768;
      if (provider === 'gemini') {
        newDimension = 768;
      } else if (provider === 'ollama') {
        newDimension = ollamaDimension;
      } else if (provider === 'lmstudio') {
        newDimension = lmstudioDimension;
      }

      // Check if dimension is changing
      const dimensionChanged = currentDimension !== newDimension;

      if (dimensionChanged) {
        console.warn(`[ConfigController] Dimension change detected: ${currentDimension} -> ${newDimension}`);
        
        const choice = await vscode.window.showWarningMessage(
          `⚠️ Dimension Change Detected: ${currentDimension} → ${newDimension}\n\n` +
          `This will make your current Vector DB index incompatible!\n` +
          `You will need to re-index your repository.\n\n` +
          `Continue with embedding configuration change?`,
          { modal: true },
          'Continue',
          'Cancel'
        );

        if (choice !== 'Continue') {
          console.log('[ConfigController] User cancelled embedding config change');
          return;
        }

        // Stop any in-flight indexing
        await this.indexingController.abortIndexing();

        // Clear the local index state to force re-indexing
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (cwd) {
          const repoId = await getRepoId(cwd);
          await this.databaseService.clearRepoFiles(repoId);
          console.log(`[ConfigController] Cleared index state for repo ${repoId}`);
        }
      }

      // Save configuration to workspace settings
      await config.update('repomix.embedding.provider', provider, vscode.ConfigurationTarget.Global);
      
      if (provider === 'ollama') {
        await config.update('repomix.ollama.url', ollamaUrl, vscode.ConfigurationTarget.Global);
        await config.update('repomix.ollama.model', ollamaModel, vscode.ConfigurationTarget.Global);
        await config.update('repomix.ollama.dimension', ollamaDimension, vscode.ConfigurationTarget.Global);
      } else if (provider === 'lmstudio') {
        await config.update('repomix.lmstudio.baseUrl', lmstudioBaseUrl, vscode.ConfigurationTarget.Global);
        await config.update('repomix.lmstudio.apiKey', lmstudioApiKey, vscode.ConfigurationTarget.Global);
        await config.update('repomix.lmstudio.model', lmstudioModel, vscode.ConfigurationTarget.Global);
        await config.update('repomix.lmstudio.dimension', lmstudioDimension, vscode.ConfigurationTarget.Global);
      }

      console.log('[ConfigController] Embedding configuration saved');

      // Import and switch the embedding service provider
      const { embeddingService } = await import('../../core/indexing/embeddingService.js');
      
      if (provider === 'gemini') {
        const apiKey = await this.extensionContext.secrets.get(SECRET_GOOGLE_GEMINI);
        if (!apiKey) {
          throw new Error('Gemini API key is missing. Please configure it in Settings.');
        }
        embeddingService.switchProvider({
          provider: 'gemini',
          gemini: { apiKey }
        });
      } else if (provider === 'ollama') {
        embeddingService.switchProvider({
          provider: 'ollama',
          ollama: {
            url: ollamaUrl,
            model: ollamaModel,
            dimension: ollamaDimension
          }
        });
      } else if (provider === 'lmstudio') {
        embeddingService.switchProvider({
          provider: 'lmstudio',
          lmstudio: {
            baseUrl: lmstudioBaseUrl,
            apiKey: lmstudioApiKey,
            model: lmstudioModel,
            dimension: lmstudioDimension
          }
        });
      }

      console.log('[ConfigController] Embedding service provider switched');

      // Send updated config back to webview
      await this.handleGetEmbeddingConfig();

      if (dimensionChanged) {
        // Notify webview that index was cleared
        this.context.postMessage({ command: 'repoIndexDeleted' });
        vscode.window.showInformationMessage(
          `Embedding provider switched to ${provider}. ` +
          `Local index cleared due to dimension change. Please re-index your repository.`
        );
      } else {
        vscode.window.showInformationMessage(`Embedding provider set to ${provider}`);
      }

      // Trigger compatibility check after config change
      await this.handleCheckCompatibility();

    } catch (error) {
      console.error('[ConfigController] Failed to set embedding config:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to save embedding configuration: ${errorMessage}`);
    }
  }

  // --- LM Studio Methods ---

  private async handleGetLMStudioConfig() {
    try {
      const config = vscode.workspace.getConfiguration();
      const baseUrl = config.get<string>('repomix.lmstudio.baseUrl') || 'http://localhost:1234/v1';
      const apiKey = config.get<string>('repomix.lmstudio.apiKey') || '';
      const model = config.get<string>('repomix.lmstudio.model') || '';
      const dimension = config.get<number>('repomix.lmstudio.dimension') || 768;

      this.context.postMessage({
        command: 'lmstudioConfig',
        baseUrl,
        apiKey,
        model,
        dimension
      });
    } catch (error) {
      console.error('Failed to get LM Studio config:', error);
    }
  }

  /**
   * Fetch available models from LM Studio server
   */
  private async handleFetchLMStudioModels(baseUrl?: string, apiKey?: string) {
    try {
      let lmstudioBaseUrl = baseUrl;
      let lmstudioApiKey = apiKey;
      
      if (!lmstudioBaseUrl) {
        const config = vscode.workspace.getConfiguration();
        lmstudioBaseUrl = config.get<string>('repomix.lmstudio.baseUrl') || 'http://localhost:1234/v1';
      }
      
      if (lmstudioApiKey === undefined) {
        const config = vscode.workspace.getConfiguration();
        lmstudioApiKey = config.get<string>('repomix.lmstudio.apiKey') || '';
      }

      console.log(`[ConfigController] Fetching LM Studio models from ${lmstudioBaseUrl}`);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (lmstudioApiKey && lmstudioApiKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${lmstudioApiKey}`;
      }

      const response = await fetch(`${lmstudioBaseUrl}/models`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ConfigController] LM Studio models fetch failed: ${response.status}`, errorBody);
        throw new Error(`LM Studio API request failed: ${response.statusText} (${response.status})`);
      }

      const data = await response.json();
      
      // Handle different response formats
      let models: Array<{ id: string }> = [];
      
      if (data.data && Array.isArray(data.data)) {
        // OpenAI-style response: { data: [{ id: "model-name", ... }] }
        models = data.data.map((model: any) => ({ id: model.id }));
      } else if (Array.isArray(data)) {
        // Array of model names
        models = data.map((model: string) => ({ id: model }));
      }

      console.log(`[ConfigController] Found ${models.length} LM Studio models`);

      this.context.postMessage({
        command: 'lmstudioModelsResult',
        models: models,
      });

      if (models.length === 0) {
        vscode.window.showWarningMessage('No models found in LM Studio. Make sure you have loaded embedding models.');
      }
    } catch (error: unknown) {
      console.error('[ConfigController] Failed to fetch LM Studio models:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.postMessage({
        command: 'lmstudioModelsResult',
        models: [],
        error: errorMessage
      });
      vscode.window.showErrorMessage(`Failed to fetch LM Studio models: ${errorMessage}`);
    }
  }

  /**
   * Test embedding dimension by making a sample embedding request
   */
  private async handleTestLMStudioDimension(baseUrl: string, apiKey: string, model: string) {
    try {
      console.log(`[ConfigController] Testing LM Studio dimension for model: ${model}`);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (apiKey && apiKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model,
          input: 'test text for dimension detection',
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ConfigController] LM Studio dimension test failed: ${response.status}`, errorBody);
        throw new Error(`LM Studio API request failed: ${response.statusText} (${response.status})`);
      }

      const data = await response.json();
      
      // Handle different response formats
      let embedding: number[] | undefined;
      
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        // OpenAI-style response: { data: [{ embedding: [...] }] }
        embedding = data.data[0].embedding;
      } else if (data.embedding) {
        // Direct embedding response
        embedding = data.embedding;
      }

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid response from LM Studio API: missing or invalid embedding');
      }

      const dimension = embedding.length;
      console.log(`[ConfigController] LM Studio dimension test successful: ${dimension}`);

      this.context.postMessage({
        command: 'lmstudioDimensionResult',
        dimension: dimension
      });

      vscode.window.showInformationMessage(`Detected dimension: ${dimension}`);
    } catch (error: unknown) {
      console.error('[ConfigController] Failed to test LM Studio dimension:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.postMessage({
        command: 'lmstudioDimensionResult',
        error: errorMessage
      });
      vscode.window.showErrorMessage(`Failed to test dimension: ${errorMessage}`);
    }
  }

  // --- Dimension Compatibility Methods ---

  private async handleCheckCompatibility() {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders?.length) {
        this.postCompatibilityStatus(true, false, 768, undefined, 'No workspace open');
        return;
      }

      const cwd = workspaceFolders[0].uri.fsPath;
      const repoId = await getRepoId(cwd);

      // Get desired embedding dimension
      const config = vscode.workspace.getConfiguration();
      const provider = config.get<string>('repomix.embedding.provider') || 'gemini';
      let embeddingDimension = 768;
      
      if (provider === 'gemini') {
        embeddingDimension = 768;
      } else if (provider === 'ollama') {
        embeddingDimension = config.get<number>('repomix.ollama.dimension') || 768;
      } else if (provider === 'lmstudio') {
        embeddingDimension = config.get<number>('repomix.lmstudio.dimension') || 768;
      }

      // Get actual index dimension from vector DB
      let indexDimension: number | undefined;
      let indexCount = 0;

      try {
        const { adapter } = await getVectorDbAdapterForRepo(this.extensionContext, repoId);
        const metadata = await adapter.getIndexMetadata?.({ repoId });
        if (metadata) {
          indexDimension = metadata.dimension;
          indexCount = metadata.count;
        }
      } catch (e) {
        console.warn('[ConfigController] Could not get index metadata:', e);
        // Fail-safe: treat as blocked if we can't verify
        await this.extensionContext.globalState.update('repomix.indexingBlocked', true);
        this.postCompatibilityStatus(false, true, embeddingDimension, undefined,
          'Cannot verify compatibility. Check your Vector DB connection.');
        return;
      }

      // Determine compatibility
      // Compatible if: no index exists, index is empty, or dimensions match
      const compatible = indexDimension === undefined ||
                         indexCount === 0 ||
                         indexDimension === embeddingDimension;

      const blocked = !compatible;
      await this.extensionContext.globalState.update('repomix.indexingBlocked', blocked);

      let message: string;
      if (compatible) {
        message = indexDimension
          ? `System Ready. Embedding (${embeddingDimension}d) matches Index (${indexDimension}d).`
          : `System Ready. No existing index found.`;
      } else {
        message = `Dimension Mismatch! Embedding model: ${embeddingDimension}d, Vector index: ${indexDimension}d`;
      }

      this.postCompatibilityStatus(compatible, blocked, embeddingDimension, indexDimension, message);

      // Also notify SearchTab
      this.context.postMessage({ command: 'indexingBlocked', blocked });

    } catch (error) {
      console.error('[ConfigController] Compatibility check failed:', error);
      this.postCompatibilityStatus(false, true, 768, undefined, 'Compatibility check failed');
    }
  }

  private postCompatibilityStatus(
    compatible: boolean,
    blocked: boolean,
    embeddingDimension: number,
    indexDimension: number | undefined,
    message: string
  ) {
    this.context.postMessage({
      command: 'compatibilityStatus',
      compatible,
      blocked,
      embeddingDimension,
      indexDimension,
      message,
    });
  }

  private async handleResetVectorIndex() {
    try {
      const choice = await vscode.window.showWarningMessage(
        'Reset Vector Index?\n\n' +
        'This will delete all vectors for this repository from the remote database.\n' +
        'You will need to re-index your repository afterwards.\n\n' +
        'This action cannot be undone.',
        { modal: true },
        'Reset Index',
        'Cancel'
      );

      if (choice !== 'Reset Index') {
        return;
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders?.length) {
        throw new Error('No workspace folder open');
      }

      const cwd = workspaceFolders[0].uri.fsPath;
      const repoId = await getRepoId(cwd);

      // 1. Abort any running indexing
      await this.indexingController.abortIndexing();

      // 2. Delete vectors from remote DB
      const { adapter } = await getVectorDbAdapterForRepo(this.extensionContext, repoId);
      await adapter.deleteIndex({ repoId });

      // 3. Clear local tracking state
      await this.databaseService.clearRepoFiles(repoId);

      // 4. Clear blocking flag
      await this.extensionContext.globalState.update('repomix.indexingBlocked', false);

      // 5. Notify UI
      this.context.postMessage({ command: 'vectorIndexReset', success: true });
      this.context.postMessage({ command: 'repoIndexDeleted' });
      this.context.postMessage({ command: 'indexingBlocked', blocked: false });

      // 6. Re-run compatibility check
      await this.handleCheckCompatibility();

      vscode.window.showInformationMessage('Vector index reset complete. Please re-index your repository.');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[ConfigController] Reset failed:', error);
      this.context.postMessage({ command: 'vectorIndexReset', success: false, error: errorMsg });
      vscode.window.showErrorMessage(`Reset failed: ${errorMsg}`);
    }
  }

  // --- Repository Analysis Handlers ---

  private async handleAnalyzeRepository() {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders?.length) {
        throw new Error('No workspace folder open');
      }

      const repoRoot = workspaceFolders[0].uri.fsPath;
      const repoId = await getRepoId(repoRoot);
      const apiKey = await this.extensionContext.secrets.get(SECRET_GOOGLE_GEMINI);

      console.log(`[ConfigController] Starting repository analysis for ${repoId}`);

      // Initialize or get blueprint service
      let blueprintService = getBlueprintService();
      if (!blueprintService) {
        blueprintService = initBlueprintService(this.databaseService);
      }

      // Run with VS Code progress notification
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Analyzing repository...',
        cancellable: false
      }, async (progress) => {
        // Progress callback that updates both VS Code and webview
        const onProgress = (phase: string, current: number, total: number) => {
          const percentage = Math.round((current / total) * 100);
          progress.report({ message: phase, increment: (100 / total) });
          this.context.postMessage({
            command: 'analysisProgress',
            phase,
            current,
            total
          });
        };

        // Generate the blueprint
        await blueprintService!.generateBlueprint(
          { repoId, repoRoot, apiKey: apiKey || undefined },
          onProgress
        );
      });

      // Fetch and send the updated status
      const status = await this.databaseService.getBlueprintStatus(repoId);
      this.context.postMessage({
        command: 'analysisComplete',
        success: true
      });
      this.context.postMessage({
        command: 'analysisStatus',
        ...status
      });

      vscode.window.showInformationMessage('Repository analysis complete!');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[ConfigController] Analysis failed:', error);
      this.context.postMessage({
        command: 'analysisComplete',
        success: false,
        error: errorMsg
      });
      vscode.window.showErrorMessage(`Analysis failed: ${errorMsg}`);
    }
  }

  private async handleGetAnalysisStatus() {
    try {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders?.length) {
        this.context.postMessage({
          command: 'analysisStatus',
          exists: false,
          valid: false
        });
        return;
      }

      const repoRoot = workspaceFolders[0].uri.fsPath;
      const repoId = await getRepoId(repoRoot);

      // Initialize or get blueprint service
      let blueprintService = getBlueprintService();
      if (!blueprintService) {
        blueprintService = initBlueprintService(this.databaseService);
      }

      // Get status with validation
      const status = await blueprintService.getBlueprintStatus(repoId, repoRoot);

      this.context.postMessage({
        command: 'analysisStatus',
        ...status
      });

    } catch (error) {
      console.error('[ConfigController] Failed to get analysis status:', error);
      this.context.postMessage({
        command: 'analysisStatus',
        exists: false,
        valid: false
      });
    }
  }

  // --- Runner Configuration Handlers ---

  private async handleGetRunnerConfig() {
    try {
      const config = vscode.workspace.getConfiguration('repomix');
      const runnerConfig = config.get<any>('runner', {});
      
      this.context.postMessage({
        command: 'runnerConfig',
        config: {
          respectGitignoreInMarkdown: runnerConfig.respectGitignoreInMarkdown ?? false
        }
      });
    } catch (error) {
      console.error('[ConfigController] Failed to get runner config:', error);
      this.context.postMessage({
        command: 'runnerConfig',
        config: {
          respectGitignoreInMarkdown: false
        }
      });
    }
  }

  private async handleSetRunnerConfig(config: { respectGitignoreInMarkdown?: boolean }) {
    try {
      const vscodeConfig = vscode.workspace.getConfiguration('repomix');
      
      if (config.respectGitignoreInMarkdown !== undefined) {
        await vscodeConfig.update(
          'runner.respectGitignoreInMarkdown', 
          config.respectGitignoreInMarkdown, 
          vscode.ConfigurationTarget.Global
        );
        console.log('[ConfigController] Updated respectGitignoreInMarkdown to:', config.respectGitignoreInMarkdown);
      }
      
      // Send updated config back to webview
      await this.handleGetRunnerConfig();
      
      vscode.window.showInformationMessage(
        `Markdown generation settings updated successfully.`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[ConfigController] Failed to set runner config:', error);
      vscode.window.showErrorMessage(`Failed to update settings: ${errorMsg}`);
    }
  }
}
