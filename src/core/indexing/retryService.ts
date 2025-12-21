import { logger } from '../../shared/logger.js';

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;
const DEFAULT_BACKOFF_MULTIPLIER = 2;

/**
 * Executes a function with exponential backoff retry logic.
 * Logs meaningful error context without dumping entire content.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  context: string,
  config: RetryConfig = {}
): Promise<T> {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const initialDelayMs = config.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
  const maxDelayMs = config.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const backoffMultiplier = config.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER;

  let lastError: Error | null = null;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        logger.both.error(
          `[${context}] Failed after ${maxRetries + 1} attempts: ${lastError.message}`
        );
        throw lastError;
      }

      logger.both.warn(
        `[${context}] Attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${delayMs}ms...`
      );

      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError || new Error('Unknown error in retry loop');
}

/**
 * Batches an array into smaller chunks.
 */
export function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

