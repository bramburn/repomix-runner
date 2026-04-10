import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import { BaseController } from './BaseController.js';
import { getRepoId, safeCollectionName } from '../../utils/repoIdentity.js';
import { MigrationService } from '../../core/indexing/migrationService.js';
import { DatabaseService } from '../../core/storage/databaseService.js';
import { IndexingController } from './IndexingController.js';
import { getVectorDbAdapterForRepo, getEmbeddingConfig } from '../../core/indexing/vectorDb/factory.js';
import { BlueprintService, initBlueprintService, getBlueprintService } from '../../fingerprint/blueprintService.js';
import { embeddingService } from '../../core/indexing/embeddingService.js';

const SECRET_GOOGLE_GEMINI = 'repomix.agent.googleApiKey';
const SECRET_QDRANT = 'repomix.agent.qdrantApiKey';
const SECRET_ANTHROPIC = 'repomix.chat.anthropicApiKey';
export const SECRET_POSTGRES_CONNECTION = 'postgresConnectionString';
type SecretKey = 'googleApiKey' | 'qdrantApiKey' | 'anthropicApiKey';

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
        await this.handleSetQdrantConfig(String(message.url));
        return true;

      case 'testQdrantConnection':
        await this.handleTestQdrantConnection(message.url, message.apiKey);
        return true;

      case 'getVectorDbCollectionInfo':
        await this.handleGetVectorDbCollectionInfo();
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

      // --- Enrichment Configuration ---
      case 'getEnrichmentConfig':
        await this.handleGetEnrichmentConfig();
        return true;
      case 'setEnrichmentConfig':
        await this.handleSetEnrichmentConfig(message);
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
          : key === 'qdrantApiKey'
            ? SECRET_QDRANT
            : SECRET_ANTHROPIC;
      await this.extensionContext.secrets.store(storageKey, value);
      this.context.postMessage({ command: 'secretStatus', key, exists: true });

      const label =
        key === 'googleApiKey'
          ? 'Google'
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
      // Check settings first, then secrets
      const config = vscode.workspace.getConfiguration('repomix.chat');
      const settingValue = config.get<string>('postgresConnectionString');
      const secretValue = await this.extensionContext.secrets.get(SECRET_POSTGRES_CONNECTION);
      const exists = !!(settingValue?.trim() || secretValue);

      this.context.postMessage({
        command: 'postgresConnectionStatus',
        exists,
        source: settingValue?.trim() ? 'settings' : (secretValue ? 'secrets' : 'none')
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
      (this.extensionContext.globalState.get('repomix.vectorDb.provider') as string) ?? 'qdrant';
    this.context.postMessage({ command: 'vectorDbProvider', provider });
  }

  private async handleSetVectorDbProvider(provider: 'qdrant') {
    const normalized: 'qdrant' = 'qdrant';

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
      const current = this.extensionContext.globalState.get('repomix.vectorDb.provider') || 'qdrant';
      this.context.postMessage({ command: 'vectorDbProvider', provider: current });
    }
  }

  private async handleGetQdrantConfig() {
    const url = (this.extensionContext.globalState.get('repomix.qdrant.url') as string) ?? '';
    this.context.postMessage({ command: 'qdrantConfig', url });
  }

  private async handleSetQdrantConfig(url: string) {
    // Explicitly validate strings to prevent bad state
    const nextUrl = url || '';

    await this.extensionContext.globalState.update('repomix.qdrant.url', nextUrl);

    this.context.postMessage({
      command: 'qdrantConfig',
      url: nextUrl,
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

  private async handleTestQdrantConnection(url: string, apiKey?: string) {
    console.log('[ConfigController] === Qdrant Test Connection Handler Started ===');
    console.log('[ConfigController] Received URL:', url);
    console.log('[ConfigController] Received apiKey present:', !!apiKey);

    // FIX: Retrieve API Key from secrets if not provided in the message
    let finalApiKey = apiKey;
    if (!finalApiKey) {
      finalApiKey = await this.extensionContext.secrets.get(SECRET_QDRANT);
      if (finalApiKey) {
        console.log('[ConfigController] Using API key from Secrets Storage');
      }
    }

    try {
      // Step 1: Validate URL format
      if (!this.validateQdrantUrl(url)) {
        throw new Error('Invalid URL format. Must be a valid http:// or https:// URL');
      }

      // Step 2: Import QdrantClient
      const { QdrantClient } = await import('@qdrant/js-client-rest');

      // Step 3: Create client
      const client = new QdrantClient({
        url: url,
        apiKey: finalApiKey,
        timeout: 10000,
        checkCompatibility: false
      });

      // Step 4: Test connection by listing collections
      console.log('[ConfigController] Testing basic connectivity...');
      await client.getCollections();
      
      const resultMessage = `Successfully connected to Qdrant at ${url}`;
      console.log('[ConfigController] Connection successful:', resultMessage);
      
      this.context.postMessage({
        command: 'qdrantConnectionResult',
        success: true,
        message: resultMessage
      });
      vscode.window.showInformationMessage(resultMessage);
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
        this.context.postMessage({ command: 'vectorDbCollectionInfo', provider: 'qdrant', info: null });
        return;
      }

      const provider = (this.extensionContext.globalState.get('repomix.vectorDb.provider') as string) ?? 'qdrant';
      const repoId = await getRepoId(workspaceFolders[0].uri.fsPath);
      const { dimension } = getEmbeddingConfig();
      const safeRepoId = safeCollectionName(repoId);
      const collectionName = `${safeRepoId}-${dimension}`;

      this.context.postMessage({
        command: 'vectorDbCollectionInfo',
        provider,
        info: { name: collectionName }
      });
    } catch (error) {
      console.error('Failed to get collection info:', error);
      this.context.postMessage({ command: 'vectorDbCollectionInfo', provider: 'qdrant', info: null });
    }
  }

  // --- Embedding Provider Configuration Handlers ---

  private async handleGetEmbeddingConfig() {
    try {
      const config = vscode.workspace.getConfiguration();
      const provider = config.get<string>('repomix.embedding.provider') || 'lmstudio';
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
        lmstudioDimension,
      });
    } catch (error) {
      console.error('Failed to get embedding config:', error);
    }
  }

  /**
   * Fetch available embedding models from Ollama server
   * Tests each model with /api/embed to filter only embedding models
   */
  private async handleFetchOllamaModels(explicitUrl?: string) {
    try {
      let ollamaUrl = explicitUrl;
      if (!ollamaUrl) {
        const config = vscode.workspace.getConfiguration();
        ollamaUrl = config.get<string>('repomix.ollama.url') || 'http://localhost:11434';
      }

      console.log(`[ConfigController] Fetching Ollama models from ${ollamaUrl}`);

      // Check cache first
      const cacheKey = `ollamaEmbeddingModels_${ollamaUrl}`;
      const cached = this.extensionContext.globalState.get<{
        models: Array<{ name: string; dimension?: number }>;
        timestamp: number;
      }>(cacheKey);

      const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        console.log(`[ConfigController] Returning cached Ollama embedding models (${cached.models.length} models)`);
        this.context.postMessage({
          command: 'ollamaModelsResult',
          models: cached.models
        });
        return;
      }

      // Fetch all models from Ollama
      const response = await fetch(`${ollamaUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Ollama API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const allModels = data.models || [];

      console.log(`[ConfigController] Found ${allModels.length} total Ollama models, testing for embedding support`);

      // Test each model with /api/embed to find embedding models and get dimensions
      const embeddingModels: Array<{ name: string; dimension?: number }> = [];

      for (const model of allModels) {
        try {
          const embedResponse = await fetch(`${ollamaUrl}/api/embed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model.name,
              input: 'test',
            }),
          });

          if (embedResponse.ok) {
            const embedData = await embedResponse.json();
            if (embedData.embeddings && embedData.embeddings.length > 0) {
              const dimension = embedData.embeddings[0].length;
              embeddingModels.push({ name: model.name, dimension });
              console.log(`[ConfigController] Model ${model.name} is an embedding model with dimension ${dimension}`);
            }
          }
        } catch (modelError) {
          // Model doesn't support embeddings, skip it
          console.log(`[ConfigController] Model ${model.name} is not an embedding model`);
        }
      }

      // Cache the filtered embedding models
      await this.extensionContext.globalState.update(cacheKey, {
        models: embeddingModels,
        timestamp: Date.now()
      });

      console.log(`[ConfigController] Found ${embeddingModels.length} embedding models`);

      this.context.postMessage({
        command: 'ollamaModelsResult',
        models: embeddingModels
      });
    } catch (error: unknown) {
      console.error('[ConfigController] Failed to fetch Ollama models:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.context.postMessage({
        command: 'ollamaModelsResult',
        models: [],
        error: errorMessage
      });
      // Reset the fetching flag to release the button
      this.context.postMessage({ command: 'ollamaFetchComplete' });
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
      const {
        provider,
        ollamaUrl,
        ollamaModel,
        ollamaDimension,
        lmstudioBaseUrl,
        lmstudioApiKey,
        lmstudioModel,
        lmstudioDimension,
      } = message;

      console.log(`[ConfigController] Setting embedding config:`, {
        provider,
        ollamaUrl,
        ollamaModel,
        ollamaDimension,
        lmstudioBaseUrl,
        lmstudioModel,
        lmstudioDimension,
      });

      // Get current dimension to detect changes
      const config = vscode.workspace.getConfiguration();
      const currentProvider = config.get<string>('repomix.embedding.provider') || 'lmstudio';
      let currentDimension = 768;

      if (currentProvider === 'ollama') {
        currentDimension = config.get<number>('repomix.ollama.dimension') || 768;
      } else if (currentProvider === 'lmstudio') {
        currentDimension = config.get<number>('repomix.lmstudio.dimension') || 768;
      }

      // Determine new dimension
      let newDimension = 768;
      if (provider === 'ollama') {
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

      if (provider === 'ollama') {
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
      // Reset the fetching flag to release the button
      this.context.postMessage({ command: 'lmstudioFetchComplete' });
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

      // Get actual embedding dimension from the active provider
      let embeddingDimension: number;
      try {
        embeddingDimension = embeddingService.getDimensions();
      } catch (e) {
        console.warn('[ConfigController] Could not get embedding dimensions, falling back to config:', e);
        // Fallback to config-based calculation if service not initialized
        const config = vscode.workspace.getConfiguration();
        const provider = config.get<string>('repomix.embedding.provider') || 'lmstudio';
        if (provider === 'ollama') {
          embeddingDimension = config.get<number>('repomix.ollama.dimension') || 768;
        } else if (provider === 'lmstudio') {
          embeddingDimension = config.get<number>('repomix.lmstudio.dimension') || 768;
        } else {
          embeddingDimension = 768;
        }
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

  // --- Enrichment Configuration Methods ---

  private async handleGetEnrichmentConfig() {
    try {
      const config = vscode.workspace.getConfiguration();
      const enabled = config.get<boolean>('repomix.enrichment.enabled') ?? false;
      const llmProvider = config.get<string>('repomix.enrichment.llmProvider') || 'gemini';

      this.context.postMessage({
        command: 'enrichmentConfig',
        enabled,
        llmProvider,
      });
    } catch (error) {
      console.error('[ConfigController] Failed to get enrichment config:', error);
    }
  }

  private async handleSetEnrichmentConfig(message: any) {
    try {
      const { enabled, llmProvider } = message;

      console.log('[ConfigController] Setting enrichment config:', { enabled, llmProvider });

      const config = vscode.workspace.getConfiguration();
      await config.update('repomix.enrichment.enabled', enabled, true);
      await config.update('repomix.enrichment.llmProvider', llmProvider, true);

      // Send updated config back to webview
      await this.handleGetEnrichmentConfig();

      vscode.window.showInformationMessage(
        `Enrichment settings updated successfully.`
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[ConfigController] Failed to set enrichment config:', error);
      vscode.window.showErrorMessage(`Failed to update enrichment settings: ${errorMsg}`);
    }
  }
}
