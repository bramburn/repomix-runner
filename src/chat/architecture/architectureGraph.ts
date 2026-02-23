/**
 * architectureGraph - LangGraph workflow for generating repo architecture documentation.
 */
import { StateGraph } from '@langchain/langgraph';
import { ArchitectureState } from './architectureState.js';
import { checkFreshnessNode } from './nodes/checkFreshness.js';
import { scanDirectoryNode } from './nodes/scanDirectory.js';
import { analyzeKeyFilesNode } from './nodes/analyzeKeyFiles.js';
import { gatherDependenciesNode } from './nodes/gatherDependencies.js';
import { generateDocumentNode } from './nodes/generateDocument.js';
import { storeDocumentNode } from './nodes/storeDocument.js';

export type { ProgressCallback } from '../nodes/utils.js';

/**
 * Creates and compiles the architecture generation graph.
 * 
 * Graph Flow:
 * START
 *   ↓
 * checkFreshness ← compare git HEAD with stored commit + check TTL
 *   ↓
 * [Conditional: isFresh?]
 *   ├── (true) → END (return cached document)
 *   └── (false) → scanDirectory
 *         ↓
 *       analyzeKeyFiles
 *         ↓
 *       gatherDependencies
 *         ↓
 *       generateDocument ← Gemini Flash generates markdown
 *         ↓
 *       storeDocument ← Save to PostgreSQL + .repomix/architecture.md
 *         ↓
 *       END
 */
export async function createArchitectureGraph(
  onProgress?: (message: string) => void
) {
  const progress = onProgress || (() => {});

  const workflow = new StateGraph(ArchitectureState)
    // Check if regeneration is needed
    .addNode('checkFreshness', (state) => {
      progress('Checking if architecture needs refresh...');
      return checkFreshnessNode(state);
    })

    // Scan directory structure
    .addNode('scanDirectory', (state) => {
      progress('Scanning directory structure...');
      return scanDirectoryNode(state);
    })

    // Analyze key files
    .addNode('analyzeKeyFiles', (state) => {
      progress('Analyzing key files...');
      return analyzeKeyFilesNode(state);
    })

    // Gather dependencies
    .addNode('gatherDependencies', (state) => {
      progress('Gathering dependencies...');
      return gatherDependenciesNode(state);
    })

    // Generate markdown document
    .addNode('generateDocument', (state) => {
      progress('Generating architecture document...');
      return generateDocumentNode(state);
    })

    // Store document
    .addNode('storeDocument', (state) => {
      progress('Storing architecture document...');
      return storeDocumentNode(state);
    })

    // Define edges
    .addEdge('__start__', 'checkFreshness')
    
    // Conditional edge based on freshness
    .addConditionalEdges('checkFreshness', (state) => {
      if (state.isFresh) {
        return '__end__'; // Skip regeneration
      }
      return 'scanDirectory'; // Regenerate
    })

    // Linear flow for regeneration
    .addEdge('scanDirectory', 'analyzeKeyFiles')
    .addEdge('analyzeKeyFiles', 'gatherDependencies')
    .addEdge('gatherDependencies', 'generateDocument')
    .addEdge('generateDocument', 'storeDocument')
    .addEdge('storeDocument', '__end__');

  // Compile the graph
  return workflow.compile();
}

/**
 * Execute architecture generation workflow.
 * 
 * @param repoRoot - Root path of the repository
 * @param repoId - Unique repository identifier
 * @param onProgress - Optional progress callback
 * @returns Generated architecture state
 */
export async function executeArchitectureGeneration(
  repoRoot: string,
  repoId: string,
  onProgress?: (message: string) => void
): Promise<typeof ArchitectureState.State> {
  const graph = await createArchitectureGraph(onProgress);

  const initialState: Partial<typeof ArchitectureState.State> = {
    repoId,
    repoRoot,
  };

  const config = {
    configurable: {
      thread_id: `arch_${repoId}_${Date.now()}`,
    },
  };

  const result = await graph.invoke(initialState, config);
  return result;
}
