/**
 * humanReviewGoal node - INTERRUPT: Pauses for user to review/edit goal.
 */
import { interrupt } from '@langchain/langgraph';
import { ChatState } from '../state.js';
import type { ProgressCallback } from './utils.js';

/**
 * Interrupt payload for goal review.
 */
export interface GoalReviewInterrupt {
  type: 'goal_review';
  goal: string;
  contextFiles: string[];
  dependencies: Record<string, string>;
}

/**
 * Resume value from user after goal review.
 */
export interface GoalReviewResume {
  goalText: string;
  contextFiles: string[];
}

export async function humanReviewGoalNode(
  state: typeof ChatState.State,
  _onProgress: ProgressCallback
) {
  // Prepare the interrupt payload
  const interruptPayload: GoalReviewInterrupt = {
    type: 'goal_review',
    goal: state.goalText,
    contextFiles: state.retrievedContext.map((c) => c.filePath),
    dependencies: state.dependencies,
  };

  // This will pause the graph and return control to the caller
  // The caller (ChatController) will display a UI card for the user
  // When the user approves/edits, they'll resume with GoalReviewResume
  const resumeValue = interrupt(interruptPayload) as GoalReviewResume;

  // After resume, update state with user's changes
  return {
    goalText: resumeValue.goalText,
    // Filter retrieved context to only include user-selected files
    retrievedContext: state.retrievedContext.filter((c) =>
      resumeValue.contextFiles.includes(c.filePath)
    ),
    workflowPhase: 'packaging' as const,
  };
}
