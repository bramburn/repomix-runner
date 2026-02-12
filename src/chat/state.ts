import { Annotation } from "@langchain/langgraph";

/**
 * Defines the shared memory of the chat graph as it processes messages.
 */
export const ChatState = Annotation.Root({
  // --- Input ---
  // The user's input message
  userQuery: Annotation<string>(),

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

  // 3. Full File Contents (Read via Tool)
  fileContents: Annotation<Record<string, string>>({
    reducer: (curr, next) => ({ ...curr, ...next }),
    default: () => ({}),
  }),

  // 4. Decision/Plan (What to do next)
  nextAction: Annotation<"READ" | "ANSWER">({
    reducer: (_, y) => y,
    default: () => "ANSWER",
  }),

  filesToRead: Annotation<string[]>({
    reducer: (_, y) => y,
    default: () => [],
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
