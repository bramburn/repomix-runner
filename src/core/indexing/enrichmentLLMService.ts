import { enrichmentRepository, type CodeEnrichment } from './enrichmentRepository.js';
import type { EmbeddingProviderConfig } from './embeddingService.js';

/**
 * Configuration for enrichment LLM service
 */
export interface EnrichmentLLMConfig {
  provider: 'gemini' | 'ollama' | 'lmstudio' | 'openrouter';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export class EnrichmentLLMService {
  private config: EnrichmentLLMConfig | null = null;
  private initialized = false;

  /**
   * Configure the enrichment LLM service
   */
  configure(config: EnrichmentLLMConfig): void {
    this.config = config;
    this.initialized = true;
    console.log(
      `[EnrichmentLLMService] Configured with provider: ${config.provider}`
    );
  }

  /**
   * Check if the service is configured
   */
  isConfigured(): boolean {
    return this.initialized && this.config !== null;
  }

  /**
   * Generate a summary for a code snippet using the configured LLM
   */
  async generateSummary(codeSnippet: string): Promise<string> {
    if (!this.config) {
      throw new Error(
        'EnrichmentLLMService not configured. Call configure() first.'
      );
    }

    const prompt = `Summarize what this code does in 5-10 words. Output ONLY the summary in quotes like "this function does X":\n\`\`\`\n${codeSnippet}\n\`\`\``;

    const response = await this.callLLM(prompt);
    return this.extractSummary(response);
  }

  /**
   * Call the LLM with a prompt
   */
  private async callLLM(prompt: string): Promise<string> {
    if (!this.config) {
      throw new Error('LLM service not configured');
    }

    switch (this.config.provider) {
      case 'gemini':
        return this.callGemini(prompt);
      case 'ollama':
      case 'lmstudio':
      case 'openrouter':
        return this.callOpenAICompatible(prompt);
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  /**
   * Call Gemini API for summary generation
   */
  private async callGemini(prompt: string): Promise<string> {
    const apiKey = this.config?.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 100,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * Call OpenAI-compatible endpoint (Ollama, LM Studio, OpenRouter)
   */
  private async callOpenAICompatible(prompt: string): Promise<string> {
    const baseUrl = this.config?.baseUrl || 'http://localhost:11434/v1';
    const apiKey = this.config?.apiKey || 'not-needed';
    const model = this.config?.model || 'llama3';

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `${this.config?.provider} API error: ${response.status} - ${error}`
      );
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    // Handle reasoning models (like Qwen)
    return (message as any)?.reasoning_content || message?.content || '';
  }

  /**
   * Extract summary from LLM response
   * Looks for quoted text which contains the actual summary
   */
  private extractSummary(rawOutput: string): string {
    // Try to extract quoted text (common pattern for summaries)
    const quoteMatches = rawOutput.match(/"([^"]+)"/g);
    if (quoteMatches && quoteMatches.length > 0) {
      // Take the last quoted string (usually the final answer in reasoning models)
      const lastQuote = quoteMatches[quoteMatches.length - 1];
      return lastQuote.replace(/^"|"$/g, '').trim();
    }

    // Fallback: return the raw output cleaned up
    return rawOutput.trim();
  }

  /**
   * Generate and store enrichment for a single symbol
   */
  async generateAndStoreEnrichment(
    filePath: string,
    repoId: string,
    symbolName: string,
    symbolType: string,
    signature: string,
    codeSnippet: string,
    lineStart: number,
    lineEnd: number,
    gitCommit?: string
  ): Promise<void> {
    const summary = await this.generateSummary(codeSnippet);

    await enrichmentRepository.upsert({
      file_path: filePath,
      repo_id: repoId,
      symbol_name: symbolName,
      symbol_type: symbolType as CodeEnrichment['symbol_type'],
      summary,
      signature,
      line_start: lineStart,
      line_end: lineEnd,
      git_commit: gitCommit,
    });

    console.log(
      `[EnrichmentLLMService] Stored enrichment for ${symbolName}: ${summary}`
    );
  }

  /**
   * Get enrichments for a file
   */
  async getEnrichmentsForFile(
    filePath: string,
    repoId: string
  ): Promise<CodeEnrichment[]> {
    return enrichmentRepository.getByFile(filePath, repoId);
  }
}

export const enrichmentLLMService = new EnrichmentLLMService();
