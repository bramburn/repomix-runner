/**
 * repairEdit node - Retries failed plan edits.
 */
import { z } from 'zod';
import type { ExtensionContext } from 'vscode';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import * as llmClient from '../../agent/llmClient.js';
import { PlanService } from '../../services/planService.js';
import {
  getApiKey,
  calculateGeminiCost,
  MAX_EDIT_RETRIES,
  type PlanEditCall,
  type ProgressCallback,
} from './utils.js';

async function executePlanEdits(
  planService: PlanService,
  threadId: string,
  edits: PlanEditCall[]
): Promise<void> {
  for (const edit of edits) {
    await planService.updatePlanPart(threadId, edit.targetText, edit.replacementText);
  }
}

export async function repairEditNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  if (!state.threadId) {
    return { nextAction: 'ANSWER' as const };
  }

  if (state.retryCount > MAX_EDIT_RETRIES) {
    onProgress('Plan edit retries exhausted.');
    return {
      nextAction: 'ANSWER' as const,
      planUpdated: false,
    };
  }

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    return { nextAction: 'ANSWER' as const };
  }

  onProgress(`Retrying plan edit (${state.retryCount}/${MAX_EDIT_RETRIES})...`);

  const schema = z.object({
    edits: z.array(
      z.object({
        targetText: z.string(),
        replacementText: z.string(),
      })
    ),
  });

  const prompt = `
SYSTEM: A previous plan edit failed.
ERROR: "${state.lastToolError || 'Unknown tool error'}"

ORIGINAL PLAN:
\`\`\`markdown
${state.planContent || '(No existing plan yet)'}
\`\`\`

USER REQUEST: "${state.userQuery}"

Fix the failed edit by returning corrected surgical edits.
Tips:
- If not found, copy targetText EXACTLY including whitespace/newlines.
- If ambiguous, include a larger unique block.
  `.trim();

  const planService = new PlanService(extensionContext);
  try {
    const { parsed, totalTokens, promptTokens, completionTokens } =
      await llmClient.generateStructured(apiKey, schema, prompt, 'RepairPlanEdit');

    const edits = parsed.edits
      .map((edit) => ({
        targetText: edit.targetText,
        replacementText: edit.replacementText,
      }))
      .filter((edit) => edit.targetText.trim().length > 0);

    if (edits.length === 0) {
      throw new Error('Repair step produced no valid edits.');
    }

    await executePlanEdits(planService, state.threadId, edits);
    const newPlanContent = await planService.loadPlan(state.threadId);
    return {
      planContent: newPlanContent,
      planUpdated: true,
      nextAction: 'ANSWER' as const,
      retryCount: 0,
      lastToolError: null,
      lastToolCall: edits,
      tokensUsed: totalTokens || promptTokens + completionTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costUsd: calculateGeminiCost(promptTokens, completionTokens),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (state.retryCount >= MAX_EDIT_RETRIES) {
      return {
        nextAction: 'ANSWER' as const,
        planUpdated: false,
        lastToolError: errorMessage,
      };
    }
    return {
      nextAction: 'RETRY_EDIT' as const,
      retryCount: state.retryCount + 1,
      lastToolError: errorMessage,
      planUpdated: false,
    };
  }
}
