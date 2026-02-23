import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { ExtensionContext } from 'vscode';
import type { Pool } from 'pg';
import type { PackagePayload } from '../state.js';
import { getCwd } from '../../config/getCwd.js';
import { logger } from '../../shared/logger.js';
import {
  BatchRepository,
  type BatchJob,
  type BatchJobStatus,
} from '../db/batchRepository.js';
import { AnthropicBatchClient } from './anthropicBatchClient.js';
import { parseBatchResponse } from './responseParser.js';
import { assemblePromptFromPayload } from './packageAssembler.js';
import type {
  BatchCompletionResult,
  BatchModelConfig,
  BatchPendingView,
  BatchResultItem,
  BatchSubmitRequest,
} from './types.js';

export const SECRET_ANTHROPIC_API_KEY = 'repomix.chat.anthropicApiKey';

function getBatchModelConfig(): BatchModelConfig {
  const config = vscode.workspace.getConfiguration('repomix.chat');
  return {
    model: config.get<string>('batchModel', 'claude-opus-4-20250514'),
    maxTokens: config.get<number>('batchMaxTokens', 16384),
    thinkingBudgetTokens: config.get<number>('batchThinkingBudget', 10000),
  };
}

function mapProcessingStatus(status: string): BatchCompletionResult['status'] {
  const normalized = status.toLowerCase();

  if (normalized === 'ended') {
    return 'completed';
  }
  if (normalized.includes('cancel')) {
    return 'cancelled';
  }
  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('expire')) {
    return 'failed';
  }
  if (normalized.includes('process') || normalized.includes('run') || normalized.includes('in_progress')) {
    return 'processing';
  }

  return 'submitted';
}

export class BatchManager {
  private readonly batchRepository: BatchRepository;

  constructor(
    private readonly pool: Pool,
    private readonly extensionContext: ExtensionContext
  ) {
    this.batchRepository = new BatchRepository(pool);
  }

  private async getClient(): Promise<AnthropicBatchClient> {
    const apiKey = await this.extensionContext.secrets.get(SECRET_ANTHROPIC_API_KEY);
    if (!apiKey) {
      throw new Error(
        'Anthropic API key is not configured. Save it in secrets under repomix.chat.anthropicApiKey.'
      );
    }
    return new AnthropicBatchClient(apiKey);
  }

  private extractPackageFromPayload(payload: object): PackagePayload | null {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const maybePayload = payload as {
      package?: PackagePayload;
    };

    if (!maybePayload.package || typeof maybePayload.package !== 'object') {
      return null;
    }

    return maybePayload.package;
  }

  async createDraftPackage(
    threadId: string,
    payload: PackagePayload,
    estimatedTokens?: number
  ): Promise<string> {
    const prompt = assemblePromptFromPayload(payload);
    return this.batchRepository.createBatchJob({
      threadId,
      packageType: payload.outputInstruction,
      promptPayload: {
        package: payload,
        assembledPrompt: prompt,
      },
      metadata: {
        createdBy: 'hitl_workflow',
        estimatedTokens: estimatedTokens ?? null,
      },
    });
  }

  async submitPackage(threadId: string, payload: PackagePayload): Promise<{ batchJobId: string }> {
    const batchJobId = await this.createDraftPackage(threadId, payload);
    return this.submitExistingPackage(batchJobId);
  }

  async submitExistingPackage(batchJobId: string): Promise<{ batchJobId: string }> {
    const job = await this.batchRepository.getBatchJob(batchJobId);
    if (!job) {
      throw new Error('Package not found.');
    }

    if (
      job.status === 'submitted' ||
      job.status === 'processing' ||
      job.status === 'completed' ||
      job.status === 'cancelled'
    ) {
      return { batchJobId: job.id };
    }

    const payload = this.extractPackageFromPayload(job.promptPayload);
    if (!payload) {
      throw new Error('Package payload is missing or invalid.');
    }

    const prompt = assemblePromptFromPayload(payload);
    try {
      const client = await this.getClient();
      const request: BatchSubmitRequest = {
        customId: batchJobId,
        prompt,
      };

      const submitResult = await client.submitBatch([request], getBatchModelConfig());

      await this.batchRepository.updateBatchJob(batchJobId, {
        batchApiId: submitResult.batchApiId,
        status: 'submitted',
        submittedAt: new Date(),
        promptPayload: {
          package: payload,
          assembledPrompt: prompt,
        } as unknown as object,
      });

      return { batchJobId };
    } catch (error) {
      await this.batchRepository.updateBatchJob(batchJobId, {
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async listPackages(filter?: {
    threadId?: string;
    status?: BatchJobStatus;
    packageType?: 'plan' | 'code_change' | 'code_review';
  }): Promise<BatchJob[]> {
    const jobs = await this.batchRepository.listBatchJobs(filter?.threadId);
    return jobs.filter((job) => {
      if (filter?.status && job.status !== filter.status) {
        return false;
      }
      if (filter?.packageType && job.packageType !== filter.packageType) {
        return false;
      }
      return true;
    });
  }

  async getPackagePreview(batchJobId: string): Promise<BatchJob | null> {
    return this.batchRepository.getBatchJob(batchJobId);
  }

  async approvePackage(batchJobId: string): Promise<void> {
    const job = await this.batchRepository.getBatchJob(batchJobId);
    if (!job) {
      throw new Error('Package not found.');
    }
    if (job.status !== 'draft') {
      throw new Error('Only draft packages can be approved.');
    }
    await this.batchRepository.updateBatchJob(batchJobId, { status: 'pending' });
  }

  async unapprovePackage(batchJobId: string): Promise<void> {
    const job = await this.batchRepository.getBatchJob(batchJobId);
    if (!job) {
      throw new Error('Package not found.');
    }
    if (job.status !== 'pending') {
      throw new Error('Only approved packages can be moved back to draft.');
    }
    await this.batchRepository.updateBatchJob(batchJobId, { status: 'draft' });
  }

  async sendAllApproved(): Promise<{ submitted: string[]; failed: string[] }> {
    const approved = await this.batchRepository.getBatchesByStatus('pending');
    const submitted: string[] = [];
    const failed: string[] = [];

    for (const job of approved) {
      try {
        const result = await this.submitExistingPackage(job.id);
        submitted.push(result.batchJobId);
      } catch (error) {
        failed.push(job.id);
        logger.both.warn(`BatchManager: failed to submit approved package ${job.id}`, error);
      }
    }

    return { submitted, failed };
  }

  async cancelBatch(batchJobId: string): Promise<void> {
    const job = await this.batchRepository.getBatchJob(batchJobId);
    if (!job) {
      throw new Error('Package not found.');
    }
    if (!job.batchApiId) {
      throw new Error('Batch API ID is not available for this package.');
    }

    const client = await this.getClient();
    await client.cancelBatch(job.batchApiId);
    await this.batchRepository.updateBatchJob(batchJobId, {
      status: 'cancelled',
      completedAt: new Date(),
    });
  }

  async deletePackage(batchJobId: string): Promise<void> {
    const job = await this.batchRepository.getBatchJob(batchJobId);
    if (!job) {
      return;
    }

    if (job.status !== 'draft' && job.status !== 'failed') {
      throw new Error('Only draft or failed packages can be deleted.');
    }

    await this.batchRepository.deleteBatchJob(batchJobId);
  }

  async updateDraftPackage(
    batchJobId: string,
    patch: {
      goal?: string;
      outputInstruction?: 'plan' | 'code_change' | 'code_review';
    }
  ): Promise<void> {
    const job = await this.batchRepository.getBatchJob(batchJobId);
    if (!job) {
      throw new Error('Package not found.');
    }
    if (job.status !== 'draft') {
      throw new Error('Only draft packages can be edited.');
    }

    const payload = this.extractPackageFromPayload(job.promptPayload);
    if (!payload) {
      throw new Error('Package payload is missing or invalid.');
    }

    const nextPayload: PackagePayload = {
      ...payload,
      goal: patch.goal ?? payload.goal,
      outputInstruction: patch.outputInstruction ?? payload.outputInstruction,
    };
    const nextPrompt = assemblePromptFromPayload(nextPayload);

    await this.batchRepository.updateBatchJob(batchJobId, {
      packageType: nextPayload.outputInstruction,
      promptPayload: {
        package: nextPayload,
        assembledPrompt: nextPrompt,
      },
    });
  }

  async getPendingBatches(threadId?: string): Promise<BatchPendingView[]> {
    const pending = await this.batchRepository.getPendingBatches();
    return pending
      .filter((job) => !threadId || job.threadId === threadId)
      .filter((job) => typeof job.batchApiId === 'string' && job.batchApiId.length > 0)
      .map((job) => ({
        batchJobId: job.id,
        threadId: job.threadId,
        batchApiId: job.batchApiId!,
        status: job.status,
      }));
  }

  async pollBatchJob(batchJobId: string): Promise<BatchCompletionResult> {
    const job = await this.batchRepository.getBatchJob(batchJobId);
    if (!job) {
      return {
        batchJobId,
        batchApiId: '',
        status: 'failed',
        errorMessage: 'Batch job not found.',
      };
    }

    if (!job.batchApiId) {
      return {
        batchJobId: job.id,
        batchApiId: '',
        status: 'failed',
        errorMessage: 'Batch API ID missing for job.',
      };
    }

    const client = await this.getClient();
    const remote = await client.getBatchStatus(job.batchApiId);
    const mappedStatus = mapProcessingStatus(remote.processingStatus);

    if (mappedStatus === 'processing' || mappedStatus === 'submitted') {
      await this.batchRepository.updateBatchJob(job.id, {
        status: mappedStatus === 'processing' ? 'processing' : 'submitted',
      });
      return {
        batchJobId: job.id,
        batchApiId: job.batchApiId,
        status: mappedStatus,
      };
    }

    if (mappedStatus === 'cancelled') {
      await this.batchRepository.updateBatchJob(job.id, {
        status: 'cancelled',
        completedAt: new Date(),
      });
      return {
        batchJobId: job.id,
        batchApiId: job.batchApiId,
        status: 'cancelled',
      };
    }

    if (mappedStatus === 'failed') {
      await this.batchRepository.updateBatchJob(job.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: `Remote batch status: ${remote.processingStatus}`,
      });
      return {
        batchJobId: job.id,
        batchApiId: job.batchApiId,
        status: 'failed',
        errorMessage: `Remote batch status: ${remote.processingStatus}`,
      };
    }

    const results = await client.getBatchResults(job.batchApiId);
    const targetResult = results.find((item) => item.customId === job.id) ?? results[0];

    if (!targetResult) {
      await this.batchRepository.updateBatchJob(job.id, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: 'Batch ended without matching result payload.',
      });
      return {
        batchJobId: job.id,
        batchApiId: job.batchApiId,
        status: 'failed',
        errorMessage: 'Batch ended without matching result payload.',
      };
    }

    return this.finalizeCompletedResult(job.id, job.batchApiId, targetResult);
  }

  private async finalizeCompletedResult(
    batchJobId: string,
    batchApiId: string,
    resultItem: BatchResultItem
  ): Promise<BatchCompletionResult> {
    const parseResult = parseBatchResponse(resultItem.responseText);

    await this.batchRepository.updateBatchJob(batchJobId, {
      status: resultItem.type === 'succeeded' ? 'completed' : 'failed',
      responsePayload: {
        rawResult: resultItem.raw,
        responseText: resultItem.responseText,
        parseWarnings: parseResult.parseWarnings,
        parsedEditsCount: parseResult.fileEdits.length,
      },
      completedAt: new Date(),
      errorMessage: resultItem.type === 'succeeded' ? undefined : resultItem.errorMessage,
    });

    await this.persistIncomingArtifacts(batchApiId, resultItem.responseText, resultItem.raw, parseResult.parseWarnings);

    return {
      batchJobId,
      batchApiId,
      status: resultItem.type === 'succeeded' ? 'completed' : 'failed',
      responseText: resultItem.responseText,
      parseWarnings: parseResult.parseWarnings,
      rawResult: resultItem.raw,
      errorMessage: resultItem.errorMessage,
    };
  }

  private async persistIncomingArtifacts(
    batchApiId: string,
    responseText: string,
    rawResult: unknown,
    parseWarnings: string[]
  ): Promise<void> {
    try {
      const incomingDir = path.join(getCwd(), '.repomix', 'incoming', batchApiId);
      await fs.mkdir(incomingDir, { recursive: true });
      await fs.writeFile(path.join(incomingDir, 'response.txt'), responseText, 'utf-8');
      await fs.writeFile(path.join(incomingDir, 'raw.json'), JSON.stringify(rawResult, null, 2), 'utf-8');
      await fs.writeFile(path.join(incomingDir, 'parse-warnings.json'), JSON.stringify(parseWarnings, null, 2), 'utf-8');
    } catch (error) {
      logger.both.warn('BatchManager: Failed to persist incoming artifacts', error);
    }
  }
}
