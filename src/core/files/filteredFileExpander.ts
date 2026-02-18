import * as vscode from 'vscode';
import * as path from 'path';
import ignore from 'ignore';
import { collectGitignorePatterns } from './gitignoreUtils.js';

/**
 * Result of expanding URIs with gitignore filtering
 */
export interface ExpandedFilesResult {
  /** Array of file URIs that passed filtering */
  files: vscode.Uri[];
  /** Number of files that were ignored due to gitignore rules */
  ignoredCount: number;
  /** Total number of files found before filtering */
  totalCount: number;
}

/**
 * Expands a list of URIs (files or folders) into a flat list of file URIs,
 * optionally respecting .gitignore rules.
 * Recursively walks folders. Stops when maxFiles is reached.
 * 
 * @param uris - Array of URIs to expand
 * @param maxFiles - Maximum number of files to return
 * @param cwd - Current working directory (repository root)
 * @param respectGitignore - Whether to filter files based on .gitignore rules
 * @returns Object containing filtered files and statistics
 */
export async function expandUrisToFilesRespectingGitignore(
  uris: vscode.Uri[],
  maxFiles: number,
  cwd: string,
  respectGitignore: boolean = false
): Promise<ExpandedFilesResult> {
  const result: vscode.Uri[] = [];
  const visited = new Set<string>();
  
  // Initialize gitignore filter if needed
  let ig: ReturnType<typeof ignore> | null = null;
  if (respectGitignore) {
    try {
      ig = ignore();
      const gitignorePatterns = collectGitignorePatterns(cwd);
      ig.add(gitignorePatterns);
      console.log(`[Repomix] Loaded ${gitignorePatterns.length} gitignore patterns for filtering`);
    } catch (error) {
      console.warn('[Repomix] Failed to load gitignore patterns, proceeding without filtering:', error);
      ig = null;
    }
  }

  /**
   * Convert a file path to a format suitable for gitignore matching
   * (forward slashes, relative to cwd)
   */
  function getPathForIgnoreMatch(uri: vscode.Uri): string {
    const relativePath = path.relative(cwd, uri.fsPath);
    // Convert to forward slashes for gitignore compatibility
    return relativePath.split(path.sep).join('/');
  }

  /**
   * Check if a file should be included based on gitignore rules
   */
  function shouldIncludeFile(uri: vscode.Uri): boolean {
    if (!ig || !respectGitignore) {
      return true; // No filtering applied
    }
    
    const ignorePath = getPathForIgnoreMatch(uri);
    if (!ignorePath || ignorePath.startsWith('..')) {
      return true; // Outside cwd, don't filter
    }
    
    return !ig.ignores(ignorePath);
  }

  async function walk(uri: vscode.Uri) {
    if (result.length >= maxFiles) {
      return;
    }

    const key = uri.toString();
    if (visited.has(key)) {
      return;
    }
    visited.add(key);

    try {
      const stat = await vscode.workspace.fs.stat(uri);

      if (stat.type & vscode.FileType.File) {
        // For individual files, always include them regardless of gitignore
        // This preserves the behavior where explicitly selected files are processed
        result.push(uri);
        return;
      }

      if (stat.type & vscode.FileType.Directory) {
        const entries = await vscode.workspace.fs.readDirectory(uri);
        for (const [name, type] of entries) {
          const childUri = vscode.Uri.joinPath(uri, name);
          
          // For directory traversal, apply gitignore filtering
          if (type & vscode.FileType.File) {
            if (shouldIncludeFile(childUri)) {
              if (result.length < maxFiles) {
                result.push(childUri);
              }
            }
          } else if (type & vscode.FileType.Directory) {
            // For subdirectories, check if the directory itself is ignored
            // If directory is ignored, skip entire subtree for performance
            if (shouldIncludeFile(childUri)) {
              await walk(childUri);
            } else {
              console.log(`[Repomix] Skipping ignored directory: ${getPathForIgnoreMatch(childUri)}`);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[Repomix] Failed to read ${uri.toString()}:`, err);
    }
  }

  // Count total files for statistics (before applying maxFiles limit)
  let totalCount = 0;
  const countFiles = async (uri: vscode.Uri) => {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type & vscode.FileType.File) {
        totalCount++;
      } else if (stat.type & vscode.FileType.Directory) {
        const entries = await vscode.workspace.fs.readDirectory(uri);
        for (const [name, type] of entries) {
          if (type & vscode.FileType.File) {
            totalCount++;
          } else if (type & vscode.FileType.Directory) {
            await countFiles(vscode.Uri.joinPath(uri, name));
          }
        }
      }
    } catch (err) {
      // Silently ignore errors during counting
    }
  };

  // Count total files if we need statistics
  if (respectGitignore) {
    for (const uri of uris) {
      await countFiles(uri);
    }
  }

  // Perform actual expansion
  for (const uri of uris) {
    await walk(uri);
  }

  const ignoredCount = respectGitignore ? Math.max(0, totalCount - result.length) : 0;
  
  return {
    files: result,
    ignoredCount,
    totalCount
  };
}
