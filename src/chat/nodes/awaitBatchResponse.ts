/**
 * awaitBatchResponse node - INTERRUPT: Waits for batch completion.
 * The poller resumes this when the batch reaches a terminal state.
 */
import { interrupt } from '@langchain/langgraph';
import { ChatState } from '../state.js';
import type { ProgressCallback } from './utils.js';

export interface BatchPendingInterrupt {
  type: 'batch_pending';
  batchJobId: string;
  estimatedCompletionTime: string;
}

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

  const resumeValue = interrupt({
    type: 'batch_pending',
    batchJobId: state.batchJobId,
    estimatedCompletionTime: 'Batch processing in progress (resume on open enabled).',
  } as BatchPendingInterrupt) as BatchPendingResume;

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
