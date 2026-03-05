import type { UsageStatistics } from '../types';

/**
 * Tracks API usage across all providers
 */
export class UsageTracker {
  private stats: Map<string, UsageStatistics> = new Map();
  private enabled: boolean = true;
  
  constructor(enabled?: boolean) {
    this.enabled = enabled ?? true;
  }
  
  /**
   * Start tracking an operation
   */
  startOperation(providerId: string, operationType: 'text_generation' | 'embedding' | 'structured'): OperationTracker {
    const tracker = new OperationTracker(providerId, operationType, this);
    return tracker;
  }
  
  /**
   * Record a successful operation
   */
  recordSuccess(
    providerId: string,
    tokens: { prompt: number; completion: number; total: number },
    estimatedCostUsd?: number
  ): void {
    if (!this.enabled) return;
    
    const stats = this.getOrCreateStats(providerId);
    stats.totalRequests++;
    stats.totalTokens.prompt += tokens.prompt;
    stats.totalTokens.completion += tokens.completion;
    stats.totalTokens.total += tokens.total;
    
    if (estimatedCostUsd !== undefined) {
      stats.estimatedCostUsd += estimatedCostUsd;
    }
    
    stats.lastRequestTime = new Date();
  }
  
  /**
   * Record a failed operation
   */
  recordError(providerId: string, errorMessage: string): void {
    if (!this.enabled) return;
    
    const stats = this.getOrCreateStats(providerId);
    stats.errors.count++;
    stats.errors.lastError = errorMessage;
    stats.errors.lastErrorTime = new Date();
  }
  
  /**
   * Get usage statistics for a provider
   */
  getStats(providerId: string): UsageStatistics | null {
    const stats = this.stats.get(providerId);
    return stats ? { ...stats } : null;
  }
  
  /**
   * Get all provider statistics
   */
  getAllStats(): Map<string, UsageStatistics> {
    return new Map(this.stats);
  }
  
  /**
   * Reset statistics for a provider
   */
  resetStats(providerId: string): void {
    if (this.stats.has(providerId)) {
      this.stats.delete(providerId);
    }
  }
  
  /**
   * Reset all statistics
   */
  resetAllStats(): void {
    this.stats.clear();
  }
  
  /**
   * Export statistics to JSON
   */
  exportToJson(): object {
    const result: any = {};
    
    for (const [providerId, stats] of this.stats.entries()) {
      result[providerId] = {
        ...stats,
        lastRequestTime: stats.lastRequestTime?.toISOString(),
        errors: {
          ...stats.errors,
          lastErrorTime: stats.errors.lastErrorTime?.toISOString(),
        },
      };
    }
    
    return result;
  }
  
  private getOrCreateStats(providerId: string): UsageStatistics {
    if (!this.stats.has(providerId)) {
      this.stats.set(providerId, {
        provider: providerId,
        totalRequests: 0,
        totalTokens: {
          prompt: 0,
          completion: 0,
          total: 0,
        },
        estimatedCostUsd: 0,
        errors: {
          count: 0,
        },
      });
    }
    
    return this.stats.get(providerId)!;
  }
}

/**
 * Helper class to track individual operations
 */
export class OperationTracker {
  constructor(
    private providerId: string,
    private operationType: 'text_generation' | 'embedding' | 'structured',
    private tracker: UsageTracker
  ) {}
  
  /**
   * Mark operation as complete with token usage
   */
  complete(tokens: { prompt: number; completion: number; total: number }, estimatedCost?: number): void {
    this.tracker.recordSuccess(this.providerId, tokens, estimatedCost);
  }
  
  /**
   * Mark operation as failed
   */
  fail(error: Error): void {
    this.tracker.recordError(this.providerId, error.message);
  }
}
