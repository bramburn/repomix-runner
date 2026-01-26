import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Git extension API interfaces (using any for flexibility)
 */
export interface GitExtension {
  getAPI(version: number): any | undefined;
}

export interface API {
  repositories: Repository[];
}

export interface Repository {
  state: {
    indexChanges: Change[];
    workingTreeChanges: Change[];
    untrackedChanges: Change[];
  };
  rootUri: vscode.Uri;
}

export interface Change {
  uri: vscode.Uri;
}

/**
 * Safely get the Git API from the vscode.git extension.
 * Returns undefined if the extension is not available or wrong version.
 */
export async function getGitApi(): Promise<API | undefined> {
  try {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!extension) {
      console.warn('[Repomix] Git extension not found');
      return undefined;
    }
    if (!extension.isActive) {
      await extension.activate();
    }
    const api = extension.exports.getAPI(1);
    if (!api) {
      console.warn('[Repomix] Git API version 1 not available');
    }
    return api;
  } catch (error) {
    console.error('[Repomix] Error accessing Git API:', error);
    vscode.window.showErrorMessage('Failed to access Git extension.');
    return undefined;
  }
}

/**
 * Get the Git repository for the currently active editor.
 * Tries to find a repository whose root contains the active file.
 * Falls back to the first repository if no match is found.
 * 
 * @returns Repository object or undefined if no repositories exist
 */
export async function getRepoForActiveEditor(): Promise<Repository | undefined> {
  const gitApi = await getGitApi();
  if (!gitApi || gitApi.repositories.length === 0) {
    return undefined;
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri && activeUri.scheme === 'file') {
    for (const repo of gitApi.repositories) {
      const repoRoot = repo.rootUri.fsPath + path.sep;
      if (activeUri.fsPath.startsWith(repoRoot)) {
        return repo;
      }
    }
  }

  // Fallback to first repo
  return gitApi.repositories[0];
}

/**
 * Get all changed URIs from a Git repository.
 * Includes staged changes (index), unstaged changes (working tree), and untracked files.
 * 
 * @param repo - Git repository object
 * @returns Array of URIs for all changed files
 */
export function getAllChangedUris(repo: Repository): vscode.Uri[] {
  const uris = [
    ...repo.state.indexChanges.map(c => c.uri),
    ...repo.state.workingTreeChanges.map(c => c.uri),
    ...repo.state.untrackedChanges.map(c => c.uri),
  ];
  
  // Dedupe by URI string to avoid overlaps
  const unique = new Map<string, vscode.Uri>();
  uris.forEach(u => unique.set(u.toString(), u));
  return Array.from(unique.values());
}