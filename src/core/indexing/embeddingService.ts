import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

/**
 * Embedding service using Google Gemini API.
 * Handles vector generation for text chunks.
 */
export class EmbeddingService {
  private embeddings: GoogleGenerativeAIEmbeddings | null = null;
  private currentApiKey: string | null = null;

  /**
   * Gets or creates an embeddings instance for the given API key.
   */
  private async getEmbeddings(apiKey: string): Promise<GoogleGenerativeAIEmbeddings> {
    if (this.embeddings && this.currentApiKey === apiKey) {
      return this.embeddings;
    }

    this.embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      model: 'embedding-001'
    });
    this.currentApiKey = apiKey;
    return this.embeddings;
  }

  /**
   * Embeds a single text chunk.
   * @param apiKey Google Gemini API key
   * @param text Text to embed
   * @returns Vector (array of numbers)
   */
  async embedText(apiKey: string, text: string): Promise<number[]> {
    const embeddings = await this.getEmbeddings(apiKey);
    const result = await embeddings.embedQuery(text);
    return result;
  }

  /**
   * Embeds multiple text chunks in batch.
   * @param apiKey Google Gemini API key
   * @param texts Array of texts to embed
   * @returns Array of vectors
   */
  async embedTexts(apiKey: string, texts: string[]): Promise<number[][]> {
    const embeddings = await this.getEmbeddings(apiKey);
    const results = await embeddings.embedDocuments(texts);
    return results;
  }
}

export const embeddingService = new EmbeddingService();

