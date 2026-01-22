import { StateGraph } from "@langchain/langgraph";
import { AnalysisGraphState, ProgressCallback } from "./state.js";
import * as nodes from "./nodes.js";

/**
 * Create the repository fingerprint analysis graph.
 * 
 * Flow:
 * __start__ → parsePackage → discoverConfigs → mapStructure 
 *          → analyzeArchitecture → generateGuides → finalize → __end__
 * 
 * @returns Compiled LangGraph workflow
 */
export function createFingerprintGraph() {
  const workflow = new StateGraph(AnalysisGraphState)
    // Add nodes
    .addNode("parsePackage", nodes.parsePackageNode)
    .addNode("discoverConfigs", nodes.discoverConfigsNode)
    .addNode("mapStructure", nodes.mapStructureNode)
    .addNode("analyzeArchitecture", nodes.analyzeArchitectureNode)
    .addNode("generateGuides", nodes.generateGuidesNode)
    .addNode("finalize", nodes.finalizeNode)

    // Define edges - linear flow
    .addEdge("__start__", "parsePackage")
    .addEdge("parsePackage", "discoverConfigs")
    .addEdge("discoverConfigs", "mapStructure")
    
    // Conditional edge: skip LLM nodes if no API key
    .addConditionalEdges("mapStructure", (state) => {
      if (!state.apiKey) {
        return "finalize"; // Skip LLM nodes
      }
      return "analyzeArchitecture";
    })
    
    .addEdge("analyzeArchitecture", "generateGuides")
    .addEdge("generateGuides", "finalize")
    .addEdge("finalize", "__end__");

  return workflow.compile();
}

/**
 * Initial state for the fingerprint analysis.
 */
export interface FingerprintGraphInput {
  repoId: string;
  repoRoot: string;
  apiKey?: string;
}

/**
 * Execute the fingerprint analysis graph.
 * 
 * @param input - Initial state with repo info
 * @param onProgress - Optional callback for progress updates
 * @returns Final analysis state
 */
export async function runFingerprintGraph(
  input: FingerprintGraphInput,
  onProgress?: ProgressCallback
): Promise<typeof AnalysisGraphState.State> {
  console.log('[FingerprintGraph] ===== Starting analysis =====');
  console.log(`[FingerprintGraph] Repo: ${input.repoId}`);
  console.log(`[FingerprintGraph] Root: ${input.repoRoot}`);
  console.log(`[FingerprintGraph] API Key: ${input.apiKey ? 'provided' : 'not provided'}`);

  const graph = createFingerprintGraph();
  
  // Initialize state
  const initialState = {
    repoId: input.repoId,
    repoRoot: input.repoRoot,
    apiKey: input.apiKey || '',
    packageInfo: undefined,
    configFiles: [],
    directoryStructure: undefined,
    totalFileCount: 0,
    architecturalPatterns: undefined,
    developmentGuides: undefined,
    criticalFileHashes: {},
    lastGitCommit: undefined,
    generatedAt: Date.now(),
    analysisVersion: 'v1.0',
    errors: [],
    tokensUsed: 0,
    success: false
  };

  // Define node phases for progress tracking
  const phases = [
    { node: 'parsePackage', name: 'Parsing package.json', index: 1 },
    { node: 'discoverConfigs', name: 'Discovering config files', index: 2 },
    { node: 'mapStructure', name: 'Mapping directory structure', index: 3 },
    { node: 'analyzeArchitecture', name: 'Analyzing architecture', index: 4 },
    { node: 'generateGuides', name: 'Generating guides', index: 5 },
    { node: 'finalize', name: 'Finalizing', index: 6 }
  ];
  const totalPhases = input.apiKey ? 6 : 4; // Fewer phases without LLM

  // Stream execution for progress updates
  const stream = await graph.stream(initialState as any);
  let finalState: any = initialState;

  for await (const chunk of stream) {
    const chunkRecord = chunk as Record<string, any>;
    const nodeName = Object.keys(chunkRecord)[0];
    const nodeUpdate = chunkRecord[nodeName];
    
    // Merge update into final state
    finalState = { ...finalState, ...nodeUpdate };

    // Report progress
    if (onProgress) {
      const phase = phases.find(p => p.node === nodeName);
      if (phase) {
        onProgress(phase.name, phase.index, totalPhases);
      }
    }

    console.log(`[FingerprintGraph] Completed node: ${nodeName}`);
  }

  console.log('[FingerprintGraph] ===== Analysis complete =====');
  console.log(`[FingerprintGraph] Success: ${finalState.success}`);
  console.log(`[FingerprintGraph] Tokens used: ${finalState.tokensUsed}`);
  console.log(`[FingerprintGraph] Errors: ${finalState.errors?.length || 0}`);

  return finalState as typeof AnalysisGraphState.State;
}
