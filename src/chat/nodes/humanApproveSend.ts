/**
 * humanApproveSend node - INTERRUPT: User approves sending to batch.
 */
import { interrupt } from '@langchain/langgraph';
import { ChatState, type PackagePayload } from '../state.js';
import type { ProgressCallback } from './utils.js';

/**
 * Interrupt payload for send approval.
 */
export interface SendReviewInterrupt {
  type: 'send_review';
  packageId?: string;
  package: PackagePayload;
  estimatedTokens: number;
}

/**
 * Resume value from user after send review.
 */
export interface SendReviewResume {
  approved: boolean;
  packageId?: string;
}

/**
 * Estimates token count for a package payload.
 */
function estimateTokens(pkg: PackagePayload): number {
  // Rough estimation: ~4 chars per token
  const goalTokens = Math.ceil(pkg.goal.length / 4);
  const contextTokens = pkg.contextFiles.reduce(
    (sum, file) => sum + Math.ceil(file.content.length / 4),
    0
  );
  const archTokens = Math.ceil(pkg.repoArchitecture.length / 4);

  return goalTokens + contextTokens + archTokens + 500; // 500 for overhead
}

export async function humanApproveSendNode(
  state: typeof ChatState.State,
  _onProgress: ProgressCallback
) {
  if (!state.packagePayload) {
    // No package to send, skip to end
    return {
      workflowPhase: 'complete' as const,
      aiResponse: 'No package was prepared to send.',
    };
  }

  const interruptPayload: SendReviewInterrupt = {
    type: 'send_review',
    package: state.packagePayload,
    estimatedTokens: estimateTokens(state.packagePayload),
  };

  const resumeValue = interrupt(interruptPayload) as SendReviewResume;

  if (!resumeValue.approved) {
    // User declined to send
    return {
      workflowPhase: 'complete' as const,
      aiResponse: 'Package was not sent. You can modify the goal and try again.',
    };
  }

  // User approved, continue to batch submission
  return {
    workflowPhase: 'batch_pending' as const,
    batchJobId: resumeValue.packageId ?? null,
  };
}
