/**
 * processBatchResponse node - Parses batch response into file edits.
 */
import { ChatState, type FileEdit } from '../state.js';
import { logger } from '../../shared/logger.js';
import type { ProgressCallback } from './utils.js';

/**
 * Expected response format for code changes.
 */
interface CodeChangeResponse {
  summary: string;
  changes: Array<{
    filePath: string;
    action: 'create' | 'edit' | 'delete';
    description: string;
    content?: string;
    searchReplace?: Array<{ search: string; replace: string }>;
  }>;
}

/**
 * Parses the batch response content into file edits.
 */
function parseBatchResponse(content: string): FileEdit[] {
  if (!content.trim()) {
    return [];
  }

  try {
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.both.warn('processBatchResponse: No JSON found in response');
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]) as CodeChangeResponse;

    if (!parsed.changes || !Array.isArray(parsed.changes)) {
      logger.both.warn('processBatchResponse: No changes array in response');
      return [];
    }

    return parsed.changes.map((change) => ({
      filePath: change.filePath,
      action: change.action,
      content: change.content || '',
      searchReplace: change.searchReplace,
      approved: false, // User must approve each edit
    }));
  } catch (error) {
    logger.both.error('processBatchResponse: Failed to parse response', error);
    return [];
  }
}

export async function processBatchResponseNode(
  state: typeof ChatState.State,
  onProgress: ProgressCallback
) {
  onProgress('Processing batch response...');

  const fileEdits = parseBatchResponse(state.batchResponseContent);

  if (fileEdits.length === 0) {
    return {
      fileEdits: [],
      workflowPhase: 'complete' as const,
      aiResponse: 'No file changes were generated from the batch response.',
    };
  }

  onProgress(`Found ${fileEdits.length} file changes. Awaiting review...`);

  return {
    fileEdits,
    workflowPhase: 'response_review' as const,
  };
}
