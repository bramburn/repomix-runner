import { GoogleGenAI } from '@google/genai';
import { IEmbeddingProvider } from './types';

interface GeminiConfig {
  apiKey: string;
}

export class GeminiProvider implements IEmbeddingProvider {
  private client: GoogleGenAI;
  private readonly dimensions = 768;

  constructor(config: GeminiConfig) {
    this.client = new GoogleGenAI({ apiKey: config.apiKey });
  }

  getDimensions(): number {
    return this.dimensions;
  }

  async embedText(text: string): Promise<number[]> {
    const startTime = Date.now();
    const textLength = text.length;
    console.log(`[GEMINI_PROVIDER] Starting single text embedding (length: ${textLength} chars)`);
    
    const response = await this.client.models.embedContent({
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
    console.log(`[GEMINI_PROVIDER] Completed single text embedding in ${duration}ms, vector size: ${embedding.length}`);
    
    if (embedding.length !== this.dimensions) {
      throw new Error(`Dimension mismatch: expected ${this.dimensions}, got ${embedding.length}`);
    }

    return embedding;
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    const startTime = Date.now();
    const totalChars = texts.reduce((sum, text) => sum + text.length, 0);
    console.log(`[GEMINI_PROVIDER] Starting batch embedding of ${texts.length} texts (${totalChars} total chars)`);

    const response = await this.client.models.embedContent({
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
    console.log(`[GEMINI_PROVIDER] Completed batch embedding in ${duration}ms, ${embeddings.length} vectors generated`);
    
    for (let i = 0; i < embeddings.length; i++) {
      if (embeddings[i].length !== this.dimensions) {
        throw new Error(`Dimension mismatch at index ${i}: expected ${this.dimensions}, got ${embeddings[i].length}`);
      }
    }

    return embeddings;
  }
}
