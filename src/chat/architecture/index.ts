/**
 * Architecture module exports.
 * 
 * Provides LangGraph workflow for generating and maintaining
 * repository architecture documentation.
 */

// State
export { ArchitectureState } from './architectureState.js';
export type { ArchitectureDependencies } from './architectureState.js';

// Graph
export {
  createArchitectureGraph,
  executeArchitectureGeneration,
  type ProgressCallback,
} from './architectureGraph.js';

// Prompts
export { createArchitecturePrompt } from './prompts.js';

// Nodes
export { checkFreshnessNode } from './nodes/checkFreshness.js';
export { scanDirectoryNode } from './nodes/scanDirectory.js';
export { analyzeKeyFilesNode } from './nodes/analyzeKeyFiles.js';
export { gatherDependenciesNode } from './nodes/gatherDependencies.js';
export { generateDocumentNode } from './nodes/generateDocument.js';
export { storeDocumentNode } from './nodes/storeDocument.js';
