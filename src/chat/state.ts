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
});

