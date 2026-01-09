import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BaseController } from './BaseController.js';
import { DatabaseService } from '../../core/storage/databaseService.js';
import { getCwd } from '../../config/getCwd.js';
import { getRepoName } from '../../utils/repoName.js';
import { copyToClipboard } from '../../core/files/copyToClipboard.js';
import { tempDirManager } from '../../core/files/tempDirManager.js';
import { runRepomixOnSelectedFiles } from '../../commands/runRepomixOnSelectedFiles.js';
import { addFileExtension } from '../../utils/fileExtensions.js';
import { normalizeOutputStyle } from '../../utils/normalizeOutputStyle.js';
import { readRepomixRunnerVscodeConfig } from '../../config/configLoader.js';
import { getRemoteEnvironment, shouldUseLocalBinaryExecution, getBinaryName } from '../../core/files/remoteDetection.js';

export class DebugController extends BaseController {
  constructor(
    context: any,
    private readonly databaseService: DatabaseService
  ) {
    super(context);
  }

  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      case 'getDebugRuns':
        await this.handleGetDebugRuns();
        return true;
      case 'deleteDebugRun':
        await this.handleDeleteDebugRun(message.id);
        return true;
      case 'reRunDebug':
        await this.handleReRunDebug(message.files);
        return true;
      case 'copyDebugOutput':
        await this.handleCopyDebugOutput();
        return true;
      case 'getEnvironmentInfo':
        await this.handleGetEnvironmentInfo();
        return true;
    }
    return false;
  }

  async onWebviewLoaded() {
    await this.handleGetDebugRuns();
  }

  private async handleGetDebugRuns(): Promise<void> {
    try {
      const repoName = await getRepoName(getCwd());
      const runs = await this.databaseService.getDebugRuns(repoName);
      this.context.postMessage({
        command: 'updateDebugRuns',
        runs,
      });
    } catch (error) {
      console.error('Failed to get debug runs:', error);
    }
  }

  private async handleDeleteDebugRun(id: number): Promise<void> {
    try {
      await this.databaseService.deleteDebugRun(id);
      await this.handleGetDebugRuns();
      vscode.window.showInformationMessage('Debug run deleted successfully');
    } catch (error) {
      console.error('Failed to delete debug run:', error);
      vscode.window.showErrorMessage(`Failed to delete debug run: ${error}`);
    }
  }

  private async handleReRunDebug(files: string[]): Promise<void> {
    const cwd = getCwd();
    const safeFiles = files.filter(file => {
      const resolved = path.resolve(cwd, file);
      return resolved.startsWith(cwd);
    });

    if (safeFiles.length !== files.length) {
      vscode.window.showWarningMessage('Some files were skipped due to security checks.');
    }

    if (safeFiles.length === 0) {
      vscode.window.showWarningMessage('No valid files to run');
      return;
    }

    const uris = safeFiles.map(file => vscode.Uri.file(path.join(cwd, file)));
    await runRepomixOnSelectedFiles(uris, {}, undefined, this.databaseService);
  }

  private async handleCopyDebugOutput() {
    try {
      const outputPath = await this._resolveDefaultRepomixOutputPath();
      if (!fs.existsSync(outputPath)) {
        vscode.window.showErrorMessage(`Output file not found: ${outputPath}`);
        return;
      }

      // Use original filename without timestamp prefix
      const originalFilename = path.basename(outputPath);
      const tmpDir = path.join(tempDirManager.getTempDir(), `copy_${Date.now()}`);

      // Ensure subdirectory exists
      await fs.promises.mkdir(tmpDir, { recursive: true });

      const tmpFilePath = path.join(tmpDir, originalFilename);

      await copyToClipboard(outputPath, tmpFilePath);
      vscode.window.showInformationMessage(`Copied "${originalFilename}" to clipboard.`);
      await tempDirManager.cleanupFile(tmpFilePath);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to copy output: ${errorMessage}`);
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
        console.warn('Repomix Runner Plus: Failed to parse repomix.config.json, falling back to detector.', e);
      }
    }

    // Strategy B: Fallback to the standard detector (defaults)
    const { getRepomixOutputPath } = await import('../../utils/repomix_output_detector.js');
    return getRepomixOutputPath(cwd);
  }

  private async handleGetEnvironmentInfo(): Promise<void> {
    try {
      // Get remote environment info
      const env = getRemoteEnvironment();

      // Determine if we should use local binary
      const shouldUseLocalBinary = shouldUseLocalBinaryExecution(env);

      // Find binary path if applicable
      let binaryPath: string | undefined;
      let binaryExists = false;

      if (shouldUseLocalBinary) {
        const binaryName = getBinaryName(env.localOs, env.localArch);

        // Search for binary in expected locations
        const possiblePaths = [
          path.join(__dirname, '..', '..', '..', 'assets', 'bin', binaryName),
          path.join(__dirname, '..', '..', 'assets', 'bin', binaryName),
          path.join(process.env.REPOMIX_EXTENSION_DIR || '', 'assets', 'bin', binaryName),
          path.resolve(process.cwd(), 'assets', 'bin', binaryName),
        ];

        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            binaryPath = p;
            binaryExists = true;
            break;
          }
        }

        if (!binaryExists) {
          binaryPath = possiblePaths[0]; // Show expected path even if not found
        }
      }

      // Get remote OS info (when in remote mode, process.platform is the remote OS)
      const remoteOs = env.isRemote ? (process.platform as NodeJS.Platform) : undefined;
      const remoteArch = env.isRemote ? process.arch : undefined;

      // Send environment info to webview
      this.context.postMessage({
        command: 'updateEnvironmentInfo',
        environmentInfo: {
          localOs: env.localOs,
          localArch: env.localArch,
          remoteOs,
          remoteArch,
          isRemote: env.isRemote,
          remoteName: env.remoteName,
          isSshRemote: env.remoteName?.startsWith('ssh') || false,
          shouldUseLocalBinary,
          binaryPath,
          binaryExists,
        },
      });
    } catch (error) {
      console.error('Failed to get environment info:', error);
    }
  }
}