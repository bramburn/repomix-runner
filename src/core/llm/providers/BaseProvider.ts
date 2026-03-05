import { z } from 'zod';
import type {
  LLMProvider,
  ProviderCapabilities,
  GenerationOptions,
  TextResponse,
  StructuredResponse,
  ModelInfo,
  RateLimitInfo
} from '../types';

/**
 * Abstract base class for all LLM providers
 * Provides common functionality and enforces interface compliance
 */
export abstract class BaseProvider implements LLMProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly capabilities: ProviderCapabilities;
  
  protected initialized: boolean = false;
  
  /**
   * Initialize the provider (load configs, validate connections, etc.)
   */
  async initialize(): Promise<void> {
    this.initialized = true;
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    this.initialized = false;
  }
  
  /**
   * Generate text - must be implemented by subclasses
   */
  abstract generateText(prompt: string, options?: GenerationOptions): Promise<TextResponse>;
  
  /**
   * Generate structured output - default implementation uses JSON mode
   */
  async generateStructured<T>(
    schema: z.ZodType<T>,
    prompt: string,
    options?: GenerationOptions
  ): Promise<StructuredResponse<T>> {
    // Default implementation: ask for JSON output
    const jsonPrompt = `${prompt}\n\nOutput ONLY valid JSON matching this schema. Do not include any other text.`;
    
    const response = await this.generateText(jsonPrompt, {
      ...options,
      temperature: 0, // Use low temperature for structured output
    });
    
    try {
      const parsed = JSON.parse(response.content);
      const validated = schema.parse(parsed);
      
      return {
        parsed: validated,
        raw: response,
        tokens: response.tokens,
        model: response.model,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse structured output: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  
  /**
   * Embed single text - must be implemented by embedding-capable providers
   */
  abstract embedText(text: string): Promise<number[]>;
  
  /**
   * Embed multiple texts - default implementation calls embedText in parallel
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embedText(text)));
  }
  
  /**
   * Get model info - must be implemented by subclasses
   */
  abstract getModelInfo(): ModelInfo;
  
  /**
   * Get rate limits - must be implemented by subclasses
   */
  abstract getRateLimits(): RateLimitInfo;
  
  /**
   * Check if provider is initialized
   */
  protected assertInitialized(): void {
    if (!this.initialized) {
      throw new Error(`${this.name} provider not initialized`);
    }
  }
  
  /**
   * Extract text content from various response formats
   */
  protected extractTextContent(content: any): string {
    if (typeof content === 'string') {
      return content;
    }
    
    if (Array.isArray(content)) {
      return content
        .map(c => {
          if (typeof c === 'string') return c;
          if (typeof c === 'object' && c && 'text' in c) return (c as any).text;
          return JSON.stringify(c);
        })
        .join('');
    }
    
    return String(content);
  }
  
  /**
   * Parse token usage from response metadata
   */
  protected parseTokenUsage(metadata: any): { prompt: number; completion: number; total: number } {
    const usage = metadata?.usage_metadata || metadata?.usage || {};
    
    const prompt = usage.prompt_tokens || usage.prompt_token_count || usage.input_tokens || 0;
    const completion = usage.completion_tokens || usage.candidates_token_count || usage.output_tokens || 0;
    const total = usage.total_tokens || prompt + completion;
    
    // Handle case where only total is available
    if (total > 0 && prompt === 0 && completion === 0) {
      return { prompt: total, completion: 0, total };
    }
    
    return { prompt, completion, total };
  }
}
