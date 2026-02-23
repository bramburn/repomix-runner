/**
 * MemoryInjector - Formats memories for inclusion in LLM prompts.
 * PRD 004: Memory Manager CRUD
 */
import type { MemoryEntry } from './types.js';
import type { MemoryManager } from './memoryManager.js';

/**
 * Maximum characters for memory injection to avoid token bloat.
 * Approximately 2000 tokens assuming ~4 chars per token.
 */
const MAX_MEMORY_CHARS = 8000;

/**
 * Formats a list of memories as markdown bullet points.
 */
function formatMemoryList(memories: MemoryEntry[], title: string): string {
  if (memories.length === 0) {
    return '';
  }

  const lines = memories.map((m) => `- **${m.key}**: ${m.value}`);
  return `### ${title}\n${lines.join('\n')}`;
}

/**
 * Truncates memory sections to stay within token budget.
 * Prioritizes session > repo > global memories.
 */
function truncateToLimit(
  sessionSection: string,
  repoSection: string,
  maxChars: number
): { sessionSection: string; repoSection: string } {
  const totalLength = sessionSection.length + repoSection.length;

  if (totalLength <= maxChars) {
    return { sessionSection, repoSection };
  }

  // If session alone exceeds limit, truncate it
  if (sessionSection.length >= maxChars) {
    return {
      sessionSection: sessionSection.slice(0, maxChars - 50) + '\n... (truncated)',
      repoSection: '',
    };
  }

  // Otherwise, give remaining budget to repo
  const remainingBudget = maxChars - sessionSection.length;
  return {
    sessionSection,
    repoSection:
      remainingBudget > 100
        ? repoSection.slice(0, remainingBudget - 50) + '\n... (truncated)'
        : '',
  };
}

/**
 * Injects relevant memories into a formatted string for prompt inclusion.
 *
 * @param threadId - Current thread ID for session memories
 * @param repoId - Repository ID for repo memories
 * @param memoryManager - MemoryManager instance for fetching memories
 * @returns Formatted markdown string with memory context, or empty string if no memories
 */
export async function injectMemories(
  threadId: string,
  repoId: string,
  memoryManager: MemoryManager
): Promise<string> {
  const { session, repo } = await memoryManager.getAllForContext(threadId, repoId);

  if (session.length === 0 && repo.length === 0) {
    return '';
  }

  let sessionSection = formatMemoryList(session, 'Session Context');
  let repoSection = formatMemoryList(repo, 'Repository Context');

  // Truncate if necessary
  const truncated = truncateToLimit(sessionSection, repoSection, MAX_MEMORY_CHARS);
  sessionSection = truncated.sessionSection;
  repoSection = truncated.repoSection;

  const sections = [sessionSection, repoSection].filter((s) => s.length > 0);

  if (sections.length === 0) {
    return '';
  }

  return `## Known Facts from Memory

${sections.join('\n\n')}
`;
}

/**
 * Formats memories for display in the UI.
 * Used by the extractMemory node to update state.activeMemories.
 */
export function formatMemoriesForDisplay(memories: MemoryEntry[]): string {
  if (memories.length === 0) {
    return '';
  }

  return memories
    .map((m) => `[${m.scope}] ${m.key}: ${m.value}`)
    .join('\n');
}
