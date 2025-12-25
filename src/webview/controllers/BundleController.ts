import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BaseController } from './BaseController.js';
import { BundleManager } from '../../core/bundles/bundleManager.js';
import { ExecutionQueueManager, DEFAULT_REPOMIX_ID } from '../services/ExecutionQueueManager.js';
import { resolveBundleOutputPath } from '../../core/files/outputPathResolver.js';
import { calculateBundleStats, getCachedBundleStats, invalidateStatsCache } from '../../core/files/fileStats.js';
import { getCwd } from '../../config/getCwd.js';
import { copyToClipboard } from '../../core/files/copyToClipboard.js';
import { tempDirManager } from '../../core/files/tempDirManager.js';
import { getRepomixOutputPath } from '../../utils/repomix_output_detector.js';
import { addFileExtension } from '../../utils/fileExtensions.js';
import { normalizeOutputStyle } from '../../utils/normalizeOutputStyle.js';
import { readRepomixRunnerVscodeConfig } from '../../config/configLoader.js';

export class BundleController extends BaseController {
  private _outputFileWatchers: Map<string, { watcher: vscode.FileSystemWatcher, path: string }> = new Map();
  private _defaultRepomixWatcher?: vscode.FileSystemWatcher;
  private _lastWatchedRepomixOutputPath?: string;
  private _bundlesDebounceTimer?: NodeJS.Timeout;
  private _defaultStateDebounceTimer?: NodeJS.Timeout;

  constructor(
    context: any,
    private readonly bundleManager: BundleManager,
    private readonly queueManager: ExecutionQueueManager
  ) {
    super(context);

    // Listen for bundle changes
    this.bundleManager.onDidChangeBundles.event(() => {
      invalidateStatsCache();
      this.refreshBundles();
    });
  }

  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      case 'runBundle':
        await this.queueManager.addToQueue(message.bundleId, message.compress);
        return true;
      case 'cancelBundle':
        await this.queueManager.cancel(message.bundleId);
        return true;
      case 'copyBundleOutput':
        await this.handleCopyBundleOutput(message.bundleId);
        return true;
      case 'runDefaultRepomix':
        await this.queueManager.addToQueue(DEFAULT_REPOMIX_ID, message.compress);
        return true;
      case 'cancelDefaultRepomix':
        await this.queueManager.cancel(DEFAULT_REPOMIX_ID);
        return true;
      case 'copyDefaultRepomixOutput':
        await this.handleCopyDefaultRepomixOutput();
        return true;
    }
    return false;
  }

  async onWebviewLoaded() {
    await this.refreshBundles();
    await this.refreshDefaultRepomixState();
  }

  public refreshBundles() {
    if (this._bundlesDebounceTimer) clearTimeout(this._bundlesDebounceTimer);
    this._bundlesDebounceTimer = setTimeout(() => this._sendBundles(), 300);
  }

  public refreshDefaultRepomixState() {
    if (this._defaultStateDebounceTimer) clearTimeout(this._defaultStateDebounceTimer);
    this._defaultStateDebounceTimer = setTimeout(() => this._sendDefaultRepomixState(), 500);
  }

  private async _sendBundles() {
    const bundleMetadata = await this.bundleManager.getAllBundles();
    const cwd = getCwd();
    const activeBundleIds = new Set(Object.keys(bundleMetadata.bundles));

    // Cleanup old watchers
    this._outputFileWatchers.forEach((item, id) => {
      if (!activeBundleIds.has(id)) {
        item.watcher.dispose();
        this._outputFileWatchers.delete(id);
      }
    });

    // Phase 1: Send fast (cached)
    const initialBundles = await Promise.all(
      Object.entries(bundleMetadata.bundles).map(async ([id, bundle]) => {
        const outputPath = await resolveBundleOutputPath(bundle);
        const exists = fs.existsSync(outputPath);

        // Update watchers
        const existingWatcher = this._outputFileWatchers.get(id);
        if (!existingWatcher || existingWatcher.path !== outputPath) {
          existingWatcher?.watcher.dispose();
          const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(path.dirname(outputPath), path.basename(outputPath))
          );
          watcher.onDidCreate(() => this.refreshBundles());
          watcher.onDidDelete(() => this.refreshBundles());
          this._outputFileWatchers.set(id, { watcher, path: outputPath });
        }

        return {
          id,
          ...bundle,
          outputFilePath: outputPath,
          outputFileExists: exists,
          stats: getCachedBundleStats(id)
        };
      })
    );

    this.context.postMessage({ command: 'updateBundles', bundles: initialBundles });

    // Phase 2: Calculate missing stats
    const bundlesNeedingStats = initialBundles.filter(b => !b.stats);
    if (bundlesNeedingStats.length > 0) {
      await Promise.all(bundlesNeedingStats.map(b => {
        if (b.files) return calculateBundleStats(cwd, b.id, b.files);
      }));

      // Resend with stats
      const finalBundles = initialBundles.map(b => ({
        ...b,
        stats: getCachedBundleStats(b.id)
      }));
      this.context.postMessage({ command: 'updateBundles', bundles: finalBundles });
    }
  }

  /**
   * Resolves the default Repomix output path.
   * Priority:
   * 1. 'repomix.config.json' file (if 'output.filePath' is defined)
   * 2. Fallback to auto-detection (getRepomixOutputPath)
   *
   * Note: The output style is applied to ensure the file extension matches the configured style.
   */
  private async _resolveDefaultRepomixOutputPath(): Promise<string> {
    const cwd = getCwd();
    const configPath = path.join(cwd, 'repomix.config.json');
    const vscodeConfig = readRepomixRunnerVscodeConfig();

    // Strategy A: Try to read from repomix.config.json
    if (fs.existsSync(configPath)) {
      try {
        const configContent = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);

        if (config.output && config.output.filePath) {
          // Get the output style from config or VS Code settings and normalize it
          const outputStyle = normalizeOutputStyle(config.output?.style || vscodeConfig.output.style);

          // Apply file extension based on style to ensure consistency
          let filePath = config.output.filePath;
          filePath = addFileExtension(filePath, outputStyle);

          // Resolve relative path against CWD
          return path.resolve(cwd, filePath);
        }
      } catch (e) {
        console.warn('Repomix Runner: Failed to parse repomix.config.json, falling back to detector.', e);
      }
    }

    // Strategy B: Fallback to the standard detector (defaults)
    return getRepomixOutputPath(cwd);
  }

  private async _sendDefaultRepomixState() {
    try {
      const outputPath = await this._resolveDefaultRepomixOutputPath();
      const exists = fs.existsSync(outputPath);

      // Update watcher only if path changed
      if (outputPath !== this._lastWatchedRepomixOutputPath) {
        if (this._defaultRepomixWatcher) {
          this._defaultRepomixWatcher.dispose();
        }

        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(path.dirname(outputPath), path.basename(outputPath))
        );
        watcher.onDidCreate(() => this.refreshDefaultRepomixState());
        watcher.onDidDelete(() => this.refreshDefaultRepomixState());
        this._defaultRepomixWatcher = watcher;
        this._lastWatchedRepomixOutputPath = outputPath;
      }

      this.context.postMessage({
        command: 'updateDefaultRepomix',
        data: {
          outputFileExists: exists,
          outputFilePath: outputPath
        }
      });

    } catch (e) {
      console.error('Failed to send default repomix state:', e);
    }
  }

  private async handleCopyBundleOutput(bundleId: string) {
    const bundle = await this.bundleManager.getBundle(bundleId);
    if (!bundle) {
      vscode.window.showErrorMessage(`Bundle not found: ${bundleId}`);
      return;
    }

    try {
      const outputPath = await resolveBundleOutputPath(bundle);
      await this._copyFile(outputPath);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to copy bundle output: ${err.message}`);
    }
  }

  private async handleCopyDefaultRepomixOutput() {
    try {
      const outputPath = await this._resolveDefaultRepomixOutputPath();
      await this._copyFile(outputPath);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Failed to copy default output: ${err.message}`);
    }
  }

  private async _copyFile(outputPath: string) {
    if (!fs.existsSync(outputPath)) {
      vscode.window.showErrorMessage(`Output file not found: ${outputPath}`);
      return;
    }

    try {
      const originalFilename = path.basename(outputPath);
      const tmpDir = path.join(tempDirManager.getTempDir(), `copy_${Date.now()}`);
      await fs.promises.mkdir(tmpDir, { recursive: true });
      const tmpFilePath = path.join(tmpDir, originalFilename);
      await copyToClipboard(outputPath, tmpFilePath);
      vscode.window.showInformationMessage(`Copied "${originalFilename}" to clipboard.`);
      await tempDirManager.cleanupFile(tmpFilePath);
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to copy: ${e.message}`);
    }
  }

  dispose() {
    this._outputFileWatchers.forEach(w => w.watcher.dispose());
    this._defaultRepomixWatcher?.dispose();
    if (this._bundlesDebounceTimer) clearTimeout(this._bundlesDebounceTimer);
    if (this._defaultStateDebounceTimer) clearTimeout(this._defaultStateDebounceTimer);
  }
}