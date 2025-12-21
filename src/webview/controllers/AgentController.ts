import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BaseController } from './BaseController.js';
import { DatabaseService } from '../../core/storage/databaseService.js';
import { getCwd } from '../../config/getCwd.js';
import { getWorkspaceFiles } from '../../agent/tools.js';
import { copyToClipboard } from '../../core/files/copyToClipboard.js';
import { tempDirManager } from '../../core/files/tempDirManager.js';

export class AgentController extends BaseController {
  constructor(
    context: any,
    private readonly databaseService: DatabaseService,
    private readonly extensionContext: vscode.ExtensionContext
  ) {
    super(context);
  }

  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      case 'runSmartAgent':
        await this.runSmartAgent(message.query);
        return true;
      case 'getAgentHistory':
        await this.getHistory();
        return true;
      case 'rerunAgent':
        await this.rerunAgent(message.runId, message.useSavedFiles);
        return true;
      case 'regenerateAgentRun':
        await vscode.commands.executeCommand('repomixRunner.regenerateAgentRun', message.runId);
        return true;
      case 'copyAgentOutput':
        await this.copyOutput(message.runId);
        return true;
      case 'copyLastAgentOutput':
        await this.copyFile(message.outputPath);
        return true;
    }
    return false;
  }

  private async runSmartAgent(query: string) {
    const workspaceRoot = getCwd();
    let apiKey = await this.extensionContext.secrets.get('repomix.agent.googleApiKey');
    if (!apiKey) {
      apiKey = vscode.workspace.getConfiguration('repomix.agent').get<string>('googleApiKey');
    }

    if (!apiKey) {
      vscode.window.showErrorMessage("Google API Key missing.");
      this.context.postMessage({ command: 'agentRunFailed' });
      return;
    }

    this.context.postMessage({ command: 'agentStateChange', status: 'running' });

    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Repomix Agent",
      cancellable: true
    }, async (progress, token) => {
      try {
        progress.report({ message: "Initializing...", increment: 0 });

        const { createSmartRepomixGraph } = await import('../../agent/graph.js');
        const app = createSmartRepomixGraph(this.databaseService);

        const inputs = {
          apiKey: apiKey,
          userQuery: query,
          workspaceRoot: workspaceRoot,
          allFilePaths: [],
          candidateFiles: [],
          confirmedFiles: [],
          finalCommand: "",
          outputPath: undefined
        };

        const config = { configurable: { thread_id: `agent_${Date.now()}` } };

        // We use stream() instead of invoke() to get updates from the graph nodes
        // We accumulate the state manually to have the 'finalState' at the end
        let finalState: any = { ...inputs };
        const stream = await app.stream(inputs, config);

        for await (const chunk of stream) {
          if (token.isCancellationRequested) {
            throw new Error("Operation cancelled by user");
          }

          // The chunk object keys are the node names (e.g., { filtering: { ... } })
          const nodeName = Object.keys(chunk)[0];
          const update = (chunk as any)[nodeName];

          // Merge updates into final state
          finalState = { ...finalState, ...update };

          // Extract current total tokens
          const currentTokens = finalState.totalTokens || 0;

          // Update the VS Code notification based on the active node
          switch (nodeName) {
            case 'indexing':
              progress.report({ message: "Scanning workspace files...", increment: 10 });
              break;
            case 'structureExtraction':
              progress.report({ message: "Analyzing project structure...", increment: 10 });
              break;
            case 'filtering':
              const candidates = update.candidateFiles?.length || 0;
              progress.report({ message: `Filtering: found ${candidates} potential files...`, increment: 20 });
              break;
            case 'relevanceCheck':
              const confirmed = update.confirmedFiles?.length || 0;
              progress.report({
                message: `Deep analysis: confirmed ${confirmed} relevant files (${currentTokens.toLocaleString()} tokens)...`,
                increment: 30
              });
              break;
            case 'commandGeneration':
              progress.report({ message: "Generating Repomix command...", increment: 10 });
              break;
            case 'execution':
              progress.report({ message: "Running Repomix CLI...", increment: 20 });
              break;
          }
        }

        const fileCount = finalState.confirmedFiles.length;
        const outputPath = finalState.outputPath;
        const totalTokens = finalState.totalTokens || 0;

        if (fileCount > 0 && outputPath) {
          // Success - notify webview with output path
          this.context.postMessage({
            command: 'agentRunComplete',
            outputPath: outputPath,
            fileCount: fileCount,
            query: query,
            tokens: totalTokens
          });

          vscode.window.showInformationMessage(`Agent successfully packaged ${fileCount} files! (Used ${totalTokens.toLocaleString()} tokens)`);
        } else {
          // No files found
          this.context.postMessage({ command: 'agentRunFailed' });
          vscode.window.showWarningMessage(`No relevant files found for: "${query}"`);
        }
      } catch (error: any) {
        this.context.postMessage({ command: 'agentRunFailed' });

        const errorMessage = error instanceof Error ? error.message : String(error);

        // Specific error handling for missing API key
        if (errorMessage.includes('Google API Key')) {
          const selection = await vscode.window.showErrorMessage(
            'Google API Key missing.',
            'Open Settings'
          );
          if (selection === 'Open Settings') {
            vscode.commands.executeCommand(
              'workbench.action.openSettings',
              'repomix.agent.googleApiKey'
            );
          }
        } else if (errorMessage.includes('cancelled')) {
          vscode.window.showInformationMessage("Agent run cancelled.");
        } else {
          vscode.window.showErrorMessage(`Agent failed: ${errorMessage}`);
        }
      } finally {
        // Notify webview that agent is done
        this.context.postMessage({ command: 'agentStateChange', status: 'idle' });
      }
    });
  }

  private async getHistory() {
    try {
      const history = await this.databaseService.getAgentRunHistory(50);
      this.context.postMessage({ command: 'agentHistory', history });
    } catch (e: any) {
      console.error('Failed to get agent history:', e);
      vscode.window.showErrorMessage(`Failed to get agent history: ${e.message}`);
    }
  }

  private async rerunAgent(runId: string, useSavedFiles: boolean) {
    try {
      // Get the previous run from database
      const previousRun = await this.databaseService.getAgentRunById(runId);
      if (!previousRun) {
        vscode.window.showErrorMessage('Previous agent run not found');
        return;
      }

      if (useSavedFiles && previousRun.files.length === 0) {
        vscode.window.showWarningMessage('No saved file list for this run');
        return;
      }

      // Notify webview
      this.context.postMessage({
        command: 'agentStateChange',
        status: 'running'
      });

      const createSmartRepomixGraph = (await import('../../agent/graph.js')).createSmartRepomixGraph;
      const app = createSmartRepomixGraph(this.databaseService);

      // Check for API key first
      let apiKey = await this.extensionContext.secrets.get('repomix.agent.googleApiKey');
      if (!apiKey) {
        // Fallback to config
        apiKey = vscode.workspace.getConfiguration('repomix.agent').get<string>('googleApiKey');
      }

      if (!apiKey) {
        vscode.window.showErrorMessage("Google API Key missing. Please set it in the 'Smart Agent' tab.");
        return;
      }

      const inputs = {
        apiKey,
        userQuery: previousRun.query,
        workspaceRoot: getCwd(),
        allFilePaths: useSavedFiles ? await getWorkspaceFiles(getCwd()) : [],
        candidateFiles: [],
        confirmedFiles: useSavedFiles ? previousRun.files : [], // Use saved files or empty for fresh scan
        finalCommand: '',
        outputPath: previousRun.outputPath
      };

      const config = { configurable: { thread_id: `rerun_${Date.now()}` } };

      // Skip to appropriate node based on whether we're re-running or re-packing
      if (useSavedFiles) {
        // Skip directly to command generation since we already have the file list
        inputs.allFilePaths = await getWorkspaceFiles(inputs.workspaceRoot);
        const finalState = await app.invoke(inputs, config);
        vscode.window.showInformationMessage(`Re-packed ${finalState.confirmedFiles.length} files from saved list`);
      } else {
        // Full fresh scan
        const finalState = await app.invoke(inputs, config);
        vscode.window.showInformationMessage(`Fresh scan completed. Found ${finalState.confirmedFiles.length} files`);
      }

    } catch (error: any) {
      vscode.window.showErrorMessage(`Re-run failed: ${error.message}`);
    } finally {
      this.context.postMessage({
        command: 'agentStateChange',
        status: 'idle'
      });
    }
  }

  private async copyOutput(runId: string) {
    try {
      const run = await this.databaseService.getAgentRunById(runId);

      // Resolve path before checking existence
      if (!run?.outputPath) {
        vscode.window.showErrorMessage('No output path found for this run');
        return;
      }

      const workspaceRoot = getCwd();
      const fullPath = path.isAbsolute(run.outputPath)
        ? run.outputPath
        : path.resolve(workspaceRoot, run.outputPath);

      await this._copyFile(fullPath);
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to copy output: ${error.message}`);
    }
  }

  private async copyFile(outputPath: string) {
    // Resolve the relative path to the workspace root
    const workspaceRoot = getCwd();
    const fullPath = path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(workspaceRoot, outputPath);

    await this._copyFile(fullPath);
  }

  private async _copyFile(fullPath: string) {
    if (!fs.existsSync(fullPath)) {
      vscode.window.showErrorMessage(`Output file not found: ${fullPath}`);
      return;
    }

    try {
      const originalFilename = path.basename(fullPath);
      const tmpDir = path.join(tempDirManager.getTempDir(), `copy_${Date.now()}`);

      // Ensure subdirectory exists
      await fs.promises.mkdir(tmpDir, { recursive: true });

      const tmpFilePath = path.join(tmpDir, originalFilename);

      await copyToClipboard(fullPath, tmpFilePath);
      vscode.window.showInformationMessage(`Copied "${originalFilename}" to clipboard`);
      await tempDirManager.cleanupFile(tmpFilePath);

    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to copy output: ${e.message}`);
    }
  }
}