/**
 * humanReviewEdits node - INTERRUPT: User reviews and approves file edits.
 */
import { interrupt } from '@langchain/langgraph';
import { ChatState, type FileEdit } from '../state.js';
import type { ProgressCallback } from './utils.js';

/**
 * Interrupt payload for edit review.
 */
export interface EditReviewInterrupt {
  type: 'edit_review';
  edits: Array<{
    filePath: string;
    action: 'create' | 'edit' | 'delete';
    preview: string;
    lineCount: number;
  }>;
}

/**
 * Resume value from user after edit review.
 */
export interface EditReviewResume {
  approvedEdits: string[]; // File paths that were approved
}

export async function humanReviewEditsNode(
  state: typeof ChatState.State,
  _onProgress: ProgressCallback
) {
  if (state.fileEdits.length === 0) {
    return {
      workflowPhase: 'complete' as const,
      aiResponse: 'No file edits to review.',
    };
  }

  const interruptPayload: EditReviewInterrupt = {
    type: 'edit_review',
    edits: state.fileEdits.map((edit) => ({
      filePath: edit.filePath,
      action: edit.action,
      preview: edit.content.split('\n').slice(0, 20).join('\n'), // First 20 lines
      lineCount: edit.content.split('\n').length,
    })),
  };

  const resumeValue = interrupt(interruptPayload) as EditReviewResume;

  // Mark approved edits
  const updatedEdits: FileEdit[] = state.fileEdits.map((edit) => ({
    ...edit,
    approved: resumeValue.approvedEdits.includes(edit.filePath),
  }));

  const approvedCount = updatedEdits.filter((e) => e.approved).length;

  if (approvedCount === 0) {
    return {
      fileEdits: updatedEdits,
      workflowPhase: 'complete' as const,
      aiResponse: 'No edits were approved. Workflow complete.',
    };
  }

  return {
    fileEdits: updatedEdits,
    workflowPhase: 'applying' as const,
  };
}
