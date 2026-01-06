## src\core\files\cleanOutputFile.ts

```text
import { unlink } from 'fs/promises';
import { logger } from '../../shared/logger.js';

/**
 * Deletes the specified output file with logging.
 *
 * @param {string} outputFileAbs - The absolute path of the output file to be deleted.
 * @returns {Promise<void>} - A promise that resolves when the file deletion is complete.
 */
export async function cleanOutputFile(outputFileAbs: string): Promise<void> {
  try {
    await unlink(outputFileAbs);
  } catch (unlinkError) {
    logger.console.error('Error deleting output file:', unlinkError);
  }
}
```

---

## src\core\files\copyToClipboard.ts

```text
import * as vscode from 'vscode';
import { execPromisify } from '../../shared/execPromisify.js';
import { copyFile, access } from 'fs/promises';
import { tempDirManager } from './tempDirManager.js';
import * as path from 'path';
import * as fs from 'fs';

type OperatingSystem = 'darwin' | 'win32' | 'linux';

async function checkXclipInstalled(dep: { execPromisify: typeof execPromisify }): Promise<boolean> {
  try {
    await dep.execPromisify('command -v xclip');
    return true;
  } catch {
    return false;
  }
}

function toUri(path: string): string {
  return `file://${path.replace(/ /g, '%20')}`;
}

const CLIPBOARD_COMMANDS = {
  darwin: (path: string) =>
    `osascript -e 'tell application "Finder" to set the clipboard to (POSIX file "${path}")'`,
  win32: (path: string) => {
    return `"${getWin32BinaryPath()}" "${path}"`;
  },
  linux: (path: string) => `echo "${toUri(path)}" | xclip -selection clipboard -t text/uri-list`,
} as const;

function getWin32BinaryPath(): string {
    const possiblePaths = [
        path.join(__dirname, '..', 'assets', 'bin', 'repomix-clipboard.exe'), // dist/../assets = assets
        path.join(__dirname, 'assets', 'bin', 'repomix-clipboard.exe'),       // dist/assets?
        path.join(__dirname, '..', '..', '..', 'assets', 'bin', 'repomix-clipboard.exe'), // src/core/files/../../../assets (dev)
        path.join(process.cwd(), 'assets', 'bin', 'repomix-clipboard.exe') // Fallback to CWD
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return p;
        }
    }

    return 'repomix-clipboard.exe';
}

export async function copyToClipboard(
  outputFileAbs: string,
  tmpFilePath: string,
  os: OperatingSystem = process.platform as OperatingSystem,
  dep: {
    copyFile: typeof copyFile;
    execPromisify: typeof execPromisify;
    access: typeof access;
    createTempDir: typeof tempDirManager.createTempDir;
  } = {
    copyFile,
    execPromisify,
    access,
    createTempDir: tempDirManager.createTempDir,
  }
) {
  if (os === 'linux') {
    const isXclipInstalled = await checkXclipInstalled(dep);
    if (!isXclipInstalled) {
      vscode.window.showErrorMessage(
        'xclip is not installed on this system, you need it to copy file to clipboard: sudo apt-get install xclip'
      );
      return;
    }
  }

  // Check if the temporary file exists before proceeding
  try {
    await dep.access(tmpFilePath);
  } catch {
    dep.createTempDir('repomix_runner');
  }

  // First copy the file to the tmp folder to keep the file if config.runner.keepOutputFile is false
  try {
    await dep.copyFile(outputFileAbs, tmpFilePath);
  } catch (copyError) {
    vscode.window.showErrorMessage(`Could not copy output file to temp folder: ${copyError}`);
    throw copyError;
  }

  if (!(os in CLIPBOARD_COMMANDS)) {
    throw new Error(`Unsupported operating system: ${os}`);
  }

  try {
    const command = CLIPBOARD_COMMANDS[os](tmpFilePath);
    await dep.execPromisify(command);
  } catch (err: any) {
    if (os === 'win32') {
         vscode.window.showErrorMessage(`Error setting file to clipboard using helper tool: ${err.message}. Ensure repomix-clipboard.exe is correctly installed.`);
    } else {
        vscode.window.showErrorMessage(`Error setting file to clipboard: ${err.message}`);
    }
    throw err;
  }
}
```

---

## src\core\files\runRepomixClipboardGenerateMarkdown.ts

```text
import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { execPromisify } from '../../shared/execPromisify';

/**
 * Gets the path to the repomix-clipboard binary.
 * The binary is bundled in the extension's bin directory.
 */
function getClipboardBinaryPath(context: vscode.ExtensionContext): string {
  const binaryName = process.platform === 'win32' ? 'repomix-clipboard.exe' : 'repomix-clipboard';
  return vscode.Uri.joinPath(context.extensionUri, 'assets', 'bin', binaryName).fsPath;
}
/**
 * Calculates token count for a file using GPT tokenizer
 */
import { encode } from 'gpt-tokenizer';

async function calculateTokenCount(filePath: string): Promise<number> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const tokens = encode(content);
    return tokens.length;
  } catch (error) {
    throw new Error(`Failed to calculate token count for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Runs the repomix-clipboard binary in "generate markdown" mode.
 *
 * This mode:
 * - Takes a list of repo-relative file paths
 * - Generates a markdown file with each file's contents
 * - Copies the markdown file to the clipboard (as a file drop)
 * - Returns token count of the generated markdown
 *
 * CLI: repomix-clipboard.exe --generate-md --cwd <ABS_REPO_ROOT> <REL_FILE_1> <REL_FILE_2> ...
 *
 * @param extensionContext - VS Code extension context
 * @param cwd - Absolute path to the repository root
 * @param relFiles - Array of repo-relative file paths
 * @returns Promise resolving to token count of generated markdown
 * @throws Error if the binary fails or exits with non-zero code
 */

export async function runRepomixClipboardGenerateMarkdown(
  context: vscode.ExtensionContext,
  cwd: string,
  relativeFiles: string[]
): Promise<void> {
  // 1. Locate the Rust binary (repomix-clipboard)
  const binaryPath = getClipboardBinaryPath(context);

  // 2. Construct Arguments
  const args = [
    '--generate-md',
    '--cwd',
    cwd,
    ...relativeFiles
  ];

  // 3. Execute
  try {
    // Quote the binary path in case of spaces
    const cmd = `"${binaryPath}"`;
    
    // Quote arguments to prevent shell issues
    const escapedArgs = args.map(arg => `"${arg}"`).join(' ');
    const fullCommand = `${cmd} ${escapedArgs}`;

    console.log(`[Repomix] Executing: ${fullCommand}`);
    
    await execPromisify(fullCommand, { cwd });
  } catch (error) {
    console.error(`[Repomix] Binary Error:`, error);
    throw new Error('Failed to execute clipboard binary. Check console for details.');
  }
}
```

---

## src\extension.ts

```text
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { runRepomix } from './commands/runRepomix.js';
import { openSettings } from './commands/openSettings.js';
import { openOutput } from './commands/openOutput.js';
import { runRepomixOnOpenFiles } from './commands/runRepomixOnOpenFiles.js';
import { getCwd } from './config/getCwd.js';
import { tempDirManager } from './core/files/tempDirManager.js';
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

import { copySelectedFilesToClipboard } from './commands/copySelectedFilesToClipboard.js';
import ignore from 'ignore';

export async function activate(context: vscode.ExtensionContext) {
  // Initialize database service
  const databaseService = new DatabaseService(context);
  await databaseService.initialize();

  const cwd = getCwd();
  const bundleManager = new BundleManager(cwd);

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
  const SECRET_PINECONE = 'repomix.agent.pineconeApiKey';
  const STATE_SELECTED_PINECONE_INDEX = 'repomix.pinecone.selectedIndexByRepo';

  console.log(`[BackgroundMonitor] ===== INITIALIZING BACKGROUND MONITOR =====`);

  try {
    const repoRoot = getCwd();
    console.log(`[BackgroundMonitor] Workspace root: ${repoRoot}`);

    const repoId = await getRepoId(repoRoot);
    console.log(`[BackgroundMonitor] Repository ID: ${repoId}`);

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
    // ========================================================================

    console.log(`[BackgroundMonitor] Setting up .gitignore-based filtering...`);

    // Initialize the ignore instance
    const ig = ignore();

    // Try to load .gitignore file if it exists
    const gitignorePath = path.join(repoRoot, '.gitignore');

    if (fs.existsSync(gitignorePath)) {
      try {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        ig.add(gitignoreContent);
        console.log(`[BackgroundMonitor] ✓ Loaded .gitignore (${gitignoreContent.split('\n').length} lines)`);
      } catch (error) {
        console.warn(`[BackgroundMonitor] ⚠ Failed to read .gitignore: ${error}`);
        logger.both.warn('[BackgroundMonitor] Failed to read .gitignore:', error);
      }
    } else {
      console.log(`[BackgroundMonitor] No .gitignore file found (will use default ignore list)`);
    }

    // Add additional common ignore patterns that may not be in .gitignore
    // These are files we definitely don't want to index
    const additionalIgnores = [
      // Repomix output files (avoid circular re-embedding!)
      'repomix-output.*',
      'repomix-output-*.*',
      '*.repomix-output.*',
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
        databaseService,
        async (paths) => {
          // This callback is invoked after the debounce period
          // It triggers the actual incremental embedding process
          console.log(`[BackgroundMonitor] Callback triggered for ${paths.length} changed files`);
          await embeddingOrchestrator.embedPendingFiles(
            repoId,
            repoRoot,
            googleApiKey,
            adapter, // [CHANGE] Pass adapter instead of pineconeApiKey + indexName
            { maxConcurrentFiles: 2 }, // Conservative concurrency for background processing
            undefined, // onProgress callback (not needed for background)
            undefined  // no AbortSignal (background runs until complete)
          );
        },
        2500 // 2.5 second debounce - batches rapid file saves
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
        }
      });

      // Handle file deletion
      watcher.onDidDelete(uri => {
        deleteCount++;
        const rel = toRelativePosix(repoRoot, uri);

        if (!shouldIgnore(rel)) {
          console.log(`[BackgroundMonitor] File deleted: ${rel} (total deletes: ${deleteCount})`);
          // Mark as deleted in database (vectors will be cleaned up later)
          void databaseService.markRepoFileDeleted(repoId, rel);
        } else {
          ignoredCount++;
        }
      });

      // Register watcher and monitor for cleanup on deactivation
      context.subscriptions.push(watcher, { dispose: () => monitor.dispose() });

      console.log(`[BackgroundMonitor] ===== BACKGROUND MONITOR INITIALIZED =====`);
      console.log(`[BackgroundMonitor] Watcher active for all files ("**/*")`);
      console.log(`[BackgroundMonitor] Debounce: 2.5 seconds`);
      console.log(`[BackgroundMonitor] Event counts will be tracked in console`);
      logger.both.info('[BackgroundMonitor] File watcher initialized for incremental re-embedding');

    } else {
      // Missing configuration - skip monitoring (non-fatal)
      console.log(`[BackgroundMonitor] ✗ Skipping background monitor - missing requirements:`);
      console.log(`[BackgroundMonitor]   - Google API key: ${hasGoogleKey ? '✓' : '✗ Required'}`);
      console.log(`[BackgroundMonitor]   - Vector DB: ${adapter ? '✓ Configured' : '✗ ' + adapterError}`);
      console.log(`[BackgroundMonitor] To enable: Configure API keys and vector database settings in Settings`);
      logger.both.info('[BackgroundMonitor] Skipping (missing API keys or vector database configuration)');
    }
  } catch (error) {
    // Non-fatal error: log it but continue extension activation
    console.error(`[BackgroundMonitor] ✗ Failed to initialize file watcher:`);
    console.error(`[BackgroundMonitor]   Error:`, error);
    logger.both.error('[BackgroundMonitor] Failed to initialize file watcher:', error);
    // Continue with extension activation - monitoring is optional
  }

  console.log(`[BackgroundMonitor] ===== INITIALIZATION COMPLETE =====`);
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

  const provider = new RepomixWebviewProvider(context.extensionUri, bundleManager, context, databaseService);

  const webviewViewSubscription = vscode.window.registerWebviewViewProvider(
    RepomixWebviewProvider.viewType,
    provider
  );

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
    try {
      const cwd = getCwd();
      const filesToCopy = selectedFiles?.length ? selectedFiles : [clickedFile];

      const relativeFiles = filesToCopy
        .map((uri) => path.relative(cwd, uri.fsPath))
        .filter((f) => !f.startsWith(".."));

      if (relativeFiles.length === 0) {
        vscode.window.showWarningMessage(
          "Selected files are outside the workspace"
        );
        return;
      }

      console.log(`[Repomix] Copying ${relativeFiles.length} files as Markdown`);

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification },
        async () => {
          await runRepomixClipboardGenerateMarkdown(context, cwd, relativeFiles);
        }
      );

      const fileWord = relativeFiles.length === 1 ? "file" : "files";
      vscode.window.showInformationMessage(
        `✓ Copied ${relativeFiles.length} ${fileWord} as Markdown to clipboard`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Repomix] Failed to copy selected files:", err);
      vscode.window.showErrorMessage(`Failed to copy files: ${msg}`);
    }
  }
);





  // Ajouter toutes les souscriptions au contexte
  context.subscriptions.push(
    goToConfigFileCommand,
    runRepomixCommand,
    openSettingsCommand,
    openOutputCommand,
    runRepomixOnOpenFilesCommand,
    runRepomixOnSelectedFilesCommand,
    runBundleCommand,
    editBundleCommand,
    deleteBundleCommand,
    selectActiveBundleCommand,
    createBundleCommand,
    decorationProviderSubscription,
    webviewViewSubscription,
    bundleTreeView,
    addSelectedFilesToActiveBundleCommand,
    addSelectedFilesToNewBundleCommand,
    removeSelectedFilesFromExplorerToActiveBundleCommand,
    removeSelectedFilesFromCustomViewToActiveBundleCommand,
    refreshBundlesCommand,
    smartRunCommand,
    regenerateAgentRunCommand,
    copySelectedFilesToClipboardCommand,
    { dispose: () => clearInterval(cleanupInterval) }
  );
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

export function deactivate() {
  tempDirManager.cleanup();
  // Database service will be disposed automatically when extension context is disposed
}
```

---

## src\commands\copySelectedFilesToClipboard.ts

```text
import * as vscode from 'vscode';
import * as path from 'path';
import { getCwd } from '../config/getCwd';
import { runRepomixClipboardGenerateMarkdown } from '../core/files/runRepomixClipboardGenerateMarkdown';

export async function copySelectedFilesToClipboard(
  context: vscode.ExtensionContext,
  clickedFile: vscode.Uri, 
  selectedFiles?: vscode.Uri[]
) {
  try {
    const cwd = getCwd();
    const filesToCopy = selectedFiles?.length ? selectedFiles : [clickedFile];

    const relativeFiles = filesToCopy
      .map((uri) => path.relative(cwd, uri.fsPath))
      .filter((f) => !f.startsWith(".."));

    if (relativeFiles.length === 0) {
      vscode.window.showWarningMessage(
        "Selected files are outside the workspace"
      );
      return;
    }

    console.log(`[Repomix] Copying ${relativeFiles.length} files as Markdown`);

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification },
      async () => {
        await runRepomixClipboardGenerateMarkdown(context, cwd, relativeFiles);
      }
    );

    const fileWord = relativeFiles.length === 1 ? "file" : "files";
    vscode.window.showInformationMessage(
      `✓ Copied ${relativeFiles.length} ${fileWord} as Markdown to clipboard`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Repomix] Failed to copy selected files:", err);
    vscode.window.showErrorMessage(`Failed to copy files: ${msg}`);
  }
}
```

---

## package.json

```text
{
  "publisher": "DorianMassoulier",
  "name": "repomix-runner",
  "main": "./dist/extension.js",
  "displayName": "Repomix Runner",
  "icon": "assets/repomix-logo.png",
  "description": "Easily bundle files into a single output for AI processing.",
  "repository": {
    "type": "git",
    "url": "https://github.com/massdo/repomix-runner.git"
  },
  "version": "0.6.52",
  "engines": {
    "vscode": "^1.93.0"
  },
  "categories": [
    "AI",
    "Other"
  ],
  "activationEvents": [
    "onCommand:repomixRunner.run",
    "onCommand:repomixRunner.runOnOpenFiles",
    "onCommand:repomixRunner.openSettings",
    "onCommand:repomixRunner.openOutput",
    "onCommand:repomixRunner.smartRun",
    "onView:repomixBundles",
    "onView:repomixRunner.controlPanel",
    "onStartupFinished"
  ],
  "contributes": {
    "configuration": [
      {
        "title": "Runner",
        "order": 1,
        "type": "object",
        "properties": {
          "repomix.runner.keepOutputFile": {
            "order": 1,
            "type": "boolean",
            "default": true,
            "description": " 📌 \n Keep the output file after copying its content to clipboard"
          },
          "repomix.runner.copyMode": {
            "order": 3,
            "type": "string",
            "enum": [
              "content",
              "file"
            ],
            "default": "content",
            "description": "✍️ or 💾 \n Choose what to copy to clipboard: 'content' for text content, 'file' for the file itself"
          },
          "repomix.runner.useTargetAsOutput": {
            "order": 2,
            "type": "boolean",
            "default": false,
            "description": "🎯 ➡️  🎯 \n Use the targetted folder as the output folder"
          },
          "repomix.runner.useBundleNameAsOutputName": {
            "order": 4,
            "type": "boolean",
            "default": true,
            "description": "📝 \n Use bundle name as output file name when running a bundle"
          },
          "repomix.runner.verbose": {
            "order": 5,
            "type": "boolean",
            "default": false,
            "description": "🔍 \n Verbose mode"
          },
          "repomix.runner.configPath": {
            "order": 6,
            "type": "string",
            "default": "",
            "description": "📁 \n Custom path to the configuration file (relative to workspace root)"
          }
        }
      },
      {
        "title": "Output",
        "order": 2,
        "type": "object",
        "properties": {
          "repomix.output.filePath": {
            "order": 1,
            "type": "string",
            "default": "repomix-output.xml",
            "description": "⚙️ ➡️ ❓\n Path to the output file"
          },
          "repomix.output.style": {
            "order": 2,
            "type": "string",
            "enum": [
              "plain",
              "xml",
              "markdown",
              "json"
            ],
            "default": "xml",
            "description": "🎨 \n Output format style"
          },
          "repomix.output.parsableStyle": {
            "order": 3,
            "type": "boolean",
            "default": false,
            "description": "✂️ \n - Ensures output strictly follows the specification of the chosen format. \n - Provides properly escaped XML output with fast-xml-parser.\n - Dynamically adjusts markdown code block delimiters to avoid content conflicts. \n - Note that this option can increase token count."
          },
          "repomix.output.headerText": {
            "order": 4,
            "type": "string",
            "default": "",
            "description": "📝\n Add a header text to the output"
          },
          "repomix.output.fileSummary": {
            "order": 5,
            "type": "boolean",
            "default": true,
            "description": "➕📝\n Include file summary in output"
          },
          "repomix.output.removeEmptyLines": {
            "order": 6,
            "type": "boolean",
            "default": false,
            "description": "🧹 \n Remove empty lines from code"
          },
          "repomix.output.includeEmptyDirectories": {
            "order": 7,
            "type": "boolean",
            "default": false,
            "description": "🧹 \n Include empty directories in output"
          },
          "repomix.output.instructionFilePath": {
            "type": "string",
            "default": "",
            "description": "🫡\n Path to a file containing detailed custom instructions "
          },
          "repomix.output.directoryStructure": {
            "type": "boolean",
            "default": true,
            "description": "➕🌳 \n Include directory tree structure in output"
          },
          "repomix.output.removeComments": {
            "type": "boolean",
            "default": false,
            "description": "💬 ❌  \n Remove comments from code"
          },
          "repomix.output.copyToClipboard": {
            "type": "boolean",
            "default": true,
            "description": "🔗 \n Copy output to clipboard"
          },
          "repomix.output.topFilesLength": {
            "type": "number",
            "default": 5,
            "description": "Number of top files to show"
          },
          "repomix.output.showLineNumbers": {
            "type": "boolean",
            "default": false,
            "description": "🔢 \n Show line numbers in output"
          },
          "repomix.output.compress": {
            "order": 8,
            "type": "boolean",
            "default": false,
            "description": "🧠 \n Perform intelligent code extraction, focusing on essential function and class signatures to reduce token count"
          }
        }
      },
      {
        "title": "Include",
        "order": 3,
        "type": "object",
        "properties": {
          "repomix.include": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "default": [],
            "description": "🔍 \n Patterns to include in processing"
          }
        }
      },
      {
        "title": "Ignore",
        "order": 4,
        "type": "object",
        "properties": {
          "repomix.ignore.useGitignore": {
            "type": "boolean",
            "default": true,
            "description": "Use .gitignore patterns"
          },
          "repomix.ignore.useDefaultPatterns": {
            "type": "boolean",
            "default": true,
            "description": "Use default ignore patterns"
          },
          "repomix.ignore.customPatterns": {
            "order": 6,
            "type": "array",
            "items": {
              "type": "string"
            },
            "default": [],
            "description": "🙈 \n Custom patterns to ignore"
          }
        }
      },
      {
        "title": "Security",
        "order": 5,
        "type": "object",
        "properties": {
          "repomix.security.enableSecurityCheck": {
            "type": "boolean",
            "default": true,
            "description": "🔒 \n Enable security check during processing"
          }
        }
      },
      {
        "title": "Token Count",
        "order": 6,
        "type": "object",
        "properties": {
          "repomix.tokenCount.encoding": {
            "type": "string",
            "enum": [
              "o200k_base",
              "cl100k_base",
              "p50k_edit",
              "p50k_base",
              "r50k_base",
              "gpt2"
            ],
            "default": "o200k_base",
            "description": "🔢 \n Token count encoding"
          }
        }
      },
      {
        "title": "Smart Agent",
        "order": 7,
        "type": "object",
        "properties": {}
      }
    ],
    "viewsContainers": {
      "activitybar": [
        {
          "id": "repomix-sidebar",
          "title": "Repomix Control Panel",
          "icon": "assets/home.svg"
        }
      ]
    },
    "views": {
      "explorer": [
        {
          "id": "repomixBundles",
          "name": "REPOMIX"
        }
      ],
      "repomix-sidebar": [
        {
          "type": "webview",
          "id": "repomixRunner.controlPanel",
          "name": "Repomix Runner Control Panel"
        }
      ]
    },
    "commands": [
      {
        "command": "repomixRunner.copySelectedFilesToClipboard",
        "title": "Copy as Markdown to Clipboard",
        "category": "Repomix"
      },
      {
        "command": "repomixRunner.editBundle",
        "title": "Repomix: Edit Bundle",
        "icon": "$(edit)"
      },
      {
        "command": "repomixRunner.goToConfigFile",
        "title": "Repomix: Go to Bundle Config File",
        "icon": "$(go-to-file)"
      },
      {
        "command": "repomixRunner.removeSelectedFilesFromCustomViewToActiveBundle",
        "title": "Repomix: Remove Selection from Active Bundle",
        "icon": "$(trash)"
      },
      {
        "command": "repomixRunner.removeSelectedFilesFromActiveBundle",
        "title": "Repomix: Remove Selection from Active Bundle",
        "icon": "$(trash)"
      },
      {
        "command": "repomixRunner.addSelectedFilesToActiveBundle",
        "title": "Repomix: Add to Active Bundle",
        "icon": "$(plus)"
      },
      {
        "command": "repomixRunner.addSelectedFilesToNewBundle",
        "title": "Repomix: Create New Bundle with Selection",
        "icon": "$(plus)"
      },
      {
        "command": "repomixRunner.createBundle",
        "title": "Repomix: Create New Bundle",
        "icon": "$(plus)"
      },
      {
        "command": "repomixRunner.selectActiveBundle",
        "title": "Repomix: Select Active Bundle",
        "icon": "$(search)"
      },
      {
        "command": "repomixRunner.run",
        "title": "Repomix: Run",
        "description": "Run repomix on the root folder of your project",
        "icon": "assets/repomix-logo.svg"
      },
      {
        "command": "repomixRunner.runBundle",
        "title": "Repomix: Run Bundle",
        "icon": "$(play)"
      },
      {
        "command": "repomixRunner.deleteBundle",
        "title": "Repomix: Delete Bundle",
        "icon": "$(trash)",
        "enablement": "view == repomixBundles"
      },
      {
        "command": "repomixRunner.refreshBundles",
        "title": "Repomix: Refresh Bundles",
        "icon": "$(refresh)"
      },
      {
        "command": "repomixRunner.runOnSelectedFiles",
        "title": "Repomix: Run on Selection"
      },
      {
        "command": "repomixRunner.runOnOpenFiles",
        "title": "Repomix: Run On Open Files",
        "description": "Run repomix on the open files",
        "icon": "assets/file.svg"
      },
      {
        "command": "repomixRunner.openSettings",
        "title": "Repomix: Settings",
        "description": "Open Repomix Runner settings",
        "icon": "$(settings)"
      },
      {
        "command": "repomixRunner.openOutput",
        "title": "Repomix: Output",
        "description": "Open Repomix Runner output channel",
        "icon": "$(output)"
      },
      {
        "command": "repomixRunner.removeFileFromBundle",
        "title": "Remove from Bundle",
        "icon": "$(trash)"
      },
      {
        "command": "repomixRunner.smartRun",
        "title": "Repomix: Smart Agent Run",
        "description": "Use AI to intelligently select and package files based on a natural language query",
        "icon": "$(sparkle)"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "repomixRunner.createBundle",
          "title": "Repomix: Create New Bundle",
          "when": "view == repomixBundles",
          "group": "navigation@0"
        },
        {
          "command": "repomixRunner.run",
          "title": "Repomix Run",
          "group": "navigation@1",
          "when": "view == repomixBundles"
        },
        {
          "command": "repomixRunner.runOnOpenFiles",
          "title": "Repomix On Open Files",
          "group": "navigation",
          "when": "view == repomixBundles"
        },
        {
          "command": "repomixRunner.openSettings",
          "when": "view == repomixBundles",
          "group": "navigation@2",
          "icon": "$(settings)"
        },
        {
          "command": "repomixRunner.refreshBundles",
          "when": "view == repomixBundles",
          "group": "navigation@4"
        }
      ],
      "view/item/context": [
        {
          "command": "repomixRunner.runBundle",
          "when": "viewItem == bundle",
          "group": "inline@3"
        },
        {
          "command": "repomixRunner.editBundle",
          "when": "viewItem == bundle",
          "group": "inline@2"
        },
        {
          "command": "repomixRunner.goToConfigFile",
          "when": "viewItem == bundle",
          "group": "inline@1"
        },
        {
          "command": "repomixRunner.removeSelectedFilesFromCustomViewToActiveBundle",
          "when": "viewItem in activeBundleId",
          "group": "inline@4"
        },
        {
          "command": "repomixRunner.deleteBundle",
          "when": "viewItem == bundle",
          "group": "repomix@1"
        }
      ],
      "explorer/context": [
        {
          "command": "repomixRunner.copySelectedFilesToClipboard",
          "when": "explorerResourceIsFolder || !explorerResourceIsFolder",
          "group": "2_workspace"
        },
        {
          "command": "repomixRunner.runOnSelectedFiles",
          "when": "explorerResourceIsFolder || resourceLangId",
          "group": "repomix@1"
        },
        {
          "command": "repomixRunner.addSelectedFilesToNewBundle",
          "when": "explorerResourceIsFolder || resourceLangId",
          "group": "repomix@2"
        },
        {
          "command": "repomixRunner.addSelectedFilesToActiveBundle",
          "when": "(explorerResourceIsFolder || resourceLangId) && activeBundleId",
          "group": "repomix@2"
        },
        {
          "command": "repomixRunner.removeSelectedFilesFromActiveBundle",
          "when": "(explorerResourceIsFolder || resourceLangId ) && activeBundleId",
          "group": "repomix@3"
        }
      ],
      "commandPalette": [
        {
          "command": "repomixRunner.selectActiveBundle",
          "when": "never"
        },
        {
          "command": "repomixRunner.goToConfigFile",
          "when": "never"
        },
        {
          "command": "repomixRunner.removeSelectedFilesFromActiveBundle",
          "when": "never"
        },
        {
          "command": "repomixRunner.removeSelectedFilesFromCustomViewToActiveBundle",
          "when": "never"
        },
        {
          "command": "repomixRunner.addSelectedFilesToActiveBundle",
          "when": "never"
        },
        {
          "command": "repomixRunner.addSelectedFilesToNewBundle",
          "when": "never"
        },
        {
          "command": "repomixRunner.runOnSelectedFiles",
          "when": "never"
        }
      ]
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run package",
    "compile": "npm run check-types && npm run lint && node esbuild.js",
    "watch": "npm-run-all -p watch:*",
    "watch:esbuild": "rimraf dist && node esbuild.js --watch",
    "watch:tsc": "tsc --noEmit --watch --project tsconfig.json",
    "package": "rimraf dist && npm run lint && node esbuild.js --production",
    "package:vsix": "node scripts/ensure-bin.mjs && vsce package --out bin/",
    "compile-tests": "tsc -p . --outDir out",
    "watch-tests": "tsc -p . -w --outDir out",
    "pretest": "npm run compile-tests && npm run compile && npm run lint",
    "check-types": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vscode-test",
    "clean": "rimraf dist out",
    "build:rust": "node scripts/build-rust.mjs",
    "setup:treesitter": "node scripts/setup-treesitter.mjs",
    "package:local": "node scripts/package-local.mjs"
  },
  "devDependencies": {
    "@types/mocha": "^10.0.10",
    "@types/node": "20.x",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@types/sinon": "^17.0.3",
    "@types/vscode": "^1.93.0",
    "@typescript-eslint/eslint-plugin": "^8.50.0",
    "@typescript-eslint/parser": "^8.22.0",
    "@vscode/test-cli": "^0.0.10",
    "@vscode/test-electron": "^2.4.1",
    "@vscode/vsce": "^3.7.1",
    "esbuild": "^0.25.0",
    "eslint": "^9.16.0",
    "eslint-plugin-react-hooks": "^7.0.1",
    "globby": "^14.1.0",
    "mocha": "^11.7.5",
    "npm-run-all": "^4.1.5",
    "playwright": "^1.57.0",
    "rimraf": "^6.0.1",
    "sinon": "^19.0.2",
    "typescript": "^5.9.3"
  },
  "dependencies": {
    "@fluentui/react-components": "^9.72.8",
    "@google/genai": "^1.34.0",
    "@langchain/core": "^1.1.5",
    "@langchain/google-genai": "^2.1.0",
    "@langchain/langgraph": "^1.0.4",
    "@pinecone-database/pinecone": "^6.1.3",
    "@qdrant/js-client-rest": "^1.16.2",
    "@types/sql.js": "^1.4.9",
    "fast-xml-parser": "^5.3.3",
    "fastest-levenshtein": "^1.0.16",
    "glob-gitignore": "^1.0.15",
    "gpt-tokenizer": "^3.4.0",
    "ignore": "^7.0.5",
    "react": "^19.2.3",
    "react-dom": "^19.2.3",
    "sql.js": "^1.13.0",
    "zod": "^3.25.76"
  },
  "__metadata": {
    "size": 944254177
  }
}
```

---

