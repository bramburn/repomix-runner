import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../shared/logger.js';
import type {
  BatchModelConfig,
  BatchResultItem,
  BatchRemoteStatus,
  BatchSubmitRequest,
  BatchResultMetadata,
} from './types.js';

function extractTextFromResultPayload(payload: unknown): string {
  const asAny = payload as any;

  const textFromMessageContent = asAny?.result?.message?.content;
  if (Array.isArray(textFromMessageContent)) {
    return textFromMessageContent
      .map((entry: any) => (typeof entry?.text === 'string' ? entry.text : ''))
      .filter(Boolean)
      .join('\n');
  }

  if (typeof asAny?.result?.message?.content === 'string') {
    return asAny.result.message.content;
  }

  if (typeof asAny?.result?.text === 'string') {
    return asAny.result.text;
  }

  if (typeof asAny?.response?.output_text === 'string') {
    return asAny.response.output_text;
  }

  return '';
}

function mapResultType(raw: unknown): BatchResultItem['type'] {
  const type = String((raw as any)?.result?.type ?? (raw as any)?.type ?? '').toLowerCase();

  if (type.includes('succeed')) {
    return 'succeeded';
  }
  if (type.includes('error') || type.includes('fail')) {
    return 'errored';
  }
  if (type.includes('cancel')) {
    return 'canceled';
  }
  if (type.includes('expire')) {
    return 'expired';
  }

  return 'unknown';
}

interface BatchRetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const DEFAULT_RETRY_OPTIONS: BatchRetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
};

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ENOTFOUND',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableBatchError(error: unknown): boolean {
  const maybeError = error as {
    status?: number;
    statusCode?: number;
    code?: string;
    cause?: { code?: string };
    message?: string;
  };
  const status = maybeError.status ?? maybeError.statusCode;
  if (typeof status === 'number' && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  const code = maybeError.code ?? maybeError.cause?.code;
  if (typeof code === 'string' && RETRYABLE_ERROR_CODES.has(code)) {
    return true;
  }

  if (typeof maybeError.message === 'string') {
    const normalized = maybeError.message.toLowerCase();
    return (
      normalized.includes('timeout') ||
      normalized.includes('temporarily unavailable') ||
      normalized.includes('rate limit') ||
      normalized.includes('too many requests')
    );
  }

  return false;
}

function getRetryDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponential * 0.2)));
  return exponential + jitter;
}

export class AnthropicBatchClient {
  private readonly client: Anthropic;
  private readonly retryOptions: BatchRetryOptions;

  constructor(apiKey: string, options?: Partial<BatchRetryOptions>) {
    this.client = new Anthropic({ apiKey });
    this.retryOptions = {
      ...DEFAULT_RETRY_OPTIONS,
      ...options,
    };
  }

  private async withRetry<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    const maxRetries = Math.max(0, this.retryOptions.maxRetries);
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const retryable = isRetryableBatchError(error);
        if (!retryable || attempt >= maxRetries) {
          throw error;
        }

        const delayMs = getRetryDelayMs(
          attempt,
          this.retryOptions.baseDelayMs,
          this.retryOptions.maxDelayMs
        );
        logger.both.warn(
          `[AnthropicBatchClient] ${operation} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms`,
          error
        );
        await sleep(delayMs);
      }
    }
  }

  async submitBatch(
    requests: BatchSubmitRequest[],
    modelConfig: BatchModelConfig
  ): Promise<{ batchApiId: string }> {
    const response = await this.withRetry('submitBatch', () =>
      this.client.messages.batches.create({
        requests: requests.map((request) => ({
          custom_id: request.customId,
          params: {
            model: modelConfig.model,
            max_tokens: modelConfig.maxTokens,
            thinking: {
              type: 'enabled',
              budget_tokens: modelConfig.thinkingBudgetTokens,
            },
            messages: [{ role: 'user', content: request.prompt }],
          },
        })),
      } as any)
    );

    return { batchApiId: response.id };
  }

  async getBatchStatus(batchApiId: string): Promise<BatchRemoteStatus> {
    const response = await this.withRetry('getBatchStatus', () =>
      this.client.messages.batches.retrieve(batchApiId)
    );
    return {
      id: response.id,
      processingStatus: String((response as any).processing_status ?? 'unknown'),
      raw: response,
    };
  }

  async getBatchResults(batchApiId: string): Promise<BatchResultItem[]> {
    const stream = (await this.withRetry('getBatchResults', () =>
      (this.client.messages.batches as any).results(batchApiId)
    )) as AsyncIterable<any>;
    const items: BatchResultItem[] = [];

    for await (const entry of stream) {
      const customId = String(entry?.custom_id ?? entry?.customId ?? '');
      items.push({
        customId,
        type: mapResultType(entry),
        responseText: extractTextFromResultPayload(entry),
        errorMessage: (entry as any)?.result?.error?.message ?? (entry as any)?.error?.message,
        raw: entry,
      });
    }

    return items;
  }

  async cancelBatch(batchApiId: string): Promise<void> {
    await this.withRetry('cancelBatch', () => (this.client.messages.batches as any).cancel(batchApiId));
  }

  /**
   * Streams batch results directly to disk to avoid memory bloat.
   * Returns lightweight metadata instead of full response content.
   *
   * @param batchApiId - The Anthropic batch API ID
   * @param outputDir - Directory to write response files (e.g., .repomix/incoming/{batchId}/)
   * @returns Metadata about the streamed results including file paths
   */
  async streamBatchResults(
    batchApiId: string,
    outputDir: string
  ): Promise<BatchResultMetadata[]> {
    const stream = (await this.withRetry('streamBatchResults', () =>
      (this.client.messages.batches as any).results(batchApiId)
    )) as AsyncIterable<any>;
    const metadataList: BatchResultMetadata[] = [];

    // Ensure output directory exists (async to avoid blocking event loop)
    await fsPromises.mkdir(outputDir, { recursive: true });

    let index = 0;
    for await (const entry of stream) {
      const customId = String(entry?.custom_id ?? entry?.customId ?? `unknown-${index}`);
      const resultType = mapResultType(entry);
      const responseText = extractTextFromResultPayload(entry);
      const errorMessage = (entry as any)?.result?.error?.message ?? (entry as any)?.error?.message;

      // Extract token counts if available
      const usage = (entry as any)?.result?.message?.usage ?? (entry as any)?.usage;
      const tokensInput = usage?.input_tokens ?? usage?.prompt_tokens ?? undefined;
      const tokensOutput = usage?.output_tokens ?? usage?.completion_tokens ?? undefined;

      // Write response text to file (async to avoid blocking event loop)
      const responseFileName = `${customId}.txt`;
      const responseFilePath = path.join(outputDir, responseFileName);

      await fsPromises.writeFile(responseFilePath, responseText, 'utf-8');

      // Also write the raw JSON entry for debugging
      const rawFilePath = path.join(outputDir, `${customId}.json`);
      await fsPromises.writeFile(rawFilePath, JSON.stringify(entry, null, 2), 'utf-8');

      metadataList.push({
        customId,
        type: resultType,
        errorMessage,
        responseFilePath,
        tokensInput,
        tokensOutput,
      });

      index++;
    }

    return metadataList;
  }
}
