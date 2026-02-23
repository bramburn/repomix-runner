/**
 * storeDocumentNode - Persists architecture document to PostgreSQL and local file.
 * 
 * Saves to repo_architecture table and writes .repomix/architecture.md
 */
import * as fs from 'fs';
import * as path from 'path';
import { ArchitectureRepository } from '../../db/architectureRepository.js';
import type { ArchitectureState } from '../architectureState.js';

export async function storeDocumentNode(
  state: typeof ArchitectureState.State
): Promise<Partial<typeof ArchitectureState.State>> {
  console.log('[Architecture] storeDocumentNode: Storing architecture document...');

  try {
    const repoId = state.repoId;
    const markdownDocument = state.markdownDocument;

    if (!markdownDocument) {
      throw new Error('No markdown document to store');
    }

    // Get refresh hours from settings (default 24)
    const vscode = require('vscode');
    const config = vscode.workspace.getConfiguration('repomix.chat');
    const refreshHours: number = config.get('architectureRefreshHours', 24);

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + refreshHours * 60 * 60 * 1000);

    // Save to PostgreSQL
    const archRepo = new ArchitectureRepository((global as any).chatPgPool);
    await archRepo.upsertArchitecture({
      repoId,
      markdownTree: markdownDocument,
      folderExplanations: extractFolderExplanations(state.directoryTree),
      expiresAt,
      gitCommit: state.gitHead,
      tokensUsed: state.tokensUsed,
    });

    console.log(`[Architecture] storeDocumentNode: Saved to PostgreSQL (expires in ${refreshHours}h)`);

    // Write local copy to .repomix/architecture.md
    const repoRoot = state.repoRoot;
    const repomixDir = path.join(repoRoot, '.repomix');
    
    // Create .repomix directory if it doesn't exist
    if (!fs.existsSync(repomixDir)) {
      await fs.promises.mkdir(repomixDir, { recursive: true });
    }

    const outputPath = path.join(repomixDir, 'architecture.md');
    await fs.promises.writeFile(outputPath, markdownDocument, 'utf-8');

    console.log(`[Architecture] storeDocumentNode: Local copy written to ${outputPath}`);

    return {};
  } catch (error) {
    console.error('[Architecture] storeDocumentNode: Error storing document:', error);
    throw error;
  }
}

/**
 * Extract folder explanations from classified tree for storage.
 */
function extractFolderExplanations(tree: any): Record<string, string> {
  const explanations: Record<string, string> = {};

  function traverse(node: any, path: string = '') {
    if (!node) return;

    const currentPath = path ? `${path}/${node.name}` : node.name;

    if (node.type === 'directory' && node.classification) {
      explanations[currentPath] = node.classification;
    }

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        traverse(child, currentPath);
      }
    }
  }

  traverse(tree);
  return explanations;
}
