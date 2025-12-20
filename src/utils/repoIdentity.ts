import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Determines a stable identifier for the repository.
 * Order of preference:
 * 1. Git Remote URL (from .git/config)
 * 2. Package Name (from package.json)
 * 3. Workspace Folder Name
 */
export async function getRepoId(workspaceFolder: string): Promise<string> {
  // 1. Try to read .git/config
  try {
    const gitConfigPath = path.join(workspaceFolder, '.git', 'config');
    if (fs.existsSync(gitConfigPath)) {
      const configContent = fs.readFileSync(gitConfigPath, 'utf-8');
      const match = configContent.match(/\[remote "origin"\]\s+url\s*=\s*(.+)/);
      if (match && match[1]) {
        return `git:${match[1].trim()}`;
      }
    }
  } catch (e) {
    // Ignore errors
  }

  // 2. Try to read package.json
  try {
    const packageJsonPath = path.join(workspaceFolder, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageContent = fs.readFileSync(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(packageContent);
      if (pkg.name) {
        // Use version if available for uniqueness, but strictly name is safer for "repo" identity
        return `pkg:${pkg.name}`;
      }
    }
  } catch (e) {
    // Ignore errors
  }

  // 3. Fallback to folder name
  return `dir:${path.basename(workspaceFolder)}`;
}
