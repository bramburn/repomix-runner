import { IEmbeddingProvider } from './types';

interface LMStudioConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  dimension: number;
}

export class LMStudioProvider implements IEmbeddingProvider {
  private config: LMStudioConfig;

  constructor(config: LMStudioConfig) {
    this.config = config;
  }

  async embedText(text: string): Promise<number[]> {
    const startTime = Date.now();
    const textLength = text.length;
    console.log(`[LMSTUDIO_PROVIDER] Starting single text embedding (length: ${textLength} chars)`);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add API key if provided (LM Studio supports optional auth)
      if (this.config.apiKey && this.config.apiKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(`${this.config.baseUrl}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.config.model,
          input: text,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[LMSTUDIO_PROVIDER] API request failed: ${response.status} ${response.statusText}`, errorBody);
        throw new Error(`LM Studio API request failed: ${response.statusText} (${response.status})`);
      }

      const data = await response.json();
      
      // Handle different response formats
      let embedding: number[] | undefined;
      
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        // OpenAI-style response: { data: [{ embedding: [...] }] }
        embedding = data.data[0].embedding;
      } else if (data.embedding) {
        // Direct embedding response
        embedding = data.embedding;
      }

      if (!embedding || !Array.isArray(embedding)) {
        console.error('[LMSTUDIO_PROVIDER] Invalid response format:', data);
        throw new Error('Invalid response from LM Studio API: missing or malformed embedding');
      }

      const duration = Date.now() - startTime;
      console.log(`[LMSTUDIO_PROVIDER] Completed single text embedding in ${duration}ms, vector size: ${embedding.length}`);

      if (embedding.length !== this.config.dimension) {
        console.warn(`[LMSTUDIO_PROVIDER] Dimension mismatch: expected ${this.config.dimension}, got ${embedding.length}`);
        // Don't throw error, but log warning - some models might return different dimensions
      }

      return embedding;
    } catch (error) {
      console.error('[LMSTUDIO_PROVIDER] Embedding failed:', error);
      throw error;
    }
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    // For now, parallelize individual requests
    // LM Studio might support batch embedding in future versions
    const promises = texts.map(text => this.embedText(text));
    return Promise.all(promises);
  }

  getDimensions(): number {
    return this.config.dimension;
  }
}