import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../shared/logger';
import ignore from 'ignore';

/**
 * Retrieve all files in the workspace using VS Code's native API.
 * Excludes common ignore patterns, node_modules, and .gitignore patterns.
 */
export async function getWorkspaceFiles(workspaceRoot: string): Promise<string[]> {
  try {
    // Load .gitignore patterns
    const gitignorePath = path.join(workspaceRoot, '.gitignore');
    let gitignorePatterns: string[] = [];
    let hasGitignore = false;

    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      gitignorePatterns = gitignoreContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      hasGitignore = gitignorePatterns.length > 0;
    }

    // Define base exclude patterns
    const baseExcludePatterns = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/coverage/**',
      '**/.next/**',
      '**/.vscode/**',
      '**/.idea/**',
      '**/*.tmp',
      '**/temp/**',
      '**/.DS_Store'
    ];

    // Use VS Code's findFiles API with a relative pattern
    const relativePattern = new vscode.RelativePattern(workspaceRoot, '**/*');

    let uris: vscode.Uri[];

    if (hasGitignore) {
      // If .gitignore exists, we need to filter manually since VS Code's findFiles
      // doesn't support complex gitignore patterns directly

      // Get all files with basic exclusions
      const basicExcludePattern = baseExcludePatterns.join(',');
      uris = await vscode.workspace.findFiles(relativePattern, basicExcludePattern);

      // Apply .gitignore filtering
      const ignoreInstance = ignore({
        ignorecase: process.platform === 'win32' || process.platform === 'darwin'
      });

      // Add gitignore patterns
      gitignorePatterns.forEach(pattern => {
        try {
          ignoreInstance.add(pattern);
        } catch (error) {
          logger.both.warn(`Invalid .gitignore pattern: ${pattern}`, error);
        }
      });

      // Filter files based on .gitignore
      uris = uris.filter(uri => {
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        // Convert path separators to forward slashes for gitignore compatibility
        const normalizedPath = relativePath.replace(/\\/g, '/');

        try {
          const isIgnored = ignoreInstance.ignores(normalizedPath);
          return !isIgnored;
        } catch (error) {
          logger.both.warn(`Error checking ignore status for ${normalizedPath}:`, error);
          // Include file if there's an error checking its status
          return true;
        }
      });

      logger.both.info(`Found ${uris.length} files in workspace (filtered by .gitignore)`);
    } else {
      // No .gitignore, use basic exclusions only
      const excludePattern = baseExcludePatterns.join(',');
      uris = await vscode.workspace.findFiles(relativePattern, excludePattern);
      logger.both.info(`Found ${uris.length} files in workspace (no .gitignore found)`);
    }

    // Convert URIs to relative paths
    const filePaths = uris
      .map(uri => vscode.workspace.asRelativePath(uri, false))
      .filter(filePath => filePath); // Filter out empty paths

    return filePaths;
  } catch (error) {
    logger.both.error('Failed to get workspace files:', error);
    return [];
  }
}

/**
 * Read the content of specific files using VS Code's native API.
 * Returns a Map of file paths to their content.
 */
export async function getFileContents(
  workspaceRoot: string,
  filePaths: string[]
): Promise<Map<string, string>> {
  const contentMap = new Map<string, string>();

  for (const filePath of filePaths) {
    try {
      // Convert relative path to absolute URI
      const absolutePath = path.resolve(workspaceRoot, filePath);
      const uri = vscode.Uri.file(absolutePath);

      // Check if file exists and is not a directory
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type === vscode.FileType.Directory) {
        continue; // Skip directories
      }

      // Read file content
      const content = Buffer.from(
        await vscode.workspace.fs.readFile(uri)
      ).toString('utf-8');

      contentMap.set(filePath, content);
    } catch (error) {
      logger.both.warn(`Failed to read file ${filePath}:`, error);
      // Continue with other files even if one fails
    }
  }

  return contentMap;
}

/**
 * Check if a file exists using VS Code's native API.
 */
export async function fileExists(workspaceRoot: string, filePath: string): Promise<boolean> {
  try {
    const absolutePath = path.resolve(workspaceRoot, filePath);
    const uri = vscode.Uri.file(absolutePath);
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file statistics (size, type) using VS Code's native API.
 */
export async function getFileStats(
  workspaceRoot: string,
  filePath: string
): Promise<{ type: vscode.FileType; size?: number } | null> {
  try {
    const absolutePath = path.resolve(workspaceRoot, filePath);
    const uri = vscode.Uri.file(absolutePath);
    const stat = await vscode.workspace.fs.stat(uri);
    return { type: stat.type, size: stat.size };
  } catch {
    return null;
  }
}