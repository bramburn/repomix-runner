/**
 * generateSummary node - Generates final summary of changes.
 */
import type { ExtensionContext } from 'vscode';
import { ChatState } from '../state.js';
import * as llmClient from '../../agent/llmClient.js';
import { getApiKey, calculateGeminiCost, type ProgressCallback } from './utils.js';

export async function generateSummaryNode(
  state: typeof ChatState.State,
  extensionContext: ExtensionContext,
  onProgress: ProgressCallback
) {
  onProgress('Generating summary...');

  const appliedEdits = state.fileEdits.filter((e) => e.approved);

  // If no API key or no edits, return a simple summary
  const apiKey = await getApiKey(extensionContext);
  if (!apiKey || appliedEdits.length === 0) {
    const summary = appliedEdits.length > 0
      ? `Applied ${appliedEdits.length} file changes:\n${appliedEdits.map((e) => `- ${e.action}: ${e.filePath}`).join('\n')}`
      : 'Workflow completed with no file changes applied.';

    return {
      aiResponse: summary,
      workflowPhase: 'complete' as const,
    };
  }

  const editSummary = appliedEdits
    .map((e) => `- ${e.action.toUpperCase()}: ${e.filePath}`)
    .join('\n');

  const prompt = `
You are a helpful assistant summarizing code changes.

## Goal
${state.goalText}

## Changes Applied
${editSummary}

## Task
Write a brief, clear summary (2-4 sentences) of what was accomplished.
Focus on the impact and any important notes for the user.
  `.trim();

  try {
    const { content, totalTokens, promptTokens, completionTokens } = await llmClient.generateText(
      apiKey,
      prompt,
      'GenerateSummary'
    );

    return {
      aiResponse: content,
      workflowPhase: 'complete' as const,
      tokensUsed: totalTokens || promptTokens + completionTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      costUsd: calculateGeminiCost(promptTokens, completionTokens),
    };
  } catch (error) {
    // Fallback to simple summary
    return {
      aiResponse: `Applied ${appliedEdits.length} file changes for: ${state.goalText.slice(0, 100)}`,
      workflowPhase: 'complete' as const,
    };
  }
}
