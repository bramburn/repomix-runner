import { Annotation } from "@langchain/langgraph";

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
});
