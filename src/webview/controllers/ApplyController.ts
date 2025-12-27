import * as vscode from 'vscode';
import { BaseController } from './BaseController.js';
import { parsePatches } from '../../core/patching/patchParser.js';
import { resolveFile } from '../../core/patching/fileResolver.js';
import { locatePatch, repairIndentation } from '../../core/patching/contentAnalyst.js';
import { applyPatch } from '../../core/patching/codePatcher.js';

interface PatchResult {
  file: string;
  status: 'success' | 'error';
  message?: string;
  errorContext?: string;
}

export class ApplyController extends BaseController {
  constructor(
    context: any,
    private readonly extensionContext: vscode.ExtensionContext
  ) {
    super(context);
  }

  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      case 'applyPatches':
        await this.handleApplyPatches(message.text);
        return true;
      default:
        return false;
    }
  }

  private async handleApplyPatches(text: string) {
    const patches = parsePatches(text);
    const results: PatchResult[] = [];
    
    if (patches.length === 0) {
      this.context.postMessage({
        command: 'applyResult',
        success: false,
        error: 'No valid <apply_diff> blocks found in the provided text.'
      });
      return;
    }

    // Get API Key for AI file resolution fallback
    const apiKey = await this.extensionContext.secrets.get('repomix.agent.googleApiKey');

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Applying Patches",
      cancellable: true
    }, async (progress, token) => {
      
      const total = patches.length;
      let processed = 0;

      for (const patch of patches) {
        if (token.isCancellationRequested) break;
        
        const shortName = patch.filePath.split('/').pop() || patch.filePath;
        progress.report({ message: `Patching ${shortName}...`, increment: (1 / total) * 100 });

        try {
          // 1. Resolve File
          const fileResolution = await resolveFile(patch.filePath, patch.searchContent, apiKey);
          
          if (!fileResolution) {
            results.push({
              file: patch.filePath,
              status: 'error',
              message: 'File not found in workspace',
              errorContext: this.generateErrorPrompt(patch, "File not found")
            });
            continue;
          }

          // 2. Read Content
          const document = await vscode.workspace.openTextDocument(fileResolution.uri);
          const fileContent = document.getText();

          // 3. Analyze & Locate
          const match = locatePatch(fileContent, patch.searchContent);
          
          if (!match) {
            results.push({
              file: patch.filePath,
              status: 'error',
              message: 'Could not find matching code block',
              errorContext: this.generateErrorPrompt(patch, "Search block not found in file")
            });
            continue;
          }

          // 4. Repair Indentation
          const finalReplaceText = repairIndentation(patch.replaceContent, match.indentation);

          // 5. Apply Patch
          const success = await applyPatch(fileResolution.uri, match, finalReplaceText);

          if (success) {
            results.push({ file: patch.filePath, status: 'success' });
          } else {
            results.push({
              file: patch.filePath,
              status: 'error',
              message: 'VS Code failed to apply edit',
              errorContext: this.generateErrorPrompt(patch, "Workspace edit failed")
            });
          }

        } catch (e: any) {
          results.push({
            file: patch.filePath,
            status: 'error',
            message: e.message || 'Unknown error',
            errorContext: this.generateErrorPrompt(patch, `Exception: ${e.message}`)
          });
        }
        
        processed++;
      }
    });

    // Send results back to UI
    this.context.postMessage({
      command: 'applyResult',
      success: true,
      results
    });
  }

  /**
   * Generates a pre-formatted prompt the user can copy back to the LLM to fix the error.
   */
  private generateErrorPrompt(patch: any, reason: string): string {
    return `
I tried to apply your patch for file: "${patch.filePath}" but failed.
Reason: ${reason}

The search block I couldn't process was:
\`\`\`
${patch.searchContent}
\`\`\`

Please provide a corrected <apply_diff> block, ensuring the SEARCH block exactly matches the existing code.
`.trim();
  }
}