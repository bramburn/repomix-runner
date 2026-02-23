/**
 * loadForRewrite node - Loads full file contents for rewrite phase.
 */
import * as path from 'path';
import * as fs from 'fs';
import { ChatState } from '../state.js';
import { logger } from '../../shared/logger.js';
import {
  getWorkspaceRoot,
  sliceSnippet,
  MAX_FILE_CHARS_FOR_PLAN,
  type ProgressCallback,
} from './utils.js';

export async function loadForRewriteNode(
  state: typeof ChatState.State,
  onProgress: ProgressCallback
) {
  const workspaceFolder = getWorkspaceRoot();
  if (!workspaceFolder || state.filesToLoad.length === 0) {
    return { targetFileContents: {} };
  }

  const contents: Record<string, string> = {};
  for (const relPath of state.filesToLoad) {
    onProgress(`Loading file for plan rewrite: ${relPath}`);
    try {
      const fullPath = path.resolve(workspaceFolder, relPath);
      if (!fullPath.startsWith(workspaceFolder + path.sep)) {
        logger.both.warn(`Chat Graph: Skipping path outside workspace: ${relPath}`);
        continue;
      }
      if (!fs.existsSync(fullPath)) {
        continue;
      }
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      contents[relPath] = sliceSnippet(content, MAX_FILE_CHARS_FOR_PLAN);
    } catch (error) {
      logger.both.warn(`Chat Graph: Failed loading ${relPath} for plan rewrite`, error);
    }
  }

  return { targetFileContents: contents };
}
