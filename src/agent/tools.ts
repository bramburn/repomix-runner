import * as vscode from 'vscode';
import * as path from 'path';
import { logger } from '../shared/logger';

/**
 * Step 1 Tool: Scans the workspace for files.
 * Uses vscode.workspace.findFiles which is fast and respects .gitignore natively.
 */
export async function getWorkspaceFiles(workspaceRoot: string): Promise<string[]> {
  try {
    // Create a RelativePattern to restrict the search to the specific workspace folder
    const relativePattern = new vscode.RelativePattern(workspaceRoot, '**/*');

    // Find all files
    // exclude: '**/node_modules/**' (explicitly exclude node_modules even if not in gitignore)
    // The first argument (include) is the pattern.
    // The second argument (exclude) is null to use default excludes + gitignore,
    // or we can provide a specific glob.
    const uris = await vscode.workspace.findFiles(relativePattern, '**/node_modules/**');

    // Convert full URIs to relative paths (e.g., "src/utils.ts")
    // vscode.workspace.asRelativePath handles the logic of stripping the root path.
    const paths = uris.map(uri => vscode.workspace.asRelativePath(uri, false));

    return paths;
  } catch (error) {
    logger.both.error("Agent: Failed to scan workspace files", error);
    return [];
  }
}

/**
 * Step 4 Tool: Content Retrieval.
 * Reads a specific file's content using the native VS Code FS API.
 */
export async function getFileContent(workspaceRoot: string, relativePath: string): Promise<string | null> {
  try {
    const uri = vscode.Uri.file(path.join(workspaceRoot, relativePath));

    // 1. Check file stats
    const stats = await vscode.workspace.fs.stat(uri);

    // Skip if directory or too large (> 1MB)
    if (stats.type !== vscode.FileType.File) {
        return null;
    }
    if (stats.size > 1024 * 1024) {
        logger.both.warn(`Agent: Skipping large file ${relativePath} (${stats.size} bytes)`);
        return null;
    }

    // 2. Read file
    const uint8Array = await vscode.workspace.fs.readFile(uri);
    const content = new TextDecoder().decode(uint8Array);

    return content;
  } catch (error) {
    logger.both.warn(`Agent: Failed to read file ${relativePath}`, error);
    return null;
  }
}