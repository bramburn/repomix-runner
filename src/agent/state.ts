import { Annotation } from "@langchain/langgraph";

/**
 * Defines the shared memory of the agent as it moves through the graph.
 */
export const AgentState = Annotation.Root({
  // The original request from the user
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

  // API Key for Gemini
  apiKey: Annotation<string>,
});