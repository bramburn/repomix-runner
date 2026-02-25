import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runRepomix } from './commands/runRepomix.js';
import { openSettings } from './commands/openSettings.js';
import { openOutput } from './commands/openOutput.js';
import { testCompression } from './commands/testCompression.js';
import { runRepomixOnOpenFiles } from './commands/runRepomixOnOpenFiles.js';
import { getCwd } from './config/getCwd.js';
import { tempDirManager } from './core/files/tempDirManager.js';
import { collectGitignorePatterns } from './core/files/gitignoreUtils.js';
import { runRepomixOnSelectedFiles } from './commands/runRepomixOnSelectedFiles.js';
import { runBundle } from './commands/runBundle.js';
import { deleteBundle } from './commands/deleteBundle.js';
import { BundleDataProvider, TreeNode } from './core/bundles/bundleDataProvider.js';
import { BundleManager } from './core/bundles/bundleManager.js';
import { BundleFileDecorationProvider } from './core/bundles/bundleFileDecorationProvider.js';
import { selectActiveBundle } from './commands/selectActiveBundle.js';
import { createBundle } from './commands/createBundle.js';
import {
  addFilesToActiveBundle,
  removeFilesFromActiveBundle,
} from './commands/mutateActiveBundle.js';
import { editBundle } from './commands/editBundle.js';
import { goToConfigFile } from './commands/goToConfigFile.js';
import { RepomixWebviewProvider } from './webview/RepomixWebviewProvider.js';
import { AiChatWebviewProvider } from './webview/AiChatWebviewProvider.js';
import { createSmartRepomixGraph } from './agent/graph.js';
import { logger } from './shared/logger.js';
import { DatabaseService } from './core/storage/databaseService.js';
import { execPromisify } from './shared/execPromisify.js';
import { AgentRunHistory } from './core/storage/databaseService.js';
import { getRepoId } from './utils/repoIdentity.js';
import { RepoIndexMonitor, toRelativePosix } from './core/indexing/repoIndexMonitor.js';
import { RepoEmbeddingOrchestrator } from './core/indexing/repoEmbeddingOrchestrator.js';
import { getVectorDbAdapterForRepo } from './core/indexing/vectorDb/factory.js';
import type { VectorDbAdapter } from './core/indexing/vectorDb/types.js';
import { runRepomixClipboardGenerateMarkdown } from './core/files/runRepomixClipboardGenerateMarkdown.js';
import { getRemoteEnvironment, shouldUseLocalBinaryExecution } from './core/files/remoteDetection.js';
import { readRepomixRunnerVscodeConfig } from './config/configLoader.js';
import { copySelectedFilesToClipboard } from './commands/copySelectedFilesToClipboard.js';
import { copySelectedFilesAsCompressed } from './commands/copySelectedFilesAsCompressed.js';
import { copySingleFileRespectingMode } from './commands/copySingleFileRespectingMode.js';
import { getRepoForActiveEditor, getAllChangedUris, getChangesCounts } from './git/gitUtils.js';
import { GitService } from './git/GitService.js';
import ignore from 'ignore';
import { ExtensionServices } from './core/services/ExtensionServices.js';
import { BranchMaintenanceService } from './core/indexing/BranchMaintenanceService.js';
import { initPool, closePool, testConnection } from './chat/db/postgresClient.js';
import type { Pool } from 'pg';
import { BatchManager } from './chat/batch/batchManager.js';
import { BatchPoller } from './chat/batch/batchPoller.js';
import type { BatchCompletionResult } from './chat/batch/types.js';
import { executeArchitectureGeneration } from './chat/architecture/architectureGraph.js';

/**
 * Wraps an async operation with a timeout and logs timing information.
 * Returns null if the operation times out or fails.
 */
async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T | null> {
  const startTime = Date.now();
  console.log(`[quick-repomix] Starting ${operationName}...`);

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    const result = await Promise.race([operation, timeoutPromise]);
    const duration = Date.now() - startTime;
    console.log(`[quick-repomix] ${operationName} completed in ${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[quick-repomix] ${operationName} failed after ${duration}ms:`, error);
    return null;
  }
}

/**
 * Gets the PostgreSQL connection string from VS Code settings or secrets.
 * Settings take precedence over secrets for easier configuration.
 */
async function getPostgresConnectionString(context: vscode.ExtensionContext): Promise<string | undefined> {
  // First check VS Code settings (takes precedence)
  const config = vscode.workspace.getConfiguration('repomix.chat');
  const settingValue = config.get<string>('postgresConnectionString');

  if (settingValue && settingValue.trim()) {
    console.log('[quick-repomix] Using PostgreSQL connection string from settings');
    return settingValue.trim();
  }

  // Fall back to secrets storage (backward compatibility)
  const SECRET_POSTGRES_CONNECTION = 'postgresConnectionString';
  const secretValue = await context.secrets.get(SECRET_POSTGRES_CONNECTION);

  if (secretValue) {
    console.log('[quick-repomix] Using PostgreSQL connection string from secrets (backward compatibility)');
    return secretValue;
  }

  return undefined;
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('[quick-repomix] ===== EXTENSION ACTIVATION START =====');
  console.log('[quick-repomix] Extension context obtained');

  // Initialize WASM path for compression engine
  console.log('[Repomix] Initializing WASM path for compression engine...');
  try {
    const { LanguageParser } = await import('./core/compression/LanguageParser.js');
    const wasmPath = path.join(context.extensionPath, 'dist', 'tree-sitter-wasm');
    LanguageParser.getInstance().setWasmDirectory(wasmPath);
    console.log('[Repomix] WASM path initialized:', wasmPath);
  } catch (error) {
    console.error('[Repomix] Failed to initialize WASM path:', error);
  }

  // Initialize database service (with timeout protection)
  console.log('[quick-repomix] Initializing database service...');
  const databaseService = new DatabaseService(context);
  const dbInitResult = await withTimeout(
    databaseService.initialize(),
    10000, // 10 second timeout
    'SQLite database initialization'
  );

  if (dbInitResult === null) {
    console.warn('[quick-repomix] Database initialization timed out - continuing without database');
    // DatabaseService will handle null db internally
  } else {
    console.log('[quick-repomix] Database service initialized successfully');
  }

  // Initialize PostgreSQL pool for chat storage (non-blocking)
  console.log('[quick-repomix] Starting PostgreSQL initialization (non-blocking)...');
  let chatPgPool: Pool | null = null;

  // Run PostgreSQL init in background to not block activation
  (async () => {
    const pgStartTime = Date.now();
    try {
      const pgConnectionString = await getPostgresConnectionString(context);

      if (pgConnectionString) {
        console.log('[quick-repomix] Found PostgreSQL connection string, attempting connection...');
        chatPgPool = await initPool(pgConnectionString);
        console.log(`[quick-repomix] PostgreSQL chat storage initialized in ${Date.now() - pgStartTime}ms`);
      } else {
        console.log('[quick-repomix] PostgreSQL connection string not configured - chat feature disabled');
      }
    } catch (error) {
      console.error(`[quick-repomix] Failed to initialize PostgreSQL chat storage after ${Date.now() - pgStartTime}ms:`, error);
      // Show error notification without blocking
      vscode.window.showWarningMessage(
        `Chat feature unavailable: ${error instanceof Error ? error.message : String(error)}`,
        'Open Settings'
      ).then(selection => {
        if (selection === 'Open Settings') {
          vscode.commands.executeCommand('repomixRunner.openSettings');
        }
      });
    }
  })();

  console.log('[quick-repomix] Continuing activation (database operations in background)...');

  console.log('[quick-repomix] Registering pool disposal hook...');
  // Register pool disposal hook for reliable cleanup on extension deactivation
  context.subscriptions.push({
    dispose: () => {
      closePool().catch((err) =>
        console.error('[quick-repomix] Failed to close PG pool during disposal:', err)
      );
    }
  });
  console.log('[quick-repomix] Pool disposal hook registered');

  // ==============================================================================
  // BATCH POLLER LIFECYCLE MANAGEMENT
  // ==============================================================================
  // The Anthropic Batch API can take up to 24 hours. We need to ensure that
  // pending batch jobs are resumed on extension activation and properly cleaned
  // up on deactivation to prevent memory leaks and lost jobs.
  // ==============================================================================
  // Batch poller lifecycle is now managed via shared instances passed to AiChatWebviewProvider.
  // We still need to resume pending jobs at extension activation (before webview loads).
  // The shared instances are created below, near AiChatWebviewProvider construction.
  // Here we just set up early-activation resume using the shared poller after it's created.
  // (See "Creating AiChatWebviewProvider" section below for shared instance creation.)

  console.log('[quick-repomix] About to initialize embedding service...');
  // Initialize embedding service with saved configuration
  console.log('[quick-repomix] Initializing embedding service...');
  try {
    const { embeddingService } = await import('./core/indexing/embeddingService.js');
    const config = vscode.workspace.getConfiguration();
    const provider = config.get<string>('repomix.embedding.provider') || 'gemini';
    const ollamaUrl = config.get<string>('repomix.ollama.url') || 'http://localhost:11434';
    const ollamaModel = config.get<string>('repomix.ollama.model') || 'nomic-embed-text';
    const ollamaDimension = config.get<number>('repomix.ollama.dimension') || 768;

    const SECRET_GOOGLE_GEMINI = 'repomix.agent.googleApiKey';
    const googleApiKey = await context.secrets.get(SECRET_GOOGLE_GEMINI);

    if (provider === 'gemini') {
      if (googleApiKey) {
        embeddingService.switchProvider({
          provider: 'gemini',
          gemini: { apiKey: googleApiKey }
        });
        console.log('[quick-repomix] ✓ Embedding service initialized with Gemini provider');
      } else {
        console.log('[quick-repomix] ⚠ Gemini provider selected but API key missing - skipping initialization');
      }
    } else if (provider === 'ollama') {
      embeddingService.switchProvider({
        provider: 'ollama',
        ollama: {
          url: ollamaUrl,
          model: ollamaModel,
          dimension: ollamaDimension
        }
      });
      console.log('[quick-repomix] ✓ Embedding service initialized with Ollama provider');
    }
    console.log('[quick-repomix] Embedding service initialization complete');
  } catch (error) {
    console.error('[quick-repomix] ✗ Failed to initialize embedding service:', error);
    // Non-fatal - extension can still function without embeddings
  }
  console.log('[quick-repomix] Proceeding after embedding service...');

  console.log('[quick-repomix] Exposing global context...');
  // Expose context for agent graph
  (global as any).extensionContext = context;
  // Expose PG pool for chat architecture loading (PRD 008)
  (global as any).chatPgPool = chatPgPool;
  console.log('[quick-repomix] Global context exposed');

  console.log('[quick-repomix] Getting CWD...');
  const cwd = getCwd();
  console.log(`[quick-repomix] CWD: ${cwd}`);
  console.log('[quick-repomix] Creating BundleManager...');
  const bundleManager = new BundleManager(cwd);
  console.log('[quick-repomix] BundleManager created');

  // Initialize ExtensionServices singleton
  console.log('[quick-repomix] Initializing ExtensionServices...');
  const extensionServices = ExtensionServices.initialize(
    databaseService,
    bundleManager,
    context
  );
  console.log('[quick-repomix] ExtensionServices initialized');

  // ==============================================================================
  // BACKGROUND INDEXING MONITOR
  // ==============================================================================
  //
  // This section sets up automatic incremental re-embedding when files change.
  //
  // HOW IT WORKS:
  // 1. VS Code file watcher detects file changes (onDidChange, onDidCreate, onDidDelete)
  // 2. RepoIndexMonitor queues changed files (debounced to batch rapid saves)
  // 3. After debounce period, files are marked as "pending" in the database
  // 4. RepoEmbeddingOrchestrator.embedPendingFiles() processes the queue:
  //    - Deletes old vectors for each file (prevents duplicates)
  //    - Re-embeds the file with new content
  //    - Marks file as "indexed" with SHA256 hash
  //
  // DEBOUNCE (2.5 seconds):
  // - Prevents excessive re-embedding during rapid saves
  // - Batches multiple file changes together
  // - Balances responsiveness vs efficiency
  //
  // IGNORED FOLDERS:
  // - .git, node_modules, dist, out, build, .cache, *.pyc
  // - These folders generate too many events with little value
  //
  // CONFIGURATION REQUIREMENTS:
  // - Google API key (for embeddings)
  // - Pinecone API key (for vector operations)
  // - Pinecone index name (for storage)
  // If any are missing, monitoring is skipped (non-fatal)
  //
  // ==============================================================================

  const SECRET_GOOGLE_GEMINI = 'repomix.agent.googleApiKey';

  console.log(`[BackgroundMonitor] ===== INITIALIZING BACKGROUND MONITOR =====`);

  try {
    console.log(`[BackgroundMonitor] Starting background monitor setup...`);
    // Check if background indexing is enabled in settings
    const bgConfig = vscode.workspace.getConfiguration('repomix.backgroundIndexing');
    const backgroundIndexingEnabled = bgConfig.get<boolean>('enabled', true);
    const debounceMs = bgConfig.get<number>('debounceMs', 2500);

    if (!backgroundIndexingEnabled) {
      console.log(`[BackgroundMonitor] Background indexing disabled in settings - skipping setup`);
    } else {
      console.log(`[BackgroundMonitor] Background indexing is enabled, proceeding with setup...`);
      console.log(`[BackgroundMonitor] Background indexing enabled (debounce: ${debounceMs}ms)`);

      const repoRoot = getCwd();
      console.log(`[BackgroundMonitor] Workspace root: ${repoRoot}`);
      const gitService = new GitService();
      let currentBranch = await gitService.getCurrentBranch(repoRoot);
      await context.globalState.update('repomix.currentBranch', currentBranch);

    const repoId = await getRepoId(repoRoot);
    console.log(`[BackgroundMonitor] Repository ID: ${repoId}`);
    console.log(`[BackgroundMonitor] Current branch: ${currentBranch}`);

    // Get Google API key from secure storage
    console.log(`[BackgroundMonitor] Fetching API keys from secure storage...`);
    const googleApiKey = await context.secrets.get(SECRET_GOOGLE_GEMINI) ?? '';

    const hasGoogleKey = !!googleApiKey;
    console.log(`[BackgroundMonitor]   Google API key: ${hasGoogleKey ? '✓ Found' : '✗ Missing'}`);

    // [CHANGE] Resolve Vector DB Adapter dynamically
    let adapter: VectorDbAdapter | undefined;
    let adapterError: string | undefined;

    try {
      const result = await getVectorDbAdapterForRepo(context, repoId);
      adapter = result.adapter;
      console.log(`[BackgroundMonitor] ✓ Vector DB Provider: ${result.provider}`);
    } catch (e) {
      adapterError = e instanceof Error ? e.message : String(e);
      console.log(`[BackgroundMonitor] ✗ Vector DB Configuration missing: ${adapterError}`);
    }

    // Create orchestrator for incremental embedding
    const embeddingOrchestrator = new RepoEmbeddingOrchestrator(databaseService);

    // ========================================================================
    // SETUP GITIGNORE-BASED FILTERING
    // ========================================================================
    // We use the 'ignore' npm package to parse .gitignore files and check
    // if file paths should be excluded from the file watcher.
    //
    // This provides two benefits:
    // 1. Respects the user's .gitignore configuration automatically
    // 2. Avoids processing build outputs, dependencies, temp files, etc.
    //
    // The ignore package supports:
    // - .gitignore file at repo root
    // - Patterns like **/node_modules, *.log, dist/, etc.
    // - Negation patterns (!pattern)
    // - Comments (# comment)
    // - Subfolder .gitignore files (e.g., subfolder/.gitignore)
    // ========================================================================
    
    console.log(`[BackgroundMonitor] Setting up .gitignore-based filtering...`);
    
    // Initialize the ignore instance
    const ig = ignore();
    
    // Load .gitignore patterns from ALL subdirectories (not just root)
    try {
      const allGitignorePatterns = collectGitignorePatterns(repoRoot);
      ig.add(allGitignorePatterns);
      console.log(`[BackgroundMonitor] ✓ Loaded .gitignore patterns from all subdirectories`);
    } catch (error) {
      console.warn(`[BackgroundMonitor] ⚠ Failed to collect .gitignore patterns: ${error}`);
      logger.both.warn('[BackgroundMonitor] Failed to collect .gitignore patterns:', error);
    }

    // Add additional common ignore patterns that may not be in .gitignore
    // These are files we definitely don't want to index
    const additionalIgnores = [
      // Repomix output files (avoid circular re-embedding!)
      'repomix-output.*',
      'repomix-output-*.*',
      '*.repomix-output.*',
      // Git internals (prevent indexing of binary git objects)
      '.git',
      '**/.git/**',
      // Build artifacts
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.next/**',
      '**/.nuxt/**',
      '**/coverage/**',
      // Dependencies
      '**/node_modules/**',
      '**/vendor/**',
      // Lock files
      '*.lock',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml',
      // Temp files
      '*.tmp',
      '*.temp',
      '.DS_Store',
      'Thumbs.db',
    ];

    ig.add(additionalIgnores);
    console.log(`[BackgroundMonitor] Added ${additionalIgnores.length} additional ignore patterns`);

    // Create the shouldIgnore function using the ignore instance
    // This combines .gitignore patterns with our additional rules
    function shouldIgnore(rel: string): boolean {
      if (!rel) return true;

      // Use forward slashes for gitignore compatibility (ignore package expects this)
      const posixPath = rel.split(path.sep).join('/');

      // Check against gitignore + additional patterns
      return ig.ignores(posixPath);
    }

    console.log(`[BackgroundMonitor] ✓ Gitignore-based filtering initialized`);

    // ========================================================================
    // END GITIGNORE SETUP
    // ========================================================================

    // Only set up monitoring if we have all required configuration
    if (googleApiKey && adapter) {
      console.log(`[BackgroundMonitor] ✓ All requirements met - setting up file watcher`);

      // Create the monitor with 2.5 second debounce
      const monitor = new RepoIndexMonitor(
        repoRoot,
        repoId,
        async () => currentBranch,
        databaseService,
        async (paths) => {
          // This callback is invoked after the debounce period
          // It triggers the actual incremental embedding process
          console.log(`[BackgroundMonitor] Callback triggered for ${paths.length} changed files`);
          await embeddingOrchestrator.embedPendingFiles(
            repoId,
            currentBranch,
            repoRoot,
            googleApiKey,
            adapter, // [CHANGE] Pass adapter instead of pineconeApiKey + indexName
            { maxConcurrentFiles: 2 }, // Conservative concurrency for background processing
            undefined, // onProgress callback (not needed for background)
            undefined  // no AbortSignal (background runs until complete)
          );
        },
        debounceMs // Use configurable debounce from settings
      );

      // Create VS Code file system watcher for all files recursively
      console.log(`[BackgroundMonitor] Creating file system watcher for "**/*"`);
      const watcher = vscode.workspace.createFileSystemWatcher('**/*');

      // Track event counts for debugging
      let changeCount = 0;
      let createCount = 0;
      let deleteCount = 0;
      let ignoredCount = 0;

      // Handle file modifications (user saves a file)
      watcher.onDidChange(uri => {
        changeCount++;
        const rel = toRelativePosix(repoRoot, uri);

        if (!shouldIgnore(rel)) {
          console.log(`[BackgroundMonitor] File changed: ${rel} (total changes: ${changeCount})`);
          monitor.queue(rel);
        } else {
          ignoredCount++;
          logger.output.info(`[INDEX_MONITOR] Ignoring change: ${rel}`);
        }
      });

      // Handle new file creation
      watcher.onDidCreate(uri => {
        createCount++;
        const rel = toRelativePosix(repoRoot, uri);

        if (!shouldIgnore(rel)) {
          console.log(`[BackgroundMonitor] File created: ${rel} (total creates: ${createCount})`);
          monitor.queue(rel);
        } else {
          ignoredCount++;
          logger.output.info(`[INDEX_MONITOR] Ignoring creation: ${rel}`);
        }
      });

      // Handle file deletion
      watcher.onDidDelete(uri => {
        deleteCount++;
        const rel = toRelativePosix(repoRoot, uri);

        if (!shouldIgnore(rel)) {
          console.log(`[BackgroundMonitor] File deleted: ${rel} (total deletes: ${deleteCount})`);
          // Queue for processing (will detect missing file and clean up vectors)
          monitor.queue(rel);
        } else {
          ignoredCount++;
          logger.output.info(`[INDEX_MONITOR] Ignoring deletion: ${rel}`);
        }
      });


      // Register watcher and monitor for cleanup on deactivation
      context.subscriptions.push(watcher, { dispose: () => monitor.dispose() });

      // Keep branch context in sync with Git checkouts.
      const branchListener = await gitService.onBranchChange(repoRoot, async (newBranch) => {
        currentBranch = newBranch;
        await context.globalState.update('repomix.currentBranch', currentBranch);
        console.log(`[BackgroundMonitor] Branch changed to "${currentBranch}", synchronizing...`);
        try {
          const syncResult = await embeddingOrchestrator.synchronizeRepoFiles(
            repoId,
            currentBranch,
            repoRoot,
            shouldIgnore
          );
          const totalChanges = syncResult.added.length + syncResult.modified.length + syncResult.deleted.length;
          if (totalChanges > 0) {
            await embeddingOrchestrator.embedPendingFiles(
              repoId,
              currentBranch,
              repoRoot,
              googleApiKey,
              adapter!,
              { maxConcurrentFiles: 2 }
            );
          }
        } catch (error) {
          console.error(`[BackgroundMonitor] Failed branch transition sync:`, error);
        }
      });
      context.subscriptions.push(branchListener);

      console.log(`[BackgroundMonitor] ===== BACKGROUND MONITOR INITIALIZED =====`);
      console.log(`[BackgroundMonitor] Watcher active for all files ("**/*")`);
      console.log(`[BackgroundMonitor] Debounce: 2.5 seconds`);
      console.log(`[BackgroundMonitor] Event counts will be tracked in console`);
      logger.both.info('[BackgroundMonitor] File watcher initialized for incremental re-embedding');

      // ========================================================================
      // STARTUP SYNCHRONIZATION
      // ========================================================================
      // Perform a background check for changes that occurred while offline.
      // 1. Scan disk vs Database state
      // 2. Queue any Added, Modified, or Deleted files
      // 3. Trigger initial incremental embedding run
      // ========================================================================
      console.log(`[BackgroundMonitor] starting startup synchronization...`);
      setTimeout(async () => {
        try {
          const syncResult = await embeddingOrchestrator.synchronizeRepoFiles(
            repoId,
            currentBranch,
            repoRoot,
            shouldIgnore
          );

          const totalChanges = syncResult.added.length + syncResult.modified.length + syncResult.deleted.length;

          if (totalChanges > 0) {
            console.log(`[BackgroundMonitor] Startup sync found ${totalChanges} changes, triggering re-embedding`);
            await embeddingOrchestrator.embedPendingFiles(
              repoId,
              currentBranch,
              repoRoot,
              googleApiKey,
              adapter!,
              { maxConcurrentFiles: 2 }
            );
          } else {
            console.log(`[BackgroundMonitor] Startup sync: No offline changes detected.`);
          }
        } catch (error) {
          console.error(`[BackgroundMonitor] Startup sync failed:`, error);
        }
      }, 5000); // Wait 5 seconds after startup to not block other activities

      // Stale branch cleanup once after activation with startup delay.
      setTimeout(async () => {
        try {
          const maintenanceService = new BranchMaintenanceService(databaseService, gitService);
          await maintenanceService.cleanupStaleBranches(repoId, repoRoot, adapter!);
        } catch (error) {
          console.error(`[BackgroundMonitor] Branch cleanup failed:`, error);
        }
      }, 30000);
      // ========================================================================

    } else {
      // Missing configuration - skip monitoring (non-fatal)
      console.log(`[BackgroundMonitor] ✗ Skipping background monitor - missing requirements:`);
      console.log(`[BackgroundMonitor]   - Google API key: ${hasGoogleKey ? '✓' : '✗ Required'}`);
      console.log(`[BackgroundMonitor]   - Vector DB: ${adapter ? '✓ Configured' : '✗ ' + adapterError}`);
      console.log(`[BackgroundMonitor] To enable: Configure API keys and vector database settings in Settings`);
      logger.both.info('[BackgroundMonitor] Skipping (missing API keys or vector database configuration)');
    }
    } // Close backgroundIndexingEnabled check
    console.log(`[BackgroundMonitor] Background monitor setup complete`);
  } catch (error) {
    // Non-fatal error: log it but continue extension activation
    console.error(`[BackgroundMonitor] ✗ Failed to initialize file watcher:`);
    console.error(`[BackgroundMonitor]   Error:`, error);
    logger.both.error('[BackgroundMonitor] Failed to initialize file watcher:', error);
    // Continue with extension activation - monitoring is optional
  }

  console.log(`[BackgroundMonitor] ===== INITIALIZATION COMPLETE =====`);
  console.log('[quick-repomix] Continuing after background monitor...');
  // ==============================================================================
  // END BACKGROUND INDEXING MONITOR
  // ==============================================================================

  const bundleDataProvider = new BundleDataProvider(bundleManager);
  const decorationProvider = new BundleFileDecorationProvider(bundleDataProvider);
  const bundleTreeView = vscode.window.createTreeView('repomixBundles', {
    treeDataProvider: bundleDataProvider,
    showCollapseAll: true,
  });

  // Init to avoid circular dependency
  bundleDataProvider.setTreeView(bundleTreeView);
  bundleDataProvider.setDecorationProvider(decorationProvider);

  const decorationProviderSubscription =
    vscode.window.registerFileDecorationProvider(decorationProvider);

  console.log('[quick-repomix] About to create RepomixWebviewProvider...');
  console.log('[quick-repomix] Creating RepomixWebviewProvider...');
  const provider = new RepomixWebviewProvider(context.extensionUri, context, extensionServices, chatPgPool);
  console.log('[quick-repomix] RepomixWebviewProvider created');

  console.log('[quick-repomix] About to create AiChatWebviewProvider...');
  console.log('[quick-repomix] Creating AiChatWebviewProvider...');
  // Pass shared batch manager and poller to avoid duplicate instances (PRD 005 / H1 fix)
  const sharedBatchManager = chatPgPool ? new BatchManager(chatPgPool, context) : undefined;
  const sharedBatchPoller = sharedBatchManager
    ? new BatchPoller(sharedBatchManager, {
        pollIntervalSeconds: vscode.workspace
          .getConfiguration('repomix.chat')
          .get<number>('batchPollIntervalSeconds', 60),
      })
    : undefined;

  const aiChatProvider = new AiChatWebviewProvider(
    context.extensionUri,
    context,
    chatPgPool,
    sharedBatchManager,
    sharedBatchPoller
  );
  console.log('[quick-repomix] AiChatWebviewProvider created');

  // Resume pending batch jobs using the shared poller (must happen after poller creation)
  if (sharedBatchPoller) {
    console.log('[quick-repomix] Resuming pending batch jobs via shared poller...');
    await sharedBatchPoller.resumeAllPending(async (result: BatchCompletionResult) => {
      if (result.status === 'completed') {
        logger.both.info(`[BatchPoller] Batch ${result.batchJobId} completed during startup`);
        vscode.window.showInformationMessage(
          `✅ Batch job ${result.batchJobId.slice(0, 8)}… completed.`
        );
      } else if (result.status === 'cancelled') {
        logger.both.info(`[BatchPoller] Batch ${result.batchJobId} was cancelled`);
      } else if (result.status === 'failed') {
        logger.both.error(`[BatchPoller] Batch ${result.batchJobId} failed: ${result.errorMessage}`);
        vscode.window.showErrorMessage(
          `Batch job ${result.batchJobId.slice(0, 8)}… failed: ${result.errorMessage ?? 'Unknown error'}`
        );
      }
    });

    context.subscriptions.push({
      dispose: () => {
        sharedBatchPoller.dispose();
      },
    });
    console.log('[quick-repomix] Batch poller initialized and pending jobs resumed');
  }

  // ==============================================================================
  // AUTO-TRIGGER ARCHITECTURE GENERATION ON WORKSPACE OPEN
  // ==============================================================================
  // Check if architecture document needs regeneration when workspace opens.
  // This ensures the document is available for chat context gathering.
  // ==============================================================================
  if (chatPgPool) {
    const pgPool = chatPgPool;
    const workspaceFolder = getCwd();
    if (workspaceFolder) {
      // Defer to avoid blocking activation
      setTimeout(async () => {
        try {
          const repoId = await getRepoId(workspaceFolder);
          
          // Check freshness by attempting to load existing document
          const { ArchitectureRepository } = await import('./chat/db/architectureRepository.js');
          const archRepo = new ArchitectureRepository(pgPool);
          const existingArch = await archRepo.getArchitectureByRepoId(repoId);
          
          const needsRefresh = !existingArch || (existingArch.expiresAt && Date.now() > existingArch.expiresAt);
          
          if (needsRefresh) {
            console.log('[Architecture] Auto-trigger: Document missing or expired, generating...');
            
            // Generate in background without blocking UI
            executeArchitectureGeneration(
              workspaceFolder,
              repoId,
              {
                pgPool,
                secrets: context.secrets,
              },
              (message: string) => {
                console.log(`[Architecture] Auto-trigger: ${message}`);
              }
            ).then(() => {
              console.log('[Architecture] Auto-trigger: Generation complete');
            }).catch((error) => {
              console.error('[Architecture] Auto-trigger: Generation failed:', error);
            });
          } else {
            console.log('[Architecture] Auto-trigger: Document is fresh, skipping generation');
          }
        } catch (error) {
          console.error('[Architecture] Auto-trigger: Failed to check freshness:', error);
        }
      }, 3000); // Wait 3 seconds after activation
    }
  }

  console.log('[quick-repomix] Registering webview view providers...');
  const webviewViewSubscription = vscode.window.registerWebviewViewProvider(
    RepomixWebviewProvider.viewType,
    provider
  );
  console.log('[quick-repomix] RepomixWebviewProvider registered');
  const aiChatViewSubscription = vscode.window.registerWebviewViewProvider(
    AiChatWebviewProvider.viewType,
    aiChatProvider
  );
  console.log('[quick-repomix] AiChatWebviewProvider registered');
  console.log('[quick-repomix] Webview view providers registered successfully');

  const addSelectedFilesToNewBundleCommand = vscode.commands.registerCommand(
    'repomixRunner.addSelectedFilesToNewBundle',
    async (uri: vscode.Uri, uris: vscode.Uri[]) => {
      const selectedUris = uris || (uri ? [uri] : []);

      const isBundleCreated = await createBundle(bundleManager);

      if (!isBundleCreated) {
        return;
      }

      await addFilesToActiveBundle(selectedUris, {
        bundleManager: bundleManager,
        cwd,
      });
    }
  );

  const addSelectedFilesToActiveBundleCommand = vscode.commands.registerCommand(
    'repomixRunner.addSelectedFilesToActiveBundle',
    async (uri: vscode.Uri, uris: vscode.Uri[]) => {
      const selectedUris = uris || (uri ? [uri] : []);

      await addFilesToActiveBundle(selectedUris, {
        bundleManager: bundleManager,
        cwd,
      });
    }
  );

  const removeSelectedFilesFromExplorerToActiveBundleCommand = vscode.commands.registerCommand(
    'repomixRunner.removeSelectedFilesFromActiveBundle',
    async (uri: vscode.Uri, uris: vscode.Uri[]) => {
      const selectedUris = uris || (uri ? [uri] : []);

      await removeFilesFromActiveBundle(selectedUris, {
        bundleManager: bundleManager,
        cwd,
      });
    }
  );

  const removeSelectedFilesFromCustomViewToActiveBundleCommand = vscode.commands.registerCommand(
    'repomixRunner.removeSelectedFilesFromCustomViewToActiveBundle',
    async (node: TreeNode) => {
      if (!node || !node.resourceUri) {
        return;
      }

      const uri = node.resourceUri;

      await removeFilesFromActiveBundle([uri], {
        bundleManager: bundleManager,
        cwd,
      });
    }
  );

  const createBundleCommand = vscode.commands.registerCommand('repomixRunner.createBundle', () => {
    createBundle(bundleManager);
  });

  const editBundleCommand = vscode.commands.registerCommand(
    'repomixRunner.editBundle',
    (node: TreeNode) => {
      editBundle({ bundleManager, bundleId: node?.bundleId });
    }
  );

  const runRepomixCommand = vscode.commands.registerCommand('repomixRunner.run', () =>
    runRepomix()
  );

  const runRepomixOnOpenFilesCommand = vscode.commands.registerCommand(
    'repomixRunner.runOnOpenFiles',
    runRepomixOnOpenFiles
  );

  const openSettingsCommand = vscode.commands.registerCommand(
    'repomixRunner.openSettings',
    openSettings
  );

  const openOutputCommand = vscode.commands.registerCommand('repomixRunner.openOutput', openOutput);
  const testCompressionCommand = vscode.commands.registerCommand(
    'repomixRunner.testCompression',
    testCompression
  );

  const runRepomixOnSelectedFilesCommand = vscode.commands.registerCommand(
    'repomixRunner.runOnSelectedFiles',
    (uri: vscode.Uri, uris: vscode.Uri[]) => {
      const selectedUris = uris || (uri ? [uri] : []);
      runRepomixOnSelectedFiles(selectedUris, {}, undefined, databaseService);
    }
  );

  const runBundleCommand = vscode.commands.registerCommand(
    'repomixRunner.runBundle',
    async node => {
      let activeBundleId = node?.bundleId;

      if (!node) {
        activeBundleId = await selectActiveBundle(node, bundleManager);
      } else {
        bundleManager.setActiveBundle(activeBundleId);
      }

      if (!activeBundleId) {
        return;
      }

      await runBundle(bundleManager, activeBundleId);
    }
  );

  const deleteBundleCommand = vscode.commands.registerCommand(
    'repomixRunner.deleteBundle',
    async node => {
      await deleteBundle(bundleManager, node);
    }
  );

  const selectActiveBundleCommand = vscode.commands.registerCommand(
    'repomixRunner.selectActiveBundle',
    async (treeNode: TreeNode) => {
      await selectActiveBundle(treeNode, bundleManager);
    }
  );

  const refreshBundlesCommand = vscode.commands.registerCommand(
    'repomixRunner.refreshBundles',
    () => {
      bundleDataProvider.forceRefresh();
    }
  );

  const goToConfigFileCommand = vscode.commands.registerCommand(
    'repomixRunner.goToConfigFile',
    async (node: TreeNode) => {
      await goToConfigFile(node.bundleId, {
        cwd,
        bundleManager,
      });
    }
  );

  const smartRunCommand = vscode.commands.registerCommand('repomixRunner.smartRun', async () => {
    // 1. Get the Workspace Root
    let workspaceRoot: string;
    try {
      workspaceRoot = getCwd();
    } catch (error) {
      logger.both.error("Smart Agent: Failed to get workspace root", error);
      vscode.window.showErrorMessage("Could not determine workspace root.");
      return;
    }

    // 2. Capture User Query
    let userQuery: string | undefined;
    while (!userQuery) {
      userQuery = await vscode.window.showInputBox({
        title: "Smart Repomix Agent",
        prompt: "Describe what you want to package",
        placeHolder: "e.g., 'All authentication logic excluding tests'",
        ignoreFocusOut: true
      });
      if (userQuery === undefined) {
        return;
      }
    }

    // 2. Get API Key (Secrets > Prompt)
    const apiKey = await context.secrets.get('repomix.agent.googleApiKey');

    // 3. Run the Agent with Progress Indication
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Repomix Agent",
      cancellable: true
    }, async (progress, token) => {
      progress.report({ message: "Initializing agent..." });

      try {
        // Initialize the Graph
        const app = createSmartRepomixGraph(databaseService);

        // Prepare Initial State
        const inputs = {
          apiKey: apiKey || "",
          userQuery: userQuery,
          workspaceRoot: workspaceRoot,
          allFilePaths: [],
          candidateFiles: [],
          confirmedFiles: [],
          finalCommand: "",
          queryId: undefined,
          outputPath: undefined
        };

        // Run the Graph
        // We pass a dummy thread_id required by LangGraph checkpointers (even if in-memory)
        const config = { configurable: { thread_id: "1" } };

        // Invoke the agent
        progress.report({ message: "Thinking & Filtering files..." });

        const finalState = await app.invoke(inputs, config);

        // Success Message
        const fileCount = finalState.confirmedFiles.length;
        if (fileCount > 0) {
          vscode.window.showInformationMessage(
            `Agent run complete! Packaged ${fileCount} files based on: "${userQuery}"`
          );
        } else {
          vscode.window.showWarningMessage(
            `No relevant files found for: "${userQuery}"`
          );
        }

      } catch (error) {
        logger.both.error("Smart Agent Failed:", error);

        const errorMessage = error instanceof Error ? error.message : String(error);

        // specific error handling for missing API key
        if (errorMessage.includes("Google API Key")) {
          const selection = await vscode.window.showErrorMessage(
            "Google API Key missing.",
            "Open Settings"
          );
          if (selection === "Open Settings") {
            vscode.commands.executeCommand('workbench.action.openSettings', 'repomix.agent.googleApiKey');
          }
        } else {
          vscode.window.showErrorMessage(`Agent failed: ${errorMessage}`);
        }
      }
    });
  });

  // Schedule daily cleanup
  const cleanupInterval = setInterval(() => {
    cleanupOldRepomixOutputs(databaseService);
  }, 24 * 60 * 60 * 1000); // Run every 24 hours

  // Run cleanup on startup
  cleanupOldRepomixOutputs(databaseService);

  // Add regeneration command
  const regenerateAgentRunCommand = vscode.commands.registerCommand(
    'repomixRunner.regenerateAgentRun',
    async (runId: string) => {
      try {
        const run = await databaseService.getAgentRunById(runId);
        if (!run) {
          vscode.window.showErrorMessage('Agent run not found');
          return;
        }

        if (!run.success) {
          vscode.window.showErrorMessage('Cannot regenerate failed run');
          return;
        }

        // Create new run with same parameters but new ID
        const newRunId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const uniqueId = generateShortId();
        const outputPath = `repomix-output.${uniqueId}.xml`;

        const includeFlag = run.files.map(f => `"${f}"`).join(",");
        const command = `npx repomix --include ${includeFlag} --output ${outputPath}`;

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: "Regenerating Agent Run",
          cancellable: false
        }, async () => {
          const startTime = Date.now();
          await execPromisify(command, { cwd: getCwd() });

          // Save new run to database
          const newRun: AgentRunHistory = {
            ...run,
            id: newRunId,
            timestamp: startTime,
            outputPath: outputPath,
            duration: Date.now() - startTime
          };

          await databaseService.saveAgentRun(newRun);
        });

        vscode.window.showInformationMessage(`Successfully regenerated output: ${outputPath}`);
      } catch (error) {
        logger.both.error('Failed to regenerate agent run', error);
        vscode.window.showErrorMessage(`Regeneration failed: ${error}`);
      }
    }
  );
  const copySelectedFilesToClipboardCommand = vscode.commands.registerCommand(
    "repomixRunner.copySelectedFilesToClipboard",
    async (clickedFile: vscode.Uri, selectedFiles?: vscode.Uri[]) => {
      return copySelectedFilesToClipboard(context, clickedFile, selectedFiles);
    }
  );

  const copySelectedFilesAsCompressedCommand = vscode.commands.registerCommand(
    "repomixRunner.copySelectedFilesAsCompressed",
    async (clickedFile: vscode.Uri, selectedFiles?: vscode.Uri[]) => {
      return copySelectedFilesAsCompressed(context, clickedFile, selectedFiles);
    }
  );

  const copySingleFileRespectingModeCommand = vscode.commands.registerCommand(
    'repomixRunner.copySingleFileRespectingMode',
    async (filePath: string) => {
      return copySingleFileRespectingMode(filePath);
    }
  );

  // SCM context menu adapter - converts SourceControlResourceState to Uri and delegates
  const copyFromScmCommand = vscode.commands.registerCommand(
    'repomixRunner.copyFromScm',
    async (resource: vscode.SourceControlResourceState, resources?: vscode.SourceControlResourceState[]) => {
      // Get the selected resources - use resources array if multiple, otherwise just the clicked one
      const selected = resources && resources.length ? resources : [resource];
      const uris = selected.map(r => r.resourceUri);

      // Delegate to existing command - pass first URI as first arg, rest as array as second arg
      return vscode.commands.executeCommand(
        'repomixRunner.copySelectedFilesToClipboard',
        uris[0],
        uris
      );
    }
  );

  // Command to copy all Git changes (staged, unstaged, untracked) to clipboard
  const copyAllGitChangesCommand = vscode.commands.registerCommand(
    'repomixRunner.copyAllGitChanges',
    async () => {
      try {
        // Get the repository for the active editor
        const repo = await getRepoForActiveEditor();
        
        if (!repo) {
          vscode.window.showWarningMessage('No Git repository detected for the active editor.');
          return;
        }

        // Get all changed URIs (staged + unstaged + untracked)
        const changedUris = getAllChangedUris(repo);
        
        if (changedUris.length === 0) {
          vscode.window.showInformationMessage('No staged, unstaged or untracked changes.');
          return;
        }

        // Get counts for feedback
        const counts = getChangesCounts(repo);
        console.log(
          `[Repomix] Copying ${changedUris.length} changed files: ${counts.staged} staged, ${counts.unstaged} unstaged, ${counts.untracked} untracked.`
        );

        // Execute the existing copy command with all changed files
        // Pass first URI as clickedFile, all URIs as selectedFiles
        return vscode.commands.executeCommand(
          'repomixRunner.copySelectedFilesToClipboard',
          changedUris[0],
          changedUris
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[Repomix] Failed to copy Git changes:', error);
        vscode.window.showErrorMessage(`Failed to copy Git changes: ${errorMsg}`);
      }
    }
  );

  const testPostgresConnectionCommand = vscode.commands.registerCommand(
    'repomixRunner.testPostgresConnection',
    async () => {
      try {
        const result = await testConnection();
        if (result.success) {
          vscode.window.showInformationMessage(`PostgreSQL connected: ${result.message}`);
        } else {
          vscode.window.showErrorMessage(`PostgreSQL connection failed: ${result.message}`);
        }
      } catch (error) {
        vscode.window.showErrorMessage(
          `Connection test error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Architecture refresh command
  const refreshArchitectureCommand = vscode.commands.registerCommand(
    'repomixRunner.refreshArchitecture',
    async () => {
      if (!chatPgPool) {
        vscode.window.showErrorMessage('PostgreSQL not configured - architecture generation disabled');
        return;
      }
      const pgPool = chatPgPool;

      const workspaceFolder = getCwd();
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found');
        return;
      }

      try {
        const repoId = await getRepoId(workspaceFolder);
        
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Generating Architecture Document',
          cancellable: false,
        }, async (progress) => {
          progress.report({ message: 'Scanning repository...' });
          
          await executeArchitectureGeneration(
            workspaceFolder,
            repoId,
            {
              pgPool,
              secrets: context.secrets,
            },
            (message: string) => {
              progress.report({ message });
            }
          );
        });

        vscode.window.showInformationMessage(`Architecture document generated for ${path.basename(workspaceFolder)}`);
      } catch (error) {
        logger.both.error('Failed to generate architecture document', error);
        vscode.window.showErrorMessage(`Architecture generation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );


  // Ajouter toutes les souscriptions au contexte
  context.subscriptions.push(
    goToConfigFileCommand,
    runRepomixCommand,
    openSettingsCommand,
    openOutputCommand,
    testCompressionCommand,
    runRepomixOnOpenFilesCommand,
    runRepomixOnSelectedFilesCommand,
    runBundleCommand,
    editBundleCommand,
    deleteBundleCommand,
    selectActiveBundleCommand,
    createBundleCommand,
    decorationProviderSubscription,
    webviewViewSubscription,
    aiChatViewSubscription,
    bundleTreeView,
    addSelectedFilesToActiveBundleCommand,
    addSelectedFilesToNewBundleCommand,
    removeSelectedFilesFromExplorerToActiveBundleCommand,
    removeSelectedFilesFromCustomViewToActiveBundleCommand,
    refreshBundlesCommand,
    smartRunCommand,
    regenerateAgentRunCommand,
    copySelectedFilesToClipboardCommand,
    copySelectedFilesAsCompressedCommand,
    copySingleFileRespectingModeCommand,
    copyFromScmCommand,
    copyAllGitChangesCommand,
    testPostgresConnectionCommand,
    refreshArchitectureCommand,
    { dispose: () => clearInterval(cleanupInterval) }
  );
  console.log('[quick-repomix] ===== EXTENSION ACTIVATION COMPLETE =====');
}

// Helper function to generate a unique 4-character ID
function generateShortId(): string {
  return Math.random().toString(36).substring(2, 6);
}

// Cleanup function for old repomix output files
async function cleanupOldRepomixOutputs(databaseService: DatabaseService) {
  try {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const runs = await databaseService.getAgentRunHistory();

    for (const run of runs) {
      if (run.timestamp < sevenDaysAgo && run.outputPath && run.success) {
        const fullPath = path.join(getCwd(), run.outputPath);
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
            logger.both.info(`Cleaned up old repomix output: ${run.outputPath}`);
          } catch (error) {
            logger.both.error(`Failed to delete old output file: ${fullPath}`, error);
          }
        }
      }
    }
  } catch (error) {
    logger.both.error('Failed to cleanup old repomix outputs', error);
  }
}

export async function deactivate() {
  tempDirManager.cleanup();
  await closePool().catch((err) =>
    console.error('[quick-repomix] Failed to close PG pool:', err)
  );
}
