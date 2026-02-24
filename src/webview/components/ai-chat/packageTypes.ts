/**
 * Shared types for the Package Manager UI (PRD 006).
 *
 * These mirror the Zod schemas in messageSchemas.ts and the DB
 * model in batchRepository.ts so that every component agrees on shape.
 */

export type PackageStatus =
  | 'draft'
  | 'pending'
  | 'submitted'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PackageType = 'plan' | 'code_change' | 'code_review';

/** Lightweight summary returned by the `packageList` message. */
export interface PackageSummary {
  id: string;
  threadId: string | null;
  batchApiId: string | null;
  status: PackageStatus;
  packageType: PackageType;
  goal: string;
  contextFileCount: number;
  estimatedTokens: number;
  tokensInput: number | null;
  tokensOutput: number | null;
  costUsd: number | null;
  createdAt: number;
  submittedAt: number | null;
  completedAt: number | null;
  errorMessage: string | null;
}

/** Payload assembled during the HITL workflow and stored in promptPayload. */
export interface PackagePayload {
  goal: string;
  contextFiles: Array<{ path: string; content: string }>;
  repoArchitecture?: string;
  dependencies?: Record<string, string>;
  outputInstruction: PackageType;
}

/** Context file entry enriched with token count for the preview modal. */
export interface PackagePreviewContextFile {
  path: string;
  tokenCount: number;
  content: string;
  compressionLevel?: string;
}

/** Full detail payload returned by the `packagePreview` message. */
export interface PackagePreviewData extends PackageSummary {
  contextFiles: PackagePreviewContextFile[];
  repoArchitecture: string;
  dependencies: Record<string, string>;
  outputInstruction: PackageType;
  rawPrompt: string;
}
