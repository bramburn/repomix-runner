import type { FileEdit } from '../state.js';

/**
 * Edit mode for applying file changes.
 */
export type EditMode = 'full' | 'search_replace' | 'hybrid';

/**
 * Configuration for the file edit applier.
 */
export interface ApplyConfig {
  editMode: EditMode;
  hybridThresholdLines: number;
  fuzzyMatchThreshold: number;
}

/**
 * Result of applying a single SEARCH/REPLACE block.
 */
export interface SearchReplaceResult {
  search: string;
  replace: string;
  success: boolean;
  matchScore?: number;
  error?: string;
}

/**
 * Result of applying a single file edit.
 */
export interface ApplyResult {
  filePath: string;
  action: 'create' | 'edit' | 'delete';
  appliedMode: 'full' | 'search_replace';
  success: boolean;
  error?: string;
  searchReplaceResults?: SearchReplaceResult[];
}

/**
 * Summary of applying multiple file edits.
 */
export interface ApplySummary {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: ApplyResult[];
}
