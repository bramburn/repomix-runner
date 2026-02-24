import * as vscode from 'vscode';
import * as path from 'path';
import type { FileEdit } from '../state.js';
import type { ApplyResult, SearchReplaceResult } from './types.js';
import { locatePatch, repairIndentation } from '../../core/patching/contentAnalyst.js';

/**
 * Extended result from single patch application that includes match details.
 */
interface SinglePatchResult extends SearchReplaceResult {
  /** The line index where the match starts (0-based) */
  matchStartLine?: number;
  /** The line index where the match ends (0-based, inclusive) */
  matchEndLine?: number;
  /** Indentation-repaired replacement text (only for fuzzy matches) */
  repairedReplaceText?: string;
}

/**
 * Applies SEARCH/REPLACE patches with fuzzy matching support.
 */
export async function applySearchReplace(
  edit: FileEdit,
  workspaceRoot: string,
  fuzzyThreshold: number
): Promise<ApplyResult> {
  try {
    // Resolve full path using path.resolve for cross-platform compatibility (H1 fix)
    const fullPath = path.resolve(workspaceRoot, edit.filePath);
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

    // Apply each SEARCH/REPLACE block sequentially
    const searchReplaceResults: SearchReplaceResult[] = [];
    let updatedContent = fileContent;

    for (const sr of edit.searchReplace) {
      const result = await applySinglePatch(
        updatedContent,
        sr.search,
        sr.replace,
        fuzzyThreshold
      );

      searchReplaceResults.push(result);

      if (result.success) {
        if (result.matchScore === 1.0) {
          // Exact match — simple string replacement (first occurrence)
          updatedContent = updatedContent.replace(sr.search, sr.replace);
        } else if (
          result.matchStartLine !== undefined &&
          result.matchEndLine !== undefined
        ) {
          // Fuzzy match — line-based replacement using matched range (C1 fix)
          const lines = updatedContent.split('\n');
          const before = lines.slice(0, result.matchStartLine);
          const after = lines.slice(result.matchEndLine + 1);
          const replaceText = result.repairedReplaceText || sr.replace;
          const replaceLines = replaceText.split('\n');
          updatedContent = [...before, ...replaceLines, ...after].join('\n');
        }
      }
    }

    // Check results
    const allSuccess = searchReplaceResults.every((r) => r.success);
    const anySuccess = searchReplaceResults.some((r) => r.success);

    // Write updated content if anything changed
    if (anySuccess && updatedContent !== fileContent) {
      const content = Buffer.from(updatedContent, 'utf-8');
      await vscode.workspace.fs.writeFile(fileUri, content);
    }

    return {
      filePath: edit.filePath,
      action: edit.action,
      appliedMode: 'search_replace',
      success: allSuccess,
      error: allSuccess
        ? undefined
        : 'Some SEARCH/REPLACE blocks failed to apply',
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
 * Applies a single SEARCH/REPLACE patch, returning detailed match info.
 */
async function applySinglePatch(
  fileContent: string,
  searchText: string,
  replaceText: string,
  fuzzyThreshold: number
): Promise<SinglePatchResult> {
  // Try exact match first
  const exactIndex = fileContent.indexOf(searchText);
  if (exactIndex !== -1) {
    // Calculate line positions for the exact match
    const beforeMatch = fileContent.substring(0, exactIndex);
    const startLine = beforeMatch.split('\n').length - 1;
    const matchLineCount = searchText.split('\n').length;
    const endLine = startLine + matchLineCount - 1;

    return {
      search: searchText,
      replace: replaceText,
      success: true,
      matchScore: 1.0,
      matchStartLine: startLine,
      matchEndLine: endLine,
      repairedReplaceText: replaceText,
    };
  }

  // Fall back to fuzzy matching
  const match = await locatePatch(fileContent, searchText, fuzzyThreshold);

  if (match) {
    // Repair indentation for the replacement text (M3 fix)
    const repairedReplaceText = repairIndentation(replaceText, match.indentation);

    return {
      search: searchText,
      replace: replaceText,
      success: true,
      matchScore: match.score,
      matchStartLine: match.startLine,
      matchEndLine: match.endLine,
      repairedReplaceText,
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
