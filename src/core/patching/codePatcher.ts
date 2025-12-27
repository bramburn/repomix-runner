import * as vscode from 'vscode';
import { MatchResult } from './types.js';

/**
 * Applies a text replacement to a specific file using WorkspaceEdit.
 * * @param uri The target file URI
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