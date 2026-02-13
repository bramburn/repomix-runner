import { Annotation } from "@langchain/langgraph";

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
  retrievedContext: Annotation<Array<{
    filePath: string;
    content: string;
    score: number;
    startLine?: number;
    endLine?: number;
  }>>({
    reducer: (curr, next) => {
      const existing = new Set(curr.map(c => `${c.filePath}:${c.startLine ?? ""}`));
      const uniqueNext = next.filter(c => !existing.has(`${c.filePath}:${c.startLine ?? ""}`));
      return [...curr, ...uniqueNext];
    },
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

  // Array of messages in the conversation
  messages: Annotation<Array<{ role: 'user' | 'assistant'; content: string }>>({
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
});
