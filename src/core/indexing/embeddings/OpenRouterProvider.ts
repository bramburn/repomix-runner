import { OpenRouter } from '@openrouter/sdk';
import { IEmbeddingProvider } from './types';

interface OpenRouterProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimension: number;
  provider?: {
    order?: string[];
    allow_fallbacks?: boolean;
    quantizations?: string[];
  };
}

export class OpenRouterProvider implements IEmbeddingProvider {
  private client: OpenRouter;
  private config: OpenRouterProviderConfig;

  constructor(config: OpenRouterProviderConfig) {
    this.config = config;
    this.client = new OpenRouter({
      apiKey: config.apiKey,
      serverURL: config.baseUrl,
    });
  }

  private buildProviderPreferences(): any {
    if (!this.config.provider) {
      return undefined;
    }

    const prefs: any = {};
    
    // Only add provider order if specified
    if (this.config.provider.order && this.config.provider.order.length > 0) {
      prefs.order = this.config.provider.order;
    }
    
    // Add allowFallbacks (defaults to true for better reliability)
    prefs.allowFallbacks = this.config.provider.allow_fallbacks ?? true;
    
    // Only add quantizations if explicitly specified and not empty
    // Note: Some models may not support specific quantizations, causing "No endpoints found" errors
    if (this.config.provider.quantizations && this.config.provider.quantizations.length > 0) {
      prefs.quantizations = this.config.provider.quantizations;
    }
    
    // Return undefined if no preferences are set (let OpenRouter choose optimally)
    return Object.keys(prefs).length > 0 ? prefs : undefined;
  }

  getDimensions(): number {
    return this.config.dimension;
  }

  async embedText(text: string): Promise<number[]> {
    const startTime = Date.now();
    const textLength = text.length;
    console.log(`[OPENROUTER_PROVIDER] Starting single text embedding (length: ${textLength} chars)`);

    try {
      const response = await this.client.embeddings.generate({
        requestBody: {
          model: this.config.model,
          input: text,
          encodingFormat: 'float',
          provider: this.buildProviderPreferences(),
        },
      });

      if (typeof response === 'string') {
        throw new Error('Invalid response from OpenRouter API');
      }

      const embedding = response.data?.[0]?.embedding;
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('No embedding returned from OpenRouter API');
      }

      const duration = Date.now() - startTime;
      console.log(`[OPENROUTER_PROVIDER] Completed single text embedding in ${duration}ms, vector size: ${embedding.length}`);

      if (embedding.length !== this.config.dimension) {
        console.warn(`[OPENROUTER_PROVIDER] Dimension mismatch: expected ${this.config.dimension}, got ${embedding.length}`);
      }

      return embedding;
    } catch (error) {
      console.error('[OPENROUTER_PROVIDER] Embedding failed:', error);
      throw error;
    }
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    const startTime = Date.now();
    const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
    console.log(`[OPENROUTER_PROVIDER] Starting batch embedding of ${texts.length} texts (${totalChars} total chars)`);

    try {
      const response = await this.client.embeddings.generate({
        requestBody: {
          model: this.config.model,
          input: texts,
          encodingFormat: 'float',
          provider: this.buildProviderPreferences(),
        },
      });

      if (typeof response === 'string') {
        throw new Error('Invalid response from OpenRouter API');
      }

      const embeddings = response.data
        ?.map((item) => item.embedding)
        .filter((embedding): embedding is number[] => Array.isArray(embedding));
      if (!embeddings || embeddings.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, got ${embeddings?.length || 0}`);
      }

      const duration = Date.now() - startTime;
      console.log(`[OPENROUTER_PROVIDER] Completed batch embedding in ${duration}ms, ${embeddings.length} vectors generated`);

      for (let i = 0; i < embeddings.length; i++) {
        if (embeddings[i].length !== this.config.dimension) {
          console.warn(`[OPENROUTER_PROVIDER] Dimension mismatch at index ${i}: expected ${this.config.dimension}, got ${embeddings[i].length}`);
        }
      }

      return embeddings;
    } catch (error) {
      console.error('[OPENROUTER_PROVIDER] Batch embedding failed:', error);
      throw error;
    }
  }
}
