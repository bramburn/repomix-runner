import { GoogleGenAI } from '@google/genai';

/**
 * Embedding service using Google Gemini SDK directly.
 * Handles vector generation for text chunks with proper dimension control.
 */
export class EmbeddingService {
  private client: GoogleGenAI | null = null;
  private currentApiKey: string | null = null;
  private readonly dimensions = 768;

  /**
   * Gets or creates a Gemini client for the given API key.
   */
  private getClient(apiKey: string): GoogleGenAI {
    if (this.client && this.currentApiKey === apiKey) {
      return this.client;
    }

    this.client = new GoogleGenAI({ apiKey });
    this.currentApiKey = apiKey;
    return this.client;
  }

  /**
   * Embeds a single text chunk.
   * @param apiKey Google Gemini API key
   * @param text Text to embed
   * @returns Vector (array of numbers)
   */
  async embedText(apiKey: string, text: string): Promise<number[]> {
    const startTime = Date.now();
    const textLength = text.length;
    console.log(`[EMBEDDING_SERVICE] Starting single text embedding (length: ${textLength} chars)`);

    const client = this.getClient(apiKey);
    
    const response = await client.models.embedContent({
      model: 'gemini-embedding-001',
      contents: text,
      config: {
        outputDimensionality: this.dimensions,
      },
    });

    const embedding = response.embeddings?.[0]?.values;
    if (!embedding) {
      throw new Error('No embedding returned from Gemini API');
    }

    const duration = Date.now() - startTime;
    console.log(`[EMBEDDING_SERVICE] Completed single text embedding in ${duration}ms, vector size: ${embedding.length}`);
    
    // Verify dimension
    if (embedding.length !== this.dimensions) {
      throw new Error(`Dimension mismatch: expected ${this.dimensions}, got ${embedding.length}`);
    }

    return embedding;
  }

  /**
   * Embeds multiple text chunks in batch.
   * @param apiKey Google Gemini API key
   * @param texts Array of texts to embed
   * @returns Array of vectors
   */
  async embedTexts(apiKey: string, texts: string[]): Promise<number[][]> {
    const startTime = Date.now();
    const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
    console.log(`[EMBEDDING_SERVICE] Starting batch embedding of ${texts.length} texts (${totalChars} total chars)`);

    const client = this.getClient(apiKey);
    
    const response = await client.models.embedContent({
      model: 'gemini-embedding-001',
      contents: texts,
      config: {
        outputDimensionality: this.dimensions,
      },
    });

    const embeddings = response.embeddings?.map(e => e.values);
    if (!embeddings || embeddings.length !== texts.length) {
      throw new Error(`Expected ${texts.length} embeddings, got ${embeddings?.length || 0}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[EMBEDDING_SERVICE] Completed batch embedding in ${duration}ms, ${embeddings.length} vectors generated`);
    
    // Verify all dimensions
    for (let i = 0; i < embeddings.length; i++) {
      if (embeddings[i].length !== this.dimensions) {
        throw new Error(`Dimension mismatch at index ${i}: expected ${this.dimensions}, got ${embeddings[i].length}`);
      }
    }

    return embeddings;
  }
}

export const embeddingService = new EmbeddingService();
