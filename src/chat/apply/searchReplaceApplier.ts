import * as vscode from 'vscode';
import type { FileEdit } from '../state.js';
import type { ApplyResult, SearchReplaceResult } from './types.js';
import { locatePatch, repairIndentation } from '../../core/patching/contentAnalyst.js';

/**
 * Applies SEARCH/REPLACE patches with fuzzy matching support.
 */
export async function applySearchReplace(
  edit: FileEdit,
  workspaceRoot: string,
  fuzzyThreshold: number
): Promise<ApplyResult> {
  try {
    // Resolve full path
    const fullPath = `${workspaceRoot}/${edit.filePath}`;
    const fileUri = vscode.Uri.file(fullPath);

    // Read current file content
    const fileContentBytes = await vscode.workspace.fs.readFile(fileUri);
    const fileContent = Buffer.from(fileContentBytes).toString('utf-8');

    if (!edit.searchReplace || edit.searchReplace.length === 0) {
      return {
        filePath: edit.filePath,
        action: edit.action,
        appliedMode: 'search_replace',
        success: false,
        error: 'No SEARCH/REPLACE blocks provided',
      };
    }

    // Apply each SEARCH/REPLACE block
    const searchReplaceResults: SearchReplaceResult[] = [];
    let updatedContent = fileContent;

    for (const sr of edit.searchReplace) {
      const result = await applySinglePatch(
        fileUri,
        updatedContent,
        sr.search,
        sr.replace,
        fuzzyThreshold
      );

      searchReplaceResults.push(result);

      if (result.success) {
        // Update the content for the next patch
        updatedContent = updatedContent.replace(sr.search, sr.replace);
      }
    }

    // Check if all patches were successful
    const allSuccess = searchReplaceResults.every((r) => r.success);

    if (allSuccess && updatedContent !== fileContent) {
      // Apply all changes at once via WorkspaceEdit
      const workspaceEdit = new vscode.WorkspaceEdit();
      workspaceEdit.replace(
        fileUri,
        new vscode.Range(
          fileUri.with({ scheme: 'untitled' }),
          new vscode.Position(0, 0),
          new vscode.Position(fileContent.split('\n').length, 0)
        ),
        updatedContent
      );

      // Simpler approach: just replace entire document content
      const lines = fileContent.split('\n');
      const editInstance = new vscode.WorkspaceEdit();
      editInstance.replace(
        fileUri,
        new vscode.Range(
          new vscode.Position(0, 0),
          new vscode.Position(lines.length, 0)
        ),
        updatedContent
      );

      await vscode.workspace.applyEdit(editInstance);
    }

    return {
      filePath: edit.filePath,
      action: edit.action,
      appliedMode: 'search_replace',
      success: allSuccess,
      searchReplaceResults,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      filePath: edit.filePath,
      action: edit.action,
      appliedMode: 'search_replace',
      success: false,
      error: message,
    };
  }
}

/**
 * Applies a single SEARCH/REPLACE patch.
 */
async function applySinglePatch(
  fileUri: vscode.Uri,
  fileContent: string,
  searchText: string,
  replaceText: string,
  fuzzyThreshold: number
): Promise<SearchReplaceResult> {
  // Try exact match first
  const exactIndex = fileContent.indexOf(searchText);
  if (exactIndex !== -1) {
    return {
      search: searchText,
      replace: replaceText,
      success: true,
      matchScore: 1.0,
    };
  }

  // Fall back to fuzzy matching
  const match = locatePatch(fileContent, searchText, fuzzyThreshold);

  if (match) {
    return {
      search: searchText,
      replace: replaceText,
      success: true,
      matchScore: match.score,
    };
  }

  // Failed to find match
  return {
    search: searchText,
    replace: replaceText,
    success: false,
    error: `No match found (threshold: ${fuzzyThreshold}). Search text not found in file.`,
  };
}
