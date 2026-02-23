/**
 * processBatchResponse node - Parses batch response into file edits.
 */
import { ChatState, type FileEdit } from '../state.js';
import type { ProgressCallback } from './utils.js';
import { parseBatchResponse } from '../batch/responseParser.js';

function createRawResponseFallbackEdit(batchJobId: string | null, content: string): FileEdit {
  const safeJobId = batchJobId ?? 'unknown-batch';
  return {
    filePath: `.repomix/incoming/${safeJobId}/manual-review-response.md`,
    action: 'create',
    content: `# Manual Review Required\n\nThe batch response could not be parsed into structured edits.\n\n## Raw Response\n\n\`\`\`\n${content}\n\`\`\`\n`,
    approved: false,
  };
}

export async function processBatchResponseNode(
  state: typeof ChatState.State,
  onProgress: ProgressCallback
) {
  onProgress('Processing batch response...');

  const parsed = parseBatchResponse(state.batchResponseContent);
  let fileEdits = parsed.fileEdits;

  if (fileEdits.length === 0 && state.batchResponseContent.trim()) {
    // Surface raw output through manual review as requested.
    fileEdits = [createRawResponseFallbackEdit(state.batchJobId, state.batchResponseContent)];
  }

  if (fileEdits.length === 0) {
    return {
      fileEdits: [],
      workflowPhase: 'complete' as const,
      aiResponse: 'No file changes were generated from the batch response.',
    };
  }

  const warningSummary = parsed.parseWarnings.length
    ? ` Parse warnings: ${parsed.parseWarnings.join(' | ')}`
    : '';

  onProgress(`Found ${fileEdits.length} file changes. Awaiting review...${warningSummary}`);

  return {
    fileEdits,
    workflowPhase: 'response_review' as const,
  };
}
