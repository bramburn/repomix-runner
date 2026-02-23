/**
 * submitBatch node - Creates batch job record (stubbed API).
 * Full Anthropic Batch API integration will be in PRD 005.
 */
import type { Pool } from 'pg';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import { BatchRepository } from '../db/batchRepository.js';
import type { ProgressCallback } from './utils.js';

// Global pool reference - will be set by the graph factory
let pgPool: Pool | null = null;

export function setSubmitBatchPool(pool: Pool) {
  pgPool = pool;
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

  if (!pgPool) {
    logger.both.warn('submitBatch: No database pool available.');
    return {
      batchJobId: null,
      workflowPhase: 'complete' as const,
      aiResponse: 'Database not available for batch submission.',
    };
  }

  try {
    const batchRepo = new BatchRepository(pgPool);

    // Create the batch job record
    const batchJobId = await batchRepo.createBatchJob({
      threadId: state.threadId,
      packageType: state.packagePayload.outputInstruction,
      promptPayload: state.packagePayload,
      metadata: {
        createdBy: 'hitl_workflow',
        goalPreview: state.goalText.slice(0, 200),
      },
    });

    // Mark as pending (in real implementation, this would call Anthropic API)
    await batchRepo.updateBatchJob(batchJobId, {
      status: 'pending',
    });

    onProgress(`Batch job created: ${batchJobId.slice(0, 8)}...`);

    return {
      batchJobId,
      workflowPhase: 'batch_pending' as const,
    };
  } catch (error) {
    logger.both.error('submitBatch: Failed to create batch job', error);
    return {
      batchJobId: null,
      workflowPhase: 'complete' as const,
      aiResponse: `Failed to submit batch: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
