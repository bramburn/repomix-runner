import * as vscode from 'vscode';
import { MatchResult } from './types.js';

/**
 * Applies a text replacement to a specific file using WorkspaceEdit.
 * @param uri The target file URI
 * @param match The range and location details found by the Analyst
 * @param newText The text to insert (replacement content)
 * @returns boolean indicating if the edit was successfully applied
 */
export async function applyPatch(
  uri: vscode.Uri,
  match: MatchResult,
  newText: string
): Promise<boolean> {
  const edit = new vscode.WorkspaceEdit();

  // Create the range to replace.
  // match.startLine is 0-based.
  // match.endLine is inclusive, so we want to replace up to the end of that line.
  // We need to get the actual line length to ensure we replace the full line content including newline characters if needed.
  // However, WorkspaceEdit replace ranges usually work best with Position(line, 0) to Position(endLine + 1, 0) 
  // to replace entire lines cleanly.
  
  // Strategy: Replace from start of startLine to start of (endLine + 1)
  const startPos = new vscode.Position(match.startLine, 0);
  const endPos = new vscode.Position(match.endLine + 1, 0);
  const range = new vscode.Range(startPos, endPos);

  // Ensure the new text ends with a newline if we are replacing full lines, 
  // to maintain structure, unless it's a single line partial replacement (not supported by this block logic yet).
  let finalNewText = newText;
  if (!finalNewText.endsWith('\n')) {
    finalNewText += '\n';
  }

  edit.replace(uri, range, finalNewText);

  // Apply the edit
  // workspace.applyEdit returns a Thenable<boolean>
  return await vscode.workspace.applyEdit(edit);
}

/**
 * Applies a SEARCH/REPLACE patch to a document with fuzzy matching support.
 * @param uri The target file URI
 * @param searchText The text to search for
 * @param replaceText The text to replace with
 * @param fuzzyThreshold Similarity threshold for fuzzy matching (0-1, default 0.85)
 * @returns boolean indicating if the patch was successfully applied
 */
export async function applySearchReplaceToDocument(
  uri: vscode.Uri,
  searchText: string,
  replaceText: string,
  fuzzyThreshold: number = 0.85
): Promise<boolean> {
  try {
    // Read the document
    const doc = await vscode.workspace.openTextDocument(uri);
    const fileContent = doc.getText();

    // Try exact match first
    const exactIndex = fileContent.indexOf(searchText);
    if (exactIndex !== -1) {
      // Exact match found - apply directly
      const startPos = doc.positionAt(exactIndex);
      const endPos = doc.positionAt(exactIndex + searchText.length);
      const range = new vscode.Range(startPos, endPos);

      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, range, replaceText);
      return await vscode.workspace.applyEdit(edit);
    }

    // Fall back to fuzzy matching
    const { locatePatch } = await import('./contentAnalyst.js');
    const match = await locatePatch(fileContent, searchText, fuzzyThreshold);

    if (match) {
      // Fuzzy match found - apply with indentation repair
      const { repairIndentation } = await import('./contentAnalyst.js');
      const indentedReplace = repairIndentation(replaceText, match.indentation);

      const edit = new vscode.WorkspaceEdit();
      const startPos = new vscode.Position(match.startLine, 0);
      const endPos = new vscode.Position(match.endLine + 1, 0);
      const range = new vscode.Range(startPos, endPos);

      let finalNewText = indentedReplace;
      if (!finalNewText.endsWith('\n')) {
        finalNewText += '\n';
      }

      edit.replace(uri, range, finalNewText);
      return await vscode.workspace.applyEdit(edit);
    }

    // No match found
    return false;
  } catch (error) {
    console.error('applySearchReplaceToDocument: Error applying patch:', error);
    return false;
  }
}