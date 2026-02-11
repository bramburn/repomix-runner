import { Annotation } from "@langchain/langgraph";

/**
 * Defines the shared memory of the chat graph as it processes messages.
 */
export const ChatState = Annotation.Root({
  // The user's input message
  userQuery: Annotation<string>(),

  // The AI's response message
  aiResponse: Annotation<string>(),

  // Array of messages in the conversation
  messages: Annotation<Array<{ role: 'user' | 'assistant'; content: string }>>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  // Total tokens used for the current chat session (displayed in UI)
  tokensUsed: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0,
  }),

  // Estimated USD cost for the current chat session (displayed in UI)
  costUsd: Annotation<number>({
    reducer: (_, y) => y,
    default: () => 0,
  }),

  // Context retrieved from the vector database
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
});
