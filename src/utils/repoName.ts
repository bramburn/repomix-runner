import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { logger } from '../shared/logger.js';

export async function getRepoName(cwd: string): Promise<string> {
  // 1. Try to read package.json
  try {
    const packageJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJsonContent = await fs.promises.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageJsonContent);

      if (packageJson.repository) {
        let repoUrl = '';
        if (typeof packageJson.repository === 'string') {
          repoUrl = packageJson.repository;
        } else if (typeof packageJson.repository === 'object' && packageJson.repository.url) {
          repoUrl = packageJson.repository.url;
        }

        if (repoUrl) {
          // Clean up URL to get user/repo
          // e.g. git+https://github.com/user/repo.git -> user/repo
          // e.g. https://github.com/user/repo -> user/repo
          // e.g. git@github.com:user/repo.git -> user/repo

          // Remove protocol prefix
          let cleanUrl = repoUrl
            .replace(/^git\+/, '')
            .replace(/^git@/, '')
            .replace(/^https?:\/\//, '')
            .replace(/^ssh:\/\//, '');

          // Remove .git suffix
          cleanUrl = cleanUrl.replace(/\.git$/, '');

          // Remove domain if present (assuming github/gitlab/bitbucket structure usually)
          // This is a heuristic.
          const parts = cleanUrl.split(/[:/]/);
          if (parts.length >= 2) {
             // Take the last two parts
             return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
          }
        }
      }
    }
  } catch (error) {
    logger.both.warn(`Failed to read package.json for repo name: ${error}`);
  }

  // 2. Fallback to workspace name
  if (vscode.workspace.name) {
      return vscode.workspace.name;
  }

  // 3. Fallback to folder name
  return path.basename(cwd);
}
