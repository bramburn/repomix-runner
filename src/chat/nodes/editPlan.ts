/**
 * editPlan node - Creates or surgically edits the plan.
 */
import { z } from 'zod';
import type { ExtensionContext } from 'vscode';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import * as llmClient from '../../agent/llmClient.js';
import { PlanService } from '../../services/planService.js';
import {
  getApiKey,
  formatHistory,
  calculateGeminiCost,
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

export async function editPlanNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  if (!state.threadId) {
    return {
      planUpdated: false,
      nextAction: 'ANSWER' as const,
    };
  }

  const apiKey = await getApiKey(extensionContext);
  if (!apiKey) {
    logger.both.warn('Chat Graph: Missing API key, cannot rewrite plan.');
    return {
      planUpdated: false,
      nextAction: 'ANSWER' as const,
    };
  }

  const planService = new PlanService(extensionContext);
  const isNewPlan = !state.planContent || state.planContent.trim().length === 0;

  if (isNewPlan) {
    onProgress('Creating initial plan...');

    const contextStr = Object.entries(state.targetFileContents)
      .map(([filePath, content]) => `FILE: ${filePath}\n\`\`\`\n${content}\n\`\`\``)
      .join('\n\n');
    const historyStr = formatHistory(state.messages.slice(0, -1));

    const createPrompt = `
You are an expert software architect.
USER REQUEST: "${state.userQuery}"

Conversation History:
${historyStr || '(No prior conversation)'}

FULL CONTEXT:
${contextStr || 'No specific files loaded.'}

TASK:
Create a comprehensive step-by-step implementation plan in Markdown.
- Use checkboxes (- [ ]) for executable steps.
- Include a "Verification" section.
- Be specific about files and implementation details when possible.
    `.trim();

    try {
      const { content, totalTokens, promptTokens, completionTokens } = await llmClient.generateText(
        apiKey,
        createPrompt,
        'CreatePlan'
      );

      await planService.updatePlan(state.threadId, content);

      return {
        planContent: content,
        planUpdated: true,
        planIsNew: isNewPlan,
        nextAction: 'ANSWER' as const,
        retryCount: 0,
        lastToolError: null,
        lastToolCall: null,
        tokensUsed: totalTokens || promptTokens + completionTokens,
        inputTokens: promptTokens,
        outputTokens: completionTokens,
        costUsd: calculateGeminiCost(promptTokens, completionTokens),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.both.error('Chat Graph: Plan creation failed', error);
      return {
        planUpdated: false,
        nextAction: 'ANSWER' as const,
        lastToolError: errorMessage,
      };
    }
  }

  onProgress('Applying surgical plan edits...');

  const schema = z.object({
    edits: z.array(
      z.object({
        thoughts: z.string().optional(),
        targetText: z.string(),
        replacementText: z.string(),
      })
    ),
  });

  const prompt = `
ORIGINAL PLAN:
\`\`\`markdown
${state.planContent || '(No existing plan yet)'}
\`\`\`

USER REQUEST:
"${state.userQuery}"

FULL CONTEXT (requested files):
${
  Object.entries(state.targetFileContents)
    .map(([filePath, content]) => `FILE: ${filePath}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n') || 'No full files loaded.'
}

TASK: Perform SURGICAL edits, do not rewrite the whole file.
Rules:
1. Return one or more edits with EXACT targetText blocks from ORIGINAL PLAN.
2. targetText must be unique in the file.
3. replacementText is the updated markdown for that block.
4. Include enough context in targetText (header + bullets) to avoid ambiguity.
  `.trim();

  try {
    const { parsed, totalTokens, promptTokens, completionTokens } =
      await llmClient.generateStructured(apiKey, schema, prompt, 'EditPlan');

    const edits = parsed.edits
      .map((edit) => ({
        targetText: edit.targetText,
        replacementText: edit.replacementText,
      }))
      .filter((edit) => edit.targetText.trim().length > 0);

    if (edits.length === 0) {
      return {
        planUpdated: false,
        nextAction: 'ANSWER' as const,
        retryCount: 0,
      };
    }

    await executePlanEdits(planService, state.threadId, edits);
    const newPlanContent = await planService.loadPlan(state.threadId);
    return {
      planContent: newPlanContent,
      planUpdated: true,
      planIsNew: isNewPlan,
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
    logger.both.warn('Chat Graph: Plan edit failed; entering repair loop.', error);
    return {
      planUpdated: false,
      nextAction: 'RETRY_EDIT' as const,
      retryCount: state.retryCount + 1,
      lastToolError: errorMessage,
    };
  }
}
