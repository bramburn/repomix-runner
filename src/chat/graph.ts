import { StateGraph } from '@langchain/langgraph';
import type { Pool } from 'pg';
import type { ExtensionContext } from 'vscode';
import { ChatState } from './state.js';
import { createCheckpointer } from './checkpointer.js';
import {
  gatherContextNode,
  prepareGoalNode,
  humanReviewGoalNode,
  packagePromptNode,
  humanApproveSendNode,
  submitBatchNode,
  setSubmitBatchPool,
  awaitBatchResponseNode,
  processBatchResponseNode,
  humanReviewEditsNode,
  applyEditsNode,
  humanReviewCodeNode,
  generateSummaryNode,
  type ProgressCallback,
} from './nodes/index.js';

export type { ProgressCallback };

/**
 * Creates and compiles the HITL chat graph.
 *
 * Graph Flow:
 * START
 *   ↓
 * gatherContext ← vector search + architecture loading
 *   ↓
 * prepareGoal ← Gemini synthesizes goal
 *   ↓
 * [INTERRUPT 1] humanReviewGoal ← user edits goal/context
 *   ↓
 * packagePrompt ← assemble final prompt
 *   ↓
 * [INTERRUPT 2] humanApproveSend ← user approves sending
 *   ↓
 * submitBatch ← creates batch job record
 *   ↓
 * [INTERRUPT 3] awaitBatchResponse ← waits for completion
 *   ↓
 * processBatchResponse ← parses response into edits
 *   ↓
 * [INTERRUPT 4] humanReviewEdits ← user approves edits
 *   ↓
 * applyEdits ← writes files to workspace
 *   ↓
 * [INTERRUPT 5] humanReviewCode ← user requests review cycle?
 *   ↓ (if requestReviewCycle → loop to packagePrompt)
 * generateSummary
 *   ↓
 * END
 */
export async function createHitlChatGraph(
  extensionContext: ExtensionContext,
  pgPool: Pool,
  onProgress: ProgressCallback
) {
  // Set the pool for submitBatch node
  setSubmitBatchPool(pgPool);

  // Create the checkpointer for state persistence
  const checkpointer = await createCheckpointer(pgPool);

  const workflow = new StateGraph(ChatState)
    // Context gathering phase
    .addNode('gatherContext', (state) =>
      gatherContextNode(state, extensionContext, onProgress)
    )

    // Goal synthesis phase
    .addNode('prepareGoal', (state) =>
      prepareGoalNode(state, extensionContext, onProgress)
    )

    // INTERRUPT 1: User reviews goal
    .addNode('humanReviewGoal', (state) => humanReviewGoalNode(state, onProgress))

    // Package assembly phase
    .addNode('packagePrompt', (state) => packagePromptNode(state, onProgress))

    // INTERRUPT 2: User approves send
    .addNode('humanApproveSend', (state) => humanApproveSendNode(state, onProgress))

    // Batch submission (stubbed for PRD 002)
    .addNode('submitBatch', (state) => submitBatchNode(state, onProgress))

    // INTERRUPT 3: Wait for batch completion
    .addNode('awaitBatchResponse', (state) => awaitBatchResponseNode(state, onProgress))

    // Response processing
    .addNode('processBatchResponse', (state) => processBatchResponseNode(state, onProgress))

    // INTERRUPT 4: User reviews edits
    .addNode('humanReviewEdits', (state) => humanReviewEditsNode(state, onProgress))

    // Apply approved edits
    .addNode('applyEdits', (state) => applyEditsNode(state, onProgress))

    // INTERRUPT 5: Optional review cycle
    .addNode('humanReviewCode', (state) => humanReviewCodeNode(state, onProgress))

    // Final summary
    .addNode('generateSummary', (state) =>
      generateSummaryNode(state, extensionContext, onProgress)
    )

    // Define edges - linear flow with one conditional edge
    .addEdge('__start__', 'gatherContext')
    .addEdge('gatherContext', 'prepareGoal')
    .addEdge('prepareGoal', 'humanReviewGoal')
    .addEdge('humanReviewGoal', 'packagePrompt')
    .addEdge('packagePrompt', 'humanApproveSend')
    .addEdge('humanApproveSend', 'submitBatch')
    .addEdge('submitBatch', 'awaitBatchResponse')
    .addEdge('awaitBatchResponse', 'processBatchResponse')
    .addEdge('processBatchResponse', 'humanReviewEdits')
    .addEdge('humanReviewEdits', 'applyEdits')
    .addEdge('applyEdits', 'humanReviewCode')

    // Conditional edge: review cycle or complete
    .addConditionalEdges('humanReviewCode', (state) => {
      if (state.requestReviewCycle) {
        return 'packagePrompt'; // Loop back for another review cycle
      }
      return 'generateSummary';
    })

    .addEdge('generateSummary', '__end__');

  // Compile with checkpointer for state persistence
  return workflow.compile({ checkpointer });
}

/**
 * Graph configuration for invoke/resume operations.
 */
export interface GraphConfig {
  configurable: {
    thread_id: string;
  };
}

/**
 * Creates the graph config for a specific thread.
 */
export function createGraphConfig(threadId: string): GraphConfig {
  return {
    configurable: {
      thread_id: threadId,
    },
  };
}
