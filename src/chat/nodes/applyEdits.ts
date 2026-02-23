/**
 * applyEdits node - Writes approved file edits to workspace.
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import { getWorkspaceRoot, type ProgressCallback } from './utils.js';

export async function applyEditsNode(
  state: typeof ChatState.State,
  onProgress: ProgressCallback
) {
  const workspaceRoot = getWorkspaceRoot();
  if (!workspaceRoot) {
    return {
      workflowPhase: 'code_review' as const,
      aiResponse: 'No workspace folder available to apply edits.',
    };
  }

  const approvedEdits = state.fileEdits.filter((edit) => edit.approved);

  if (approvedEdits.length === 0) {
    return {
      workflowPhase: 'code_review' as const,
      aiResponse: 'No approved edits to apply.',
    };
  }

  onProgress(`Applying ${approvedEdits.length} file changes...`);

  const results: string[] = [];
  const errors: string[] = [];

  for (const edit of approvedEdits) {
    const fullPath = path.resolve(workspaceRoot, edit.filePath);

    // Security check: ensure path is within workspace
    if (!fullPath.startsWith(workspaceRoot + path.sep)) {
      errors.push(`Skipped ${edit.filePath}: path outside workspace`);
      continue;
    }

    try {
      const fileUri = vscode.Uri.file(fullPath);

      switch (edit.action) {
        case 'create': {
          // Ensure directory exists
          const dirPath = path.dirname(fullPath);
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
          // Write file content
          const content = Buffer.from(edit.content, 'utf-8');
          await vscode.workspace.fs.writeFile(fileUri, content);
          results.push(`Created: ${edit.filePath}`);
          break;
        }

        case 'edit': {
          if (edit.searchReplace && edit.searchReplace.length > 0) {
            // Apply search/replace edits
            const doc = await vscode.workspace.openTextDocument(fileUri);
            const workspaceEdit = new vscode.WorkspaceEdit();
            let currentContent = doc.getText();

            for (const sr of edit.searchReplace) {
              const searchIndex = currentContent.indexOf(sr.search);
              if (searchIndex === -1) {
                logger.both.warn(
                  `applyEdits: Search text not found in ${edit.filePath}: "${sr.search.slice(0, 50)}..."`
                );
                continue;
              }
              const startPos = doc.positionAt(searchIndex);
              const endPos = doc.positionAt(searchIndex + sr.search.length);
              workspaceEdit.replace(fileUri, new vscode.Range(startPos, endPos), sr.replace);
              currentContent =
                currentContent.slice(0, searchIndex) +
                sr.replace +
                currentContent.slice(searchIndex + sr.search.length);
            }

            await vscode.workspace.applyEdit(workspaceEdit);
            results.push(`Edited: ${edit.filePath}`);
          } else if (edit.content) {
            // Full file replacement
            const content = Buffer.from(edit.content, 'utf-8');
            await vscode.workspace.fs.writeFile(fileUri, content);
            results.push(`Replaced: ${edit.filePath}`);
          }
          break;
        }

        case 'delete': {
          await vscode.workspace.fs.delete(fileUri);
          results.push(`Deleted: ${edit.filePath}`);
          break;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed ${edit.filePath}: ${message}`);
      logger.both.error(`applyEdits: Failed to apply edit to ${edit.filePath}`, error);
    }
  }

  onProgress(`Applied ${results.length} changes.`);

  const summary = [...results, ...errors.map((e) => `ERROR: ${e}`)].join('\n');

  return {
    workflowPhase: 'code_review' as const,
    aiResponse: summary || 'File edits applied.',
  };
}
