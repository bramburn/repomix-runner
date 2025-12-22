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
    const startTime = Date.now();
    const textLength = text.length;
    console.log(`[EMBEDDING_SERVICE] Starting single text embedding (length: ${textLength} chars)`);

    const embeddings = await this.getEmbeddings(apiKey);
    const result = await embeddings.embedQuery(text);

    const duration = Date.now() - startTime;
    console.log(`[EMBEDDING_SERVICE] Completed single text embedding in ${duration}ms, vector size: ${result.length}`);
    return result;
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

    const embeddings = await this.getEmbeddings(apiKey);
    const results = await embeddings.embedDocuments(texts);

    const duration = Date.now() - startTime;
    console.log(`[EMBEDDING_SERVICE] Completed batch embedding in ${duration}ms, ${results.length} vectors generated`);
    return results;
  }
}

export const embeddingService = new EmbeddingService();

