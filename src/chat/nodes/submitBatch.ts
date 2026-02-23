/**
 * submitBatch node - Submits package payload to Anthropic batch API.
 */
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import type { ProgressCallback } from './utils.js';
import type { BatchManager } from '../batch/batchManager.js';

let batchManager: BatchManager | null = null;

export function setSubmitBatchManager(manager: BatchManager) {
  batchManager = manager;
}

export async function submitBatchNode(
  state: typeof ChatState.State,
  onProgress: ProgressCallback
) {
  onProgress('Submitting batch job...');

  if (!state.packagePayload) {
    logger.both.warn('submitBatch: No package payload to submit.');
    return {
      batchJobId: null,
      workflowPhase: 'complete' as const,
      aiResponse: 'No package was prepared to submit.',
    };
  }

  if (!batchManager) {
    logger.both.warn('submitBatch: Batch manager not initialized.');
    return {
      batchJobId: null,
      workflowPhase: 'complete' as const,
      aiResponse: 'Batch manager is not available.',
    };
  }

  try {
    const result = state.batchJobId
      ? await batchManager.submitExistingPackage(state.batchJobId)
      : await batchManager.submitPackage(state.threadId, state.packagePayload);
    onProgress(`Batch job submitted: ${result.batchJobId.slice(0, 8)}...`);

    return {
      batchJobId: result.batchJobId,
      workflowPhase: 'batch_pending' as const,
    };
  } catch (error) {
    logger.both.error('submitBatch: Failed to submit batch', error);
    return {
      batchJobId: null,
      workflowPhase: 'complete' as const,
      aiResponse: `Failed to submit batch: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
