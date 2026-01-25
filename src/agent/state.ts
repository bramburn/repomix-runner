import { Annotation } from "@langchain/langgraph";

/**
 * Processed file with compression level metadata
 */
export interface ProcessedFile {
  path: string;
  content: string;
  compressionLevel: 'full' | 'skeleton' | 'summary';
  tokens: number;
  relevanceScore: number;
}

/**
 * Defines the shared memory of the agent as it moves through the graph.
 */
export const AgentState = Annotation.Root({
  // The API key for the LLM
  apiKey: Annotation<string>,

  // The original request from the user (e.g., "Package authentication logic")
  userQuery: Annotation<string>,

  // The root path of the workspace
  workspaceRoot: Annotation<string>,

  // A complete list of all file paths found in the repository
  allFilePaths: Annotation<string[]>,

  // Phase 1 Filter: Files selected by LLM based on name/path alone
  candidateFiles: Annotation<string[]>,

  // Phase 2 Filter: Files confirmed by LLM after reading their content
  confirmedFiles: Annotation<string[]>,

  // The final repomix CLI command to execute
  finalCommand: Annotation<string>,

  // The type of objective analyzed from the query
  objectiveType: Annotation<'ACTION' | 'SEARCH' | undefined>,

  // Detailed criteria for filtering relevant files
  relevanceCriteria: Annotation<string | undefined>,

  // Output path for the generated file
  outputPath: Annotation<string | undefined>,

  // Path to the generated summary markdown file
  summaryPath: Annotation<string | undefined>,

  // Whether to generate the repomix command and output file
  generateFile: Annotation<boolean>({
    reducer: (curr, next) => next,
    default: () => false,
  }),

  // Total tokens used across all LLM calls
  totalTokens: Annotation<number>({
    reducer: (x, y) => x + y, // Adds new usage to existing total
    default: () => 0,
  }),

  // === Semantic Folding Fields ===

  // Token budget from settings (20k/35k/50k/75k/100k)
  tokenBudget: Annotation<number>({
    reducer: (curr, next) => next,
    default: () => 50000,
  }),

  // Architectural blueprint summary from repository analysis
  blueprintSummary: Annotation<string>({
    reducer: (curr, next) => next || curr,
    default: () => '',
  }),

  // Files processed with compression levels (full/skeleton/summary)
  processedFiles: Annotation<ProcessedFile[]>({
    reducer: (curr, next) => next,
    default: () => [],
  }),

  // File relevance scores from relevance check (path -> score mapping)
  fileRelevanceScores: Annotation<Record<string, number>>({
    reducer: (curr, next) => ({ ...curr, ...next }),
    default: () => ({}),
  }),
});
