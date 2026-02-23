import Anthropic from '@anthropic-ai/sdk';
import type {
  BatchModelConfig,
  BatchResultItem,
  BatchRemoteStatus,
  BatchSubmitRequest,
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

export class AnthropicBatchClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async submitBatch(
    requests: BatchSubmitRequest[],
    modelConfig: BatchModelConfig
  ): Promise<{ batchApiId: string }> {
    const response = await this.client.messages.batches.create({
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
    } as any);

    return { batchApiId: response.id };
  }

  async getBatchStatus(batchApiId: string): Promise<BatchRemoteStatus> {
    const response = await this.client.messages.batches.retrieve(batchApiId);
    return {
      id: response.id,
      processingStatus: String((response as any).processing_status ?? 'unknown'),
      raw: response,
    };
  }

  async getBatchResults(batchApiId: string): Promise<BatchResultItem[]> {
    const stream = await (this.client.messages.batches as any).results(batchApiId);
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
    await (this.client.messages.batches as any).cancel(batchApiId);
  }
}
