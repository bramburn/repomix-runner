import { Annotation } from "@langchain/langgraph";

// Re-export types from databaseService for convenience
export type {
  PackageInfo,
  ConfigFile,
  DirectoryNode,
  ArchitecturalPatterns,
  DevelopmentGuides,
  RepoBlueprint,
  BlueprintStatus
} from '../core/storage/databaseService.js';

/**
 * Error entry for tracking analysis failures.
 */
export interface AnalysisError {
  node: string;
  error: string;
  timestamp: number;
}

/**
 * Progress callback type for UI updates.
 */
export type ProgressCallback = (phase: string, current: number, total: number) => void;

/**
 * Defines the shared memory of the fingerprint analysis graph.
 * Uses Annotation.Root pattern consistent with existing agent/search graphs.
 */
export const AnalysisGraphState = Annotation.Root({
  // ========== Input Fields ==========
  
  /** Repository identifier (typically derived from git remote or folder name) */
  repoId: Annotation<string>,
  
  /** Absolute path to the repository root */
  repoRoot: Annotation<string>,
  
  /** Google Gemini API key for LLM calls */
  apiKey: Annotation<string>,

  // ========== Static Analysis Results ==========
  
  /** Parsed package.json information */
  packageInfo: Annotation<{
    name?: string;
    version?: string;
    framework?: string;
    language?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  } | undefined>,

  /** Discovered configuration files */
  configFiles: Annotation<Array<{
    path: string;
    type: string;
    content?: string;
  }>>,

  /** Project directory structure tree */
  directoryStructure: Annotation<{
    name: string;
    type: 'file' | 'directory';
    children?: Array<any>;
    classification?: string;
  } | undefined>,

  /** Total file count in the repository */
  totalFileCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // ========== LLM Analysis Results ==========

  /** Identified architectural patterns */
  architecturalPatterns: Annotation<{
    namingConventions?: string;
    dataFetching?: string;
    stateManagement?: string;
    formHandling?: string;
    apiConventions?: string;
    databasePatterns?: string;
  } | undefined>,

  /** Generated development how-to guides */
  developmentGuides: Annotation<{
    addPage?: string;
    addForm?: string;
    addAPI?: string;
    addDatabase?: string;
  } | undefined>,

  // ========== Invalidation Data ==========

  /** SHA256 hashes of critical files for change detection */
  criticalFileHashes: Annotation<Record<string, string>>({
    reducer: (curr, next) => ({ ...curr, ...next }),
    default: () => ({}),
  }),

  /** Git HEAD SHA at time of analysis */
  lastGitCommit: Annotation<string | undefined>,

  // ========== Metadata ==========

  /** Timestamp when analysis was performed */
  generatedAt: Annotation<number>({
    reducer: (_, next) => next,
    default: () => Date.now(),
  }),

  /** Version of the analysis schema for migrations */
  analysisVersion: Annotation<string>({
    reducer: (_, next) => next,
    default: () => 'v1.0',
  }),

  /** Accumulated errors during analysis (non-fatal) */
  errors: Annotation<AnalysisError[]>({
    reducer: (curr, next) => [...curr, ...next],
    default: () => [],
  }),

  /** Total tokens used across all LLM calls */
  tokensUsed: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0,
  }),

  /** Whether the analysis completed successfully */
  success: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
});

/** Type alias for the state object */
export type AnalysisState = typeof AnalysisGraphState.State;
