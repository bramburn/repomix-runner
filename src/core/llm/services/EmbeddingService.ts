import type { LLMProviderManager } from '../LLMProviderManager';

/**
 * Options for embedding operations
 */
export interface EmbeddingOptions {
  provider?: string; // Override default embedding provider
  priority?: boolean; // High priority (for user-facing operations)
}

/**
 * Service for embedding operations
 * Note: This is a wrapper around the existing embeddingService
 * that integrates with the new unified LLM management system
 */
export class EmbeddingService {
  constructor(private manager: LLMProviderManager) {}
  
  /**
   * Embed single text
   */
  async embedText(text: string, options?: EmbeddingOptions): Promise<number[]> {
    const providerId = options?.provider || this.manager.getDefaultEmbeddingProvider().id;
    const provider = this.manager.getProvider(providerId);
    
    // Start tracking operation
    const tracker = this.manager.startOperation(providerId, 'embedding');
    
    try {
      const result = await this.manager.executeWithRetry(
        providerId,
        () => provider.embedText(text),
        { maxRetries: 5, retryableErrors: ['rate_limit', 'server_error'] }
      );
      
      // Record successful usage (estimate tokens for embeddings)
      tracker.complete({
        prompt: Math.ceil(text.length / 4), // Rough estimate
        completion: 0,
        total: Math.ceil(text.length / 4),
      });
      
      return result;
    } catch (error) {
      tracker.fail(error as Error);
      throw error;
    }
  }
  
  /**
   * Embed multiple texts
   */
  async embedTexts(texts: string[], options?: EmbeddingOptions): Promise<number[][]> {
    const providerId = options?.provider || this.manager.getDefaultEmbeddingProvider().id;
    const provider = this.manager.getProvider(providerId);
    
    // Start tracking operation
    const tracker = this.manager.startOperation(providerId, 'embedding');
    
    try {
      const result = await this.manager.executeWithRetry(
        providerId,
        () => provider.embedTexts(texts),
        { maxRetries: 5, retryableErrors: ['rate_limit', 'server_error'] }
      );
      
      // Record successful usage
      const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
      tracker.complete({
        prompt: Math.ceil(totalChars / 4),
        completion: 0,
        total: Math.ceil(totalChars / 4),
      });
      
      return result;
    } catch (error) {
      tracker.fail(error as Error);
      throw error;
    }
  }
}
