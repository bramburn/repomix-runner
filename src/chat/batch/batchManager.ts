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
  BatchResultMetadata,
} from './types.js';

export const SECRET_ANTHROPIC_API_KEY = 'repomix.chat.anthropicApiKey';
const MAX_PACKAGE_GOAL_LENGTH = 8000;

function getBatchModelConfig(): BatchModelConfig {
  const config = vscode.workspace.getConfiguration('repomix.chat');
  return {
    model: config.get<string>('batchModel', 'claude-opus-4-20250514'),
    maxTokens: config.get<number>('batchMaxTokens', 16384),
    thinkingBudgetTokens: config.get<number>('batchThinkingBudget', 10000),
  };
}

function getBatchOperationalConfig(): {
  sendAllApprovedLimit: number;
  apiMaxRetries: number;
  apiBaseRetryMs: number;
  apiMaxRetryMs: number;
} {
  const config = vscode.workspace.getConfiguration('repomix.chat');
  return {
    sendAllApprovedLimit: config.get<number>('batchSendAllLimit', 100),
    apiMaxRetries: config.get<number>('batchApiMaxRetries', 3),
    apiBaseRetryMs: config.get<number>('batchApiRetryBaseMs', 1000),
    apiMaxRetryMs: config.get<number>('batchApiRetryMaxMs', 8000),
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
        'Anthropic API key is not configured. Set it in the Repomix Runner Control Panel → Settings tab.'
      );
    }
    const config = getBatchOperationalConfig();
    return new AnthropicBatchClient(apiKey, {
      maxRetries: config.apiMaxRetries,
      baseDelayMs: config.apiBaseRetryMs,
      maxDelayMs: config.apiMaxRetryMs,
    });
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
        errorMessage: null as unknown as undefined,
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

  async sendAllApproved(): Promise<{ submitted: string[]; failed: string[]; skipped: string[]; batchApiId?: string }> {
    const approved = await this.batchRepository.getBatchesByStatus('pending');
    const { sendAllApprovedLimit } = getBatchOperationalConfig();
    const boundedLimit = Math.max(1, sendAllApprovedLimit);
    const selected = approved.slice(0, boundedLimit);
    const skipped = approved.slice(boundedLimit).map((job) => job.id);
    const submitted: string[] = [];
    const failed: string[] = [];

    if (skipped.length > 0) {
      logger.both.warn(
        `BatchManager: sendAllApproved limited to ${boundedLimit} jobs; skipped ${skipped.length} pending package(s).`
      );
    }

    if (selected.length === 0) {
      return { submitted, failed, skipped };
    }

    // Build requests for all selected packages and submit as a single batch
    const requests: BatchSubmitRequest[] = [];
    const validJobs: Array<{ id: string; payload: PackagePayload }> = [];

    for (const job of selected) {
      const payload = this.extractPackageFromPayload(job.promptPayload);
      if (!payload) {
        failed.push(job.id);
        logger.both.warn(`BatchManager: invalid payload for package ${job.id}, skipping`);
        continue;
      }
      const prompt = assemblePromptFromPayload(payload);
      requests.push({ customId: job.id, prompt });
      validJobs.push({ id: job.id, payload });
    }

    if (requests.length === 0) {
      return { submitted, failed, skipped };
    }

    try {
      const client = await this.getClient();
      const submitResult = await client.submitBatch(requests, getBatchModelConfig());

      // Update all jobs with the shared batch API ID
      for (const { id, payload } of validJobs) {
        try {
          const prompt = assemblePromptFromPayload(payload);
          await this.batchRepository.updateBatchJob(id, {
            batchApiId: submitResult.batchApiId,
            status: 'submitted',
            submittedAt: new Date(),
            promptPayload: {
              package: payload,
              assembledPrompt: prompt,
            } as unknown as object,
          });
          submitted.push(id);
        } catch (dbError) {
          failed.push(id);
          logger.both.warn(`BatchManager: failed to update job ${id} after batch submit`, dbError);
        }
      }

      return { submitted, failed, skipped, batchApiId: submitResult.batchApiId };
    } catch (error) {
      // Mark all as failed if the single batch submission fails
      for (const { id } of validJobs) {
        failed.push(id);
        await this.batchRepository.updateBatchJob(id, {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        }).catch((e) => logger.both.warn(`BatchManager: failed to mark job ${id} as failed`, e));
      }
      logger.both.error('BatchManager: grouped batch submission failed', error);
      return { submitted, failed, skipped };
    }
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

    let nextGoal = payload.goal;
    if (patch.goal !== undefined) {
      const trimmedGoal = patch.goal.trim();
      if (!trimmedGoal) {
        throw new Error('Goal cannot be empty.');
      }
      if (trimmedGoal.length > MAX_PACKAGE_GOAL_LENGTH) {
        throw new Error(`Goal cannot exceed ${MAX_PACKAGE_GOAL_LENGTH} characters.`);
      }
      nextGoal = trimmedGoal;
    }

    const nextPayload: PackagePayload = {
      ...payload,
      goal: nextGoal,
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
        startedAtMs: job.submittedAt ?? job.createdAt,
      }));
  }

  async hasPendingBatches(threadId: string): Promise<boolean> {
    const pending = await this.getPendingBatches(threadId);
    return pending.length > 0;
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

    // Stream results directly to disk to avoid memory bloat
    const incomingDir = path.join(getCwd(), '.repomix', 'incoming', job.batchApiId);
    const metadataList = await client.streamBatchResults(job.batchApiId, incomingDir);

    // Find the result matching our job
    const targetMetadata = metadataList.find((item) => item.customId === job.id) ?? metadataList[0];

    if (!targetMetadata) {
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

    return this.finalizeCompletedResult(job.id, job.batchApiId, targetMetadata, incomingDir);
  }

  private async finalizeCompletedResult(
    batchJobId: string,
    batchApiId: string,
    metadata: BatchResultMetadata,
    incomingDir: string
  ): Promise<BatchCompletionResult> {
    // Read response text from disk (streamed by streamBatchResults)
    let responseText: string;
    try {
      responseText = await fs.readFile(metadata.responseFilePath, 'utf-8');
    } catch (error) {
      logger.both.error(`Failed to read response file: ${metadata.responseFilePath}`, error);
      await this.batchRepository.updateBatchJob(batchJobId, {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: `Failed to read response file: ${error instanceof Error ? error.message : String(error)}`,
      });
      return {
        batchJobId,
        batchApiId,
        status: 'failed',
        errorMessage: `Failed to read response file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    const parseResult = parseBatchResponse(responseText);

    // Store only lightweight metadata in DB, not the full response text
    await this.batchRepository.updateBatchJob(batchJobId, {
      status: metadata.type === 'succeeded' ? 'completed' : 'failed',
      responsePayload: {
        responseFilePath: metadata.responseFilePath,
        incomingDir,
        parseWarnings: parseResult.parseWarnings,
        parsedEditsCount: parseResult.fileEdits.length,
        tokensInput: metadata.tokensInput,
        tokensOutput: metadata.tokensOutput,
      },
      tokensInput: metadata.tokensInput,
      tokensOutput: metadata.tokensOutput,
      completedAt: new Date(),
      errorMessage: metadata.type === 'succeeded' ? undefined : metadata.errorMessage,
    });

    await this.persistParseWarnings(batchApiId, parseResult.parseWarnings, parseResult.parseDiagnostics);

    return {
      batchJobId,
      batchApiId,
      status: metadata.type === 'succeeded' ? 'completed' : 'failed',
      responseText,
      parseWarnings: parseResult.parseWarnings,
      errorMessage: metadata.errorMessage,
    };
  }

  private async persistParseWarnings(
    batchApiId: string,
    parseWarnings: string[],
    parseDiagnostics?: Array<{ stage: string; details: string }>
  ): Promise<void> {
    try {
      const incomingDir = path.join(getCwd(), '.repomix', 'incoming', batchApiId);
      await fs.mkdir(incomingDir, { recursive: true });
      await fs.writeFile(
        path.join(incomingDir, 'parse-warnings.json'),
        JSON.stringify({ warnings: parseWarnings, diagnostics: parseDiagnostics }, null, 2),
        'utf-8'
      );
    } catch (error) {
      logger.both.warn('BatchManager: Failed to persist parse warnings', error);
    }
  }
}
