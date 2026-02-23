/**
 * awaitBatchResponse node - INTERRUPT: Waits for batch completion.
 * The external poller (PRD 005) will resume this when the batch completes.
 */
import { interrupt } from '@langchain/langgraph';
import { ChatState } from '../state.js';
import type { ProgressCallback } from './utils.js';

/**
 * Interrupt payload for batch pending state.
 */
export interface BatchPendingInterrupt {
  type: 'batch_pending';
  batchJobId: string;
  estimatedCompletionTime: string;
}

/**
 * Resume value when batch completes.
 */
export interface BatchPendingResume {
  completed: boolean;
  responseContent?: string;
  error?: string;
}

export async function awaitBatchResponseNode(
  state: typeof ChatState.State,
  _onProgress: ProgressCallback
) {
  if (!state.batchJobId) {
    return {
      workflowPhase: 'complete' as const,
      aiResponse: 'No batch job to await.',
    };
  }

  const interruptPayload: BatchPendingInterrupt = {
    type: 'batch_pending',
    batchJobId: state.batchJobId,
    estimatedCompletionTime: '~10 minutes (stubbed)',
  };

  // This pauses until the external poller (or manual trigger) resumes
  const resumeValue = interrupt(interruptPayload) as BatchPendingResume;

  if (!resumeValue.completed) {
    return {
      workflowPhase: 'complete' as const,
      aiResponse: resumeValue.error || 'Batch processing failed or was cancelled.',
    };
  }

  return {
    batchResponseContent: resumeValue.responseContent || '',
    workflowPhase: 'response_review' as const,
  };
}
