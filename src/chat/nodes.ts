import { ChatState } from "./state";
import { logger } from "../shared/logger";

/**
 * Hello World node that echoes the user's input.
 * This is a simple demonstration node for the chat graph.
 */
export async function helloWorldNode(state: typeof ChatState.State) {
  logger.both.info(`Chat Graph Received: ${state.userQuery}`);
  
  const response = `Hello World! I received: "${state.userQuery}"`;
  
  return {
    aiResponse: response,
    messages: [{ role: 'assistant', content: response }]
  };
}

