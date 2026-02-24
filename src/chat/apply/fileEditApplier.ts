import * as vscode from 'vscode';
import * as path from 'path';
import type { FileEdit } from '../state.js';
import type { ApplyConfig, ApplySummary, ApplyResult } from './types.js';
import { selectMode } from './editModeSelector.js';
import { writeFullFile } from './fullFileWriter.js';
import { applySearchReplace } from './searchReplaceApplier.js';
import { resolveFile } from '../../core/patching/fileResolver.js';
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
      // Step 2a: Resolve file path for existing files (C2 fix)
      let resolvedFilePath = edit.filePath;
      if (edit.action === 'edit' || edit.action === 'delete') {
        try {
          const resolved = await resolveFile(edit.filePath, edit.content || '');
          if (resolved) {
            const resolvedRelative = path.relative(workspaceRoot, resolved.uri.fsPath);
            if (resolvedRelative !== edit.filePath) {
              reportProgress(
                `Resolved ${edit.filePath} → ${resolvedRelative} (${resolved.method})`
              );
              resolvedFilePath = resolvedRelative;
            }
          }
        } catch (resolveError) {
          // If resolution fails, continue with original path
          logger.both.warn(
            `File resolution failed for ${edit.filePath}, using original path:`,
            resolveError
          );
        }
      }

      // Create a working copy with the resolved path
      const resolvedEdit = { ...edit, filePath: resolvedFilePath };

      // Determine which mode to use
      const mode = await selectMode(
        resolvedEdit.filePath,
        resolvedEdit.action,
        config,
        workspaceRoot
      );

      reportProgress(
        `Applying ${resolvedEdit.action} to ${resolvedEdit.filePath} using ${mode} mode`
      );

      let result: ApplyResult;

      if (mode === 'full') {
        result = await writeFullFile(resolvedEdit, workspaceRoot);
      } else {
        // search_replace mode
        if (!resolvedEdit.searchReplace || resolvedEdit.searchReplace.length === 0) {
          // No SEARCH/REPLACE blocks, fall back to full write
          result = await writeFullFile(resolvedEdit, workspaceRoot);
          result.appliedMode = 'full';
        } else {
          result = await applySearchReplace(
            resolvedEdit,
            workspaceRoot,
            config.fuzzyMatchThreshold
          );
        }
      }

      results.push(result);

      if (result.success) {
        succeeded++;
      } else {
        failed++;
        logger.both.error(
          `Failed to apply ${resolvedEdit.action} to ${resolvedEdit.filePath}: ${result.error}`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed++;
      logger.both.error(
        `Unexpected error applying ${edit.action} to ${edit.filePath}:`,
        error
      );

      results.push({
        filePath: edit.filePath,
        action: edit.action,
        appliedMode: 'full',
        success: false,
        error: message,
      });
    }
  }

  // M1 fix: Show VS Code notification with summary
  const notificationMessage = `File Edits: ${succeeded} applied, ${failed} failed, ${skipped} skipped`;
  if (failed > 0 && succeeded > 0) {
    vscode.window.showWarningMessage(notificationMessage);
  } else if (failed > 0 && succeeded === 0) {
    vscode.window.showErrorMessage(notificationMessage);
  } else if (succeeded > 0) {
    vscode.window.showInformationMessage(notificationMessage);
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
