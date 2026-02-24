/**
 * Graph Executor (PRD 007)
 * 
 * Wraps chat graph execution with AbortController support for cancellation.
 */
import type { Pool } from 'pg';
import type { ExtensionContext } from 'vscode';
import { logger } from '../../shared/logger.js';
import type { QueueEntry } from './types.js';

export interface GraphExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  wasCancelled: boolean;
}

interface InvokableGraph {
  invoke: (...args: any[]) => Promise<any>;
}

export class GraphExecutor {
  private abortController: AbortController | null = null;
  private currentlyExecutingEntry: QueueEntry | null = null;

  constructor(
    private readonly extensionContext: ExtensionContext,
    private readonly pgPool: Pool,
    private readonly createGraph: () => Promise<InvokableGraph>
  ) {}

  /**
   * Executes the chat graph with the given queue entry.
   * @param entry - The queue entry to execute
   * @returns Execution result
   */
  async execute(entry: QueueEntry): Promise<GraphExecutionResult> {
    if (this.abortController) {
      logger.both.warn('GraphExecutor: Already executing, stopping previous execution');
      this.stop();
    }

    this.abortController = new AbortController();
    this.currentlyExecutingEntry = entry;

    try {
      logger.both.info(`GraphExecutor: Starting execution for entry ${entry.id}`);

      const graph = await this.createGraph();
      
      // Load message history
      // Note: This would need to be passed in or loaded from repository
      // For now, we'll handle it in the ChatController integration
      
      // Execute the graph with abort signal
      const result = await this.executeWithAbort(graph, entry, this.abortController.signal);

      this.currentlyExecutingEntry = null;
      this.abortController = null;

      return {
        success: true,
        result,
        wasCancelled: false,
      };
    } catch (error) {
      this.currentlyExecutingEntry = null;
      this.abortController = null;

      if (error instanceof Error && error.name === 'AbortError') {
        logger.both.info(`GraphExecutor: Execution cancelled for entry ${entry.id}`);
        return {
          success: false,
          error: 'Execution cancelled by user',
          wasCancelled: true,
        };
      }

      logger.both.error(`GraphExecutor: Execution failed for entry ${entry.id}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        wasCancelled: false,
      };
    }
  }

  /**
   * Stops the currently executing graph.
   */
  stop(): void {
    if (this.abortController) {
      logger.both.info('GraphExecutor: Stopping current execution');
      this.abortController.abort();
      this.abortController = null;
    } else {
      logger.both.warn('GraphExecutor: No active execution to stop');
    }
  }

  /**
   * Gets the currently executing entry.
   * @returns The current entry or null if not executing
   */
  getCurrentlyExecuting(): QueueEntry | null {
    return this.currentlyExecutingEntry;
  }

  /**
   * Executes the graph with abort signal support.
   */
  private async executeWithAbort(
    graph: InvokableGraph,
    entry: QueueEntry,
    signal: AbortSignal
  ): Promise<unknown> {
    // Check if already aborted before starting
    if (signal.aborted) {
      throw new AbortError('Execution cancelled before start');
    }

    // Set up abort listener
    let rejectAbort: (reason?: any) => void;
    const abortPromise = new Promise<never>((_, reject) => {
      rejectAbort = reject;
    });
    
    const onAbort = () => {
      if (rejectAbort) {
        rejectAbort(new AbortError('Execution cancelled'));
      }
    };

    signal.addEventListener('abort', onAbort, { once: true });

    try {
      // Race between graph execution and abort
      const config = {
        configurable: {
          thread_id: entry.threadId,
        },
        signal, // Pass signal in config for LangGraph to handle
      };

      const input = {
        userQuery: entry.text,
        threadId: entry.threadId,
        messages: [], // Will be populated by ChatController
      };

      // Note: In practice, you'd want to pass the actual message history here
      // This is a simplified version - the full integration happens in ChatController
      const executionPromise = graph.invoke(input, config);

      const result = await Promise.race([executionPromise, abortPromise]);
      
      return result;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

/**
 * Custom AbortError class for better error handling.
 */
export class AbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbortError';
  }
}
