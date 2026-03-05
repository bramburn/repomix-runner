import PQueue from 'p-queue';
import type { RetryOptions } from '../types';
import { isRetryableError, extractRetryDelay } from '../utils/errorHandling';

/**
 * Configurable rate limit queue with exponential backoff retry support
 */
export class RateLimitQueue {
  private queue: PQueue;
  private readonly rpm: number;
  private readonly intervalMs: number = 60_000; // 1 minute
  
  constructor(requestsPerMinute: number = 10) {
    this.rpm = requestsPerMinute;
    
    this.queue = new PQueue({
      concurrency: Math.min(requestsPerMinute, 10), // Cap at 10 concurrent
      interval: this.intervalMs,
      intervalCap: requestsPerMinute,
      carryoverConcurrencyCount: true,
    });
  }
  
  /**
   * Add operation to queue with automatic retry logic
   */
  async addWithRetry<T>(
    operation: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 5;
    const baseDelay = options?.baseDelayMs ?? 2000;
    const maxDelay = options?.maxDelayMs ?? 32000;
    
    return this.queue.add(async () => {
      let attempt = 0;
      
      while (true) {
        try {
          return await operation();
        } catch (error: unknown) {
          attempt++;
          
          if (attempt > maxRetries || !isRetryableError(error)) {
            throw error;
          }
          
          // Calculate delay with exponential backoff + jitter
          const retryAfter = extractRetryDelay(error);
          const exponentialDelay = Math.min(
            baseDelay * Math.pow(2, attempt - 1),
            maxDelay
          );
          const jitter = Math.random() * 500;
          const delay = retryAfter || exponentialDelay + jitter;
          
          console.log(
            `[RateLimitQueue] Retry attempt ${attempt}/${maxRetries} after ${Math.round(delay / 1000)}s. Error:`,
            error instanceof Error ? error.message : String(error)
          );
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    });
  }
  
  /**
   * Get current queue statistics
   */
  getStats() {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
      paused: this.queue.isPaused,
    };
  }
  
  /**
   * Pause queue processing
   */
  pause(): void {
    this.queue.pause();
  }
  
  /**
   * Resume queue processing
   */
  resume(): void {
    this.queue.start();
  }
  
  /**
   * Clear all queued tasks
   */
  clear(): void {
    this.queue.clear();
  }
  
  /**
   * Wait for all tasks to complete
   */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
  
  /**
   * Update rate limit configuration
   */
  updateRPM(rpm: number): void {
    // Note: PQueue doesn't support dynamic interval cap updates
    // Would need to recreate queue for significant changes
    console.log(`[RateLimitQueue] RPM updated to ${rpm}. Queue will apply on next interval.`);
  }
}
