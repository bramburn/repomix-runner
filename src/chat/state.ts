import { Annotation } from "@langchain/langgraph";
import type { CompressedSegment, CompressionLevel, TokenBudget } from './compression/types.js';

// --- Type Definitions for HITL Workflow ---

/**
 * Workflow phase tracking for HITL UI state synchronization.
 */
export type WorkflowPhase =
  | 'idle'
  | 'gathering'
  | 'goal_review'
  | 'packaging'
  | 'send_review'
  | 'batch_pending'
  | 'response_review'
  | 'applying'
  | 'code_review'
  | 'complete';

/**
 * Output instruction type for batch submission.
 */
export type OutputInstruction = 'plan' | 'code_change' | 'code_review';

/**
 * Package payload structure for batch submission.
 */
export interface PackagePayload {
  goal: string;
  contextFiles: Array<{ path: string; content: string }>;
  repoArchitecture: string;
  dependencies: Record<string, string>;
  outputInstruction: OutputInstruction;
}

/**
 * File edit structure from batch response.
 */
export interface FileEdit {
  filePath: string;
  action: 'create' | 'edit' | 'delete';
  content: string;
  searchReplace?: Array<{ search: string; replace: string }>;
  approved: boolean;
}

/**
 * Defines the shared memory of the chat graph as it processes messages.
 */
export const ChatState = Annotation.Root({
  // --- Input ---
  // The user's input message
  userQuery: Annotation<string>(),
  threadId: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "",
  }),

  // --- Intermediate State ---
  // 1. Generated Search Queries
  searchQueries: Annotation<string[]>({
    reducer: (_, y) => y,
    default: () => [],
  }),

  // 2. Retrieved Context (Snippets from Vector DB)
  // FIX H1: Use replace reducer so humanReviewGoal can filter/remove files
  retrievedContext: Annotation<Array<{
    filePath: string;
    content: string;
    score: number;
    startLine?: number;
    endLine?: number;
  }>>({
    reducer: (_, y) => y,
    default: () => [],
  }),

  // 3. Current persisted plan content for this thread
  planContent: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "",
  }),

  // 4. Full file contents loaded only for rewrite phase
  targetFileContents: Annotation<Record<string, string>>({
    reducer: (_, y) => y,
    default: () => ({}),
  }),

  // 5. Decision/Plan (What to do next)
  nextAction: Annotation<"SEARCH_MORE" | "REWRITE" | "RETRY_EDIT" | "ANSWER">({
    reducer: (_, y) => y,
    default: () => "ANSWER",
  }),

  filesToLoad: Annotation<string[]>({
    reducer: (_, y) => y,
    default: () => [],
  }),

  planUpdated: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),

  planPath: Annotation<string>({
    reducer: (_, y) => y,
    default: () => "",
  }),

  planIsNew: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),

  lastToolError: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),

  lastToolCall: Annotation<Array<{ targetText: string; replacementText: string }> | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),

  retryCount: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0,
  }),

  // Loop Safety
  loopCount: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0,
  }),

  // --- Output ---
  // The AI's response message
  aiResponse: Annotation<string>(),

  // Array of messages in the conversation (includes 'system' for compression summaries)
  messages: Annotation<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  // Total tokens used for the current chat session (displayed in UI)
  tokensUsed: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0,
  }),

  // Input tokens (prompt) for the current chat session
  inputTokens: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0,
  }),

  // Output tokens (completion) for the current chat session
  outputTokens: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0,
  }),

  // Estimated USD cost for the current chat session (displayed in UI)
  costUsd: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0,
  }),

  // --- HITL Workflow State ---

  // Current workflow phase for UI synchronization
  workflowPhase: Annotation<WorkflowPhase>({
    reducer: (_, y) => y,
    default: () => 'idle',
  }),

  // Synthesized goal text (user-editable during review)
  goalText: Annotation<string>({
    reducer: (_, y) => y,
    default: () => '',
  }),

  // Repository architecture markdown (loaded from DB or generated)
  repoArchitecture: Annotation<string>({
    reducer: (_, y) => y,
    default: () => '',
  }),

  // Project dependencies extracted from package.json, requirements.txt, etc.
  dependencies: Annotation<Record<string, string>>({
    reducer: (_, y) => y,
    default: () => ({}),
  }),

  // Final package payload ready for batch submission
  packagePayload: Annotation<PackagePayload | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),

  // Batch job ID from batch_jobs table
  batchJobId: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),

  // Parsed file edits from batch response
  fileEdits: Annotation<FileEdit[]>({
    reducer: (_, y) => y,
    default: () => [],
  }),

  // Whether user wants another review cycle
  requestReviewCycle: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),

  // Batch response content (raw response from API or stub)
  batchResponseContent: Annotation<string>({
    reducer: (_, y) => y,
    default: () => '',
  }),

  // --- Memory State (PRD 004) ---

  // Formatted memory context for debugging/display
  activeMemories: Annotation<string>({
    reducer: (_, y) => y,
    default: () => '',
  }),

  // --- Context Compression State (PRD 003) ---

  // Percentage of context window that triggers compression (from settings)
  contextThresholdPercent: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 80,
  }),

  // Current total token count across all context
  currentTokenCount: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0,
  }),

  // Whether compression was applied in this workflow run
  compressionApplied: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),

  // Compressed history segments (summaries of older messages)
  compressedHistory: Annotation<CompressedSegment[]>({
    reducer: (_, y) => y,
    default: () => [],
  }),

  // Maximum recent messages to keep in full before summarizing
  maxRecentMessages: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 10,
  }),

  // Model context window size in tokens
  modelContextWindow: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 200_000,
  }),

  // Current compression level applied to context (PRD 003)
  compressionLevel: Annotation<CompressionLevel>({
    reducer: (_, y) => y,
    default: () => 0 as CompressionLevel,
  }),

  // Computed token budget allocation (PRD 003)
  tokenBudget: Annotation<TokenBudget | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
});
