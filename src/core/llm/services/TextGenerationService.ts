import { z } from 'zod';
import type { LLMProviderManager } from '../LLMProviderManager';
import type { GenerationOptions, TextResponse, StructuredResponse } from '../types';

/**
 * Options for text generation
 */
export interface TextGenerationOptions extends GenerationOptions {
  provider?: string; // Override default provider
}

/**
 * Service for text/chat completion operations
 */
export class TextGenerationService {
  constructor(private manager: LLMProviderManager) {}
  
  /**
   * Generate text response
   */
  async generate(
    prompt: string,
    options?: TextGenerationOptions
  ): Promise<TextResponse> {
    const providerId = options?.provider || this.manager.getDefaultProvider().id;
    const provider = this.manager.getProvider(providerId);
    
    // Start tracking operation
    const tracker = this.manager.startOperation(providerId, 'text_generation');
    
    try {
      const result = await this.manager.executeWithRetry(
        providerId,
        () => provider.generateText(prompt, options),
        { maxRetries: 5, retryableErrors: ['rate_limit', 'server_error'] }
      );
      
      // Record successful usage
      tracker.complete(result.tokens);
      
      return result;
    } catch (error) {
      tracker.fail(error as Error);
      throw error;
    }
  }
  
  /**
   * Generate structured output using Zod schema
   */
  async generateStructured<T>(
    schema: z.ZodType<T>,
    prompt: string,
    options?: TextGenerationOptions
  ): Promise<StructuredResponse<T>> {
    const providerId = options?.provider || this.manager.getDefaultProvider().id;
    const provider = this.manager.getProvider(providerId);
    
    // Start tracking operation
    const tracker = this.manager.startOperation(providerId, 'structured');
    
    try {
      const result = await this.manager.executeWithRetry(
        providerId,
        () => provider.generateStructured(schema, prompt, options),
        { maxRetries: 5, retryableErrors: ['rate_limit', 'server_error'] }
      );
      
      // Record successful usage
      tracker.complete(result.tokens);
      
      return result;
    } catch (error) {
      tracker.fail(error as Error);
      throw error;
    }
  }
}
