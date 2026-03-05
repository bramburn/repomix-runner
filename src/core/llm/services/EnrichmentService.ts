import type { LLMProviderManager } from '../LLMProviderManager';

/**
 * Options for enrichment operations
 */
export interface EnrichmentOptions {
  provider?: string;
  model?: string;
}

/**
 * Service for code enrichment (summaries, signatures, etc.)
 */
export class EnrichmentService {
  constructor(private manager: LLMProviderManager) {}
  
  /**
   * Generate summary for code snippet
   */
  async generateSummary(codeSnippet: string, options?: EnrichmentOptions): Promise<string> {
    const prompt = `Summarize what this code does in 5-10 words. Output ONLY the summary in quotes like "this function does X":\n\`\`\`\n${codeSnippet}\n\`\`\``;
    
    const providerId = options?.provider || this.manager.getDefaultProvider().id;
    const provider = this.manager.getProvider(providerId);
    
    // Start tracking operation
    const tracker = this.manager.startOperation(providerId, 'text_generation');
    
    try {
      const result = await this.manager.executeWithRetry(
        providerId,
        () => provider.generateText(prompt, { temperature: 0.3, maxTokens: 100 }),
        { maxRetries: 3 }
      );
      
      tracker.complete(result.tokens);
      
      // Extract summary from response (handle quoted output)
      return this.extractSummary(result.content);
    } catch (error) {
      tracker.fail(error as Error);
      throw error;
    }
  }
  
  /**
   * Extract summary from LLM response
   */
  private extractSummary(rawOutput: string): string {
    // Try to extract quoted text
    const quoteMatches = rawOutput.match(/"([^"]+)"/g);
    if (quoteMatches && quoteMatches.length > 0) {
      const lastQuote = quoteMatches[quoteMatches.length - 1];
      return lastQuote.replace(/^"|"$/g, '').trim();
    }
    
    // Fallback: return cleaned raw output
    return rawOutput.trim();
  }
}
