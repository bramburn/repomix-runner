/**
 * Base error class for LLM-related errors
 */
export class LLMError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LLMError';
    
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error indicating a retryable failure occurred
 */
export class RetryableError extends LLMError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
    cause?: unknown
  ) {
    super(message, cause);
    this.name = 'RetryableError';
  }
}

/**
 * Error indicating rate limit has been exceeded
 */
export class RateLimitError extends RetryableError {
  constructor(
    message: string,
    public readonly resetTime?: Date,
    cause?: unknown
  ) {
    super(message, undefined, cause);
    this.name = 'RateLimitError';
  }
}

/**
 * Error indicating configuration problem
 */
export class ConfigurationError extends LLMError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ConfigurationError';
  }
}

/**
 * Error from upstream API
 */
export class APIError extends LLMError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly responseBody?: string,
    cause?: unknown
  ) {
    super(message, cause);
    this.name = 'APIError';
  }
}

/**
 * Timeout error for long-running operations
 */
export class TimeoutError extends RetryableError {
  constructor(message: string, cause?: unknown) {
    super(message, undefined, cause);
    this.name = 'TimeoutError';
  }
}

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof RetryableError) {
    return true;
  }
  
  const msg = String((error as any)?.message ?? error);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('timeout') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNRESET')
  );
}

/**
 * Extract retry-after delay from error or headers
 */
export function extractRetryDelay(error: unknown): number {
  const err = error as any;
  
  // Check for retry-after header value
  if (err?.response?.headers?.['retry-after']) {
    const retryAfter = err.response.headers['retry-after'];
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
  }
  
  // Check for custom retryAfterMs property
  if (error instanceof RetryableError && error.retryAfterMs) {
    return error.retryAfterMs;
  }
  
  // Default exponential backoff with jitter
  return 0;
}
