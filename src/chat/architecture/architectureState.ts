import { Annotation } from '@langchain/langgraph';
import type { Pool } from 'pg';
import type * as vscode from 'vscode';

/**
 * Architecture generation state for repo documentation workflow.
 */
export const ArchitectureState = Annotation.Root({
  // Runtime context - not serialized, passed at graph creation
  pgPool: Annotation<Pool | null>({
    default: () => null,
    reducer: (_, y) => y,
  }),
  secrets: Annotation<vscode.ExtensionContext['secrets'] | null>({
    default: () => null,
    reducer: (_, y) => y,
  }),
  // Repository identification
  repoId: Annotation<string>(),
  repoRoot: Annotation<string>(),
  
  // Git state tracking
  gitHead: Annotation<string | null>({
    reducer: (_, y) => y,
    default: () => null,
  }),
  
  // Directory structure with classification
  directoryTree: Annotation<any>({
    reducer: (_, y) => y,
    default: () => ({}),
  }),
  
  // Key files with purposes
  keyFiles: Annotation<Array<{ path: string; purpose: string }>>({
    reducer: (_, y) => y,
    default: () => [],
  }),
  
  // Project dependencies
  dependencies: Annotation<Record<string, string>>({
    reducer: (_, y) => y,
    default: () => ({}),
  }),
  
  // Generated markdown document
  markdownDocument: Annotation<string>({
    reducer: (_, y) => y,
    default: () => '',
  }),
  
  // Freshness flag - if true, skip regeneration
  isFresh: Annotation<boolean>({
    reducer: (_, y) => y,
    default: () => false,
  }),
  
  // Token usage tracking
  tokensUsed: Annotation<number>({
    reducer: (x, y) => x + y,
    default: () => 0,
  }),
});

/**
 * Dependencies needed for architecture graph execution.
 */
export interface ArchitectureDependencies {
  pgPool: Pool;
  secrets: vscode.ExtensionContext['secrets'];
}
