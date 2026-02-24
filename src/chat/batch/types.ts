import type { OutputInstruction, PackagePayload, FileEdit } from '../state.js';
import type { BatchJobStatus } from '../db/batchRepository.js';

export type BatchPackageType = OutputInstruction;

export interface BatchPackage extends PackagePayload {
  id: string;
  threadId: string;
  packageType: BatchPackageType;
  existingPlan?: string;       // for code_change/code_review types
  previousResponse?: string;   // for review cycles
}

export interface BatchModelConfig {
  model: string;
  maxTokens: number;
  thinkingBudgetTokens: number;
}

export interface BatchSubmitRequest {
  customId: string;
  prompt: string;
}

export interface BatchSubmitResponse {
  batchApiId: string;
  status: BatchJobStatus;
}

export interface BatchRemoteStatus {
  id: string;
  processingStatus: string;
  raw: unknown;
}

export interface BatchResultItem {
  customId: string;
  type: 'succeeded' | 'errored' | 'canceled' | 'expired' | 'unknown';
  responseText: string;
  errorMessage?: string;
  raw: unknown;
}

export interface ParseDiagnostic {
  stage: string;
  details: string;
}

export interface ParsedBatchResponse {
  fileEdits: FileEdit[];
  parseWarnings: string[];
  usedFallback: boolean;
  rawResponse: string;
  parseDiagnostics?: ParseDiagnostic[];
}

export interface BatchResultMetadata {
  customId: string;
  type: 'succeeded' | 'errored' | 'canceled' | 'expired' | 'unknown';
  errorMessage?: string;
  responseFilePath: string;
  tokensInput?: number;
  tokensOutput?: number;
}

export interface BatchCompletionResult {
  batchJobId: string;
  batchApiId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'processing' | 'submitted';
  responseText?: string;
  parseWarnings?: string[];
  rawResult?: unknown;
  errorMessage?: string;
}

export interface BatchPollerOptions {
  pollIntervalSeconds: number;
  maxDurationMs: number;
}

export interface BatchPendingView {
  batchJobId: string;
  threadId: string | null;
  batchApiId: string;
  status: BatchJobStatus;
  startedAtMs?: number;
}
