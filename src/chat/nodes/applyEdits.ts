/**
 * applyEdits node - Writes approved file edits to workspace.
 */
import * as vscode from 'vscode';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import { getWorkspaceRoot, type ProgressCallback } from './utils.js';
import { applyEdits } from '../apply/fileEditApplier.js';
import type { ApplyConfig } from '../apply/types.js';

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

  // Get configuration from VS Code settings
  const config: ApplyConfig = {
    editMode: vscode.workspace.getConfiguration('repomix.chat').get<'full' | 'search_replace' | 'hybrid'>('editMode', 'hybrid'),
    hybridThresholdLines: vscode.workspace.getConfiguration('repomix.chat').get<number>('hybridThresholdLines', 300),
    fuzzyMatchThreshold: vscode.workspace.getConfiguration('repomix.chat').get<number>('fuzzyMatchThreshold', 0.85),
  };

  // Apply edits using the new applier
  const summary = await applyEdits(approvedEdits, config, workspaceRoot, onProgress);

  // Format summary for response
  const successMessages = summary.results
    .filter((r) => r.success)
    .map((r) => `${r.action === 'create' ? 'Created' : r.action === 'edit' ? 'Edited' : 'Deleted'}: ${r.filePath}`);

  const errorMessages = summary.results
    .filter((r) => !r.success)
    .map((r) => `ERROR - ${r.filePath}: ${r.error}`);

  const summaryText = [...successMessages, ...errorMessages].join('\n');

  return {
    workflowPhase: 'code_review' as const,
    aiResponse: summaryText || 'File edits applied successfully.',
  };
}
