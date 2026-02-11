import { BaseController, IWebviewContext } from './BaseController.js';
import { createChatGraph } from '../../chat/graph.js';
import { logger } from '../../shared/logger.js';

/**
 * ChatController handles chat messages from the webview and executes the chat graph.
 */
export class ChatController extends BaseController {
  constructor(context: IWebviewContext) {
    super(context);
  }

  async handleMessage(message: any): Promise<boolean> {
    if (message.command === 'chatSubmit') {
      await this.runChatGraph(message.text);
      return true;
    }
    return false;
  }

  private async runChatGraph(input: string) {
    try {
      logger.both.info(`ChatController: Processing user input: "${input}"`);
      
      const graph = createChatGraph();
      const result = await graph.invoke({ userQuery: input });
      
      logger.both.info(`ChatController: Graph returned response: "${result.aiResponse}"`);
      
      this.context.postMessage({
        command: 'chatResponse',
        text: result.aiResponse
      });
    } catch (error) {
      logger.both.error('ChatController: Error running chat graph:', error);
      this.context.postMessage({
        command: 'chatResponse',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }
}

