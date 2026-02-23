/**
 * humanReviewCode node - INTERRUPT: Optional code review cycle.
 */
import { interrupt } from '@langchain/langgraph';
import { ChatState } from '../state.js';
import type { ProgressCallback } from './utils.js';

/**
 * Interrupt payload for code review.
 */
export interface CodeReviewInterrupt {
  type: 'code_review';
  appliedFiles: string[];
}

/**
 * Resume value from user after code review.
 */
export interface CodeReviewResume {
  requestReviewCycle: boolean;
}

export async function humanReviewCodeNode(
  state: typeof ChatState.State,
  _onProgress: ProgressCallback
) {
  const appliedFiles = state.fileEdits.filter((e) => e.approved).map((e) => e.filePath);

  if (appliedFiles.length === 0) {
    return {
      requestReviewCycle: false,
      workflowPhase: 'complete' as const,
    };
  }

  const interruptPayload: CodeReviewInterrupt = {
    type: 'code_review',
    appliedFiles,
  };

  const resumeValue = interrupt(interruptPayload) as CodeReviewResume;

  if (resumeValue.requestReviewCycle) {
    // User wants another review cycle - loop back to packagePrompt
    return {
      requestReviewCycle: true,
      workflowPhase: 'packaging' as const,
      // Reset file edits for next cycle
      fileEdits: [],
      batchJobId: null,
      batchResponseContent: '',
    };
  }

  return {
    requestReviewCycle: false,
    workflowPhase: 'complete' as const,
  };
}
