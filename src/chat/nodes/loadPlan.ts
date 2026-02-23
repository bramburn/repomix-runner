/**
 * loadPlan node - Loads the persistent plan for the current thread.
 */
import type { ExtensionContext } from 'vscode';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import { PlanService } from '../../services/planService.js';
import type { ProgressCallback } from './utils.js';

export async function loadPlanNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  if (!state.threadId) {
    logger.both.warn('Chat Graph: Missing threadId; skipping plan load.');
    return { planContent: '', planPath: '' };
  }

  onProgress('Loading persistent plan...');
  const planService = new PlanService(extensionContext);
  const planContent = await planService.loadPlan(state.threadId);
  const planPath = planService.getPlanPath(state.threadId);

  return {
    planContent,
    planPath,
    planUpdated: false,
    retryCount: 0,
    lastToolError: null,
    lastToolCall: null,
  };
}
