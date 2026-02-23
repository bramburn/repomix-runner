import { Annotation } from '@langchain/langgraph';

/**
 * Architecture generation state for repo documentation workflow.
 */
export const ArchitectureState = Annotation.Root({
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
