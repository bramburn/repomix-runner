export type PackageStatus =
  | 'draft'
  | 'pending'
  | 'submitted'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PackageType = 'plan' | 'code_change' | 'code_review';

export interface PackagePayload {
  goal: string;
  contextFiles: Array<{ path: string; content: string }>;
  repoArchitecture: string;
  dependencies: Record<string, string>;
  outputInstruction: PackageType;
}

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

export interface PackagePreviewData extends PackageSummary {
  contextFiles: Array<{
    path: string;
    tokenCount: number;
    content: string;
  }>;
  repoArchitecture: string;
  dependencies: Record<string, string>;
  outputInstruction: PackageType;
  rawPrompt: string;
}
