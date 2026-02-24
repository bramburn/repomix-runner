import type { PackagePayload } from '../state.js';
import { getTemplateForInstruction } from './outputTemplates.js';

function renderDependencies(dependencies: Record<string, string>): string {
  const entries = Object.entries(dependencies);
  if (entries.length === 0) {
    return 'No dependencies provided.';
  }
  return entries
    .slice(0, 100)
    .map(([name, version]) => `- ${name}: ${version}`)
    .join('\n');
}

function renderContextFiles(contextFiles: Array<{ path: string; content: string }>): string {
  if (contextFiles.length === 0) {
    return 'No context files provided.';
  }

  return contextFiles
    .map((file) => `### ${file.path}\n\n\`\`\`\n${file.content}\n\`\`\``)
    .join('\n\n');
}

export function assemblePromptFromPayload(
  payload: PackagePayload,
  options?: { existingPlan?: string; previousResponse?: string }
): string {
  const outputTemplate = getTemplateForInstruction(payload.outputInstruction);

  let prompt = `# Task\n\n## Goal\n${payload.goal}\n\n## Repository Architecture\n${payload.repoArchitecture || 'Not available'}\n\n## Dependencies\n${renderDependencies(payload.dependencies)}\n\n## Context Files\n${renderContextFiles(payload.contextFiles)}`;

  if (options?.existingPlan) {
    prompt += `\n\n## Existing Plan\n${options.existingPlan}`;
  }

  if (options?.previousResponse) {
    prompt += `\n\n## Previous Response\n${options.previousResponse}`;
  }

  prompt += `\n\n## Output Instructions\n${outputTemplate}\n`;

  return prompt;
}

export function estimatePromptTokens(prompt: string): number {
  // Fast fallback estimator for UI/status. We don't need exact tokenization here.
  return Math.ceil(prompt.length / 4);
}
