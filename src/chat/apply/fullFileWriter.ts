import * as vscode from 'vscode';
import * as path from 'path';
import type { FileEdit } from '../state.js';
import type { ApplyResult } from './types.js';

/**
 * Handles full file writes (create new files, overwrite existing files).
 */
export async function writeFullFile(
  edit: FileEdit,
  workspaceRoot: string
): Promise<ApplyResult> {
  try {
    // Resolve full path from relative filePath
    const fullPath = path.resolve(workspaceRoot, edit.filePath);

    // Security check: ensure path is within workspace root
    if (!fullPath.startsWith(workspaceRoot + path.sep)) {
      return {
        filePath: edit.filePath,
        action: edit.action,
        appliedMode: 'full',
        success: false,
        error: 'Path outside workspace directory',
      };
    }

    const fileUri = vscode.Uri.file(fullPath);

    switch (edit.action) {
      case 'create': {
        // Ensure parent directories exist
        const dirPath = path.dirname(fullPath);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));

        // Write file content
        const content = Buffer.from(edit.content, 'utf-8');
        await vscode.workspace.fs.writeFile(fileUri, content);

        return {
          filePath: edit.filePath,
          action: 'create',
          appliedMode: 'full',
          success: true,
        };
      }

      case 'edit': {
        // Overwrite existing file content
        const content = Buffer.from(edit.content, 'utf-8');
        await vscode.workspace.fs.writeFile(fileUri, content);

        return {
          filePath: edit.filePath,
          action: 'edit',
          appliedMode: 'full',
          success: true,
        };
      }

      case 'delete': {
        // Delete the file
        await vscode.workspace.fs.delete(fileUri);

        return {
          filePath: edit.filePath,
          action: 'delete',
          appliedMode: 'full',
          success: true,
        };
      }

      default:
        return {
          filePath: edit.filePath,
          action: edit.action,
          appliedMode: 'full',
          success: false,
          error: `Unknown action: ${(edit.action as any)}`,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      filePath: edit.filePath,
      action: edit.action,
      appliedMode: 'full',
      success: false,
      error: message,
    };
  }
}
