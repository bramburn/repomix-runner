import * as vscode from 'vscode';
import * as path from 'path';
import type { ApplyConfig } from './types.js';

/**
 * Determines which edit mode to use based on settings and file characteristics.
 */
export async function selectMode(
  filePath: string,
  action: 'create' | 'edit' | 'delete',
  config: ApplyConfig,
  workspaceRoot: string
): Promise<'full' | 'search_replace'> {
  // If mode is explicitly set, use it
  if (config.editMode === 'full') {
    return 'full';
  }

  if (config.editMode === 'search_replace') {
    return 'search_replace';
  }

  // Hybrid mode: auto-select based on action and file size
  if (action === 'create' || action === 'delete') {
    return 'full';
  }

  // For 'edit' action, check file existence and size
  const fullPath = path.resolve(workspaceRoot, filePath);
  const fileUri = vscode.Uri.file(fullPath);

  try {
    // Check if file exists
    await vscode.workspace.fs.stat(fileUri);

    // File exists - count lines to determine mode
    const content = await vscode.workspace.fs.readFile(fileUri);
    const text = Buffer.from(content).toString('utf-8');
    const lineCount = text.split('\n').length;

    if (lineCount >= config.hybridThresholdLines) {
      return 'search_replace';
    }

    return 'full';
  } catch (error) {
    // File doesn't exist or can't be read - use full mode
    return 'full';
  }
}
