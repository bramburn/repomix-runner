import * as vscode from 'vscode';
import type { FileEdit } from '../state.js';
import type { ApplyConfig, ApplySummary, ApplyResult } from './types.js';
import { selectMode } from './editModeSelector.js';
import { writeFullFile } from './fullFileWriter.js';
import { applySearchReplace } from './searchReplaceApplier.js';
import { logger } from '../../shared/logger.js';

/**
 * Main orchestrator that coordinates all edit application logic.
 */
export async function applyEdits(
  edits: FileEdit[],
  config: ApplyConfig,
  workspaceRoot: string,
  onProgress?: (message: string) => void
): Promise<ApplySummary> {
  const results: ApplyResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  const reportProgress = (message: string) => {
    if (onProgress) {
      onProgress(message);
    }
    logger.both.info(`applyEdits: ${message}`);
  };

  reportProgress(`Applying ${edits.length} file changes...`);

  for (const edit of edits) {
    try {
      // Determine which mode to use
      const mode = await selectMode(edit.filePath, edit.action, config, workspaceRoot);

      reportProgress(`Applying ${edit.action} to ${edit.filePath} using ${mode} mode`);

      let result: ApplyResult;

      if (mode === 'full') {
        result = await writeFullFile(edit, workspaceRoot);
      } else {
        // search_replace mode
        if (!edit.searchReplace || edit.searchReplace.length === 0) {
          // No SEARCH/REPLACE blocks, fall back to full write
          result = await writeFullFile(edit, workspaceRoot);
          result.appliedMode = 'full';
        } else {
          result = await applySearchReplace(edit, workspaceRoot, config.fuzzyMatchThreshold);
        }
      }

      results.push(result);

      if (result.success) {
        succeeded++;
      } else {
        failed++;
        logger.both.error(`Failed to apply ${edit.action} to ${edit.filePath}: ${result.error}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed++;
      logger.both.error(`Unexpected error applying ${edit.action} to ${edit.filePath}:`, error);

      results.push({
        filePath: edit.filePath,
        action: edit.action,
        appliedMode: 'full',
        success: false,
        error: message,
      });
    }
  }

  // Open Source Control tab so user can review changes
  if (succeeded > 0) {
    reportProgress(`Applied ${succeeded} changes successfully.`);
    await vscode.commands.executeCommand('workbench.view.scm');
  } else {
    reportProgress('No changes were applied successfully.');
  }

  return {
    total: edits.length,
    succeeded,
    failed,
    skipped,
    results,
  };
}
