import * as vscode from 'vscode';
import { runRepomix, defaultRunRepomixDeps } from './runRepomix.js';
import { getCwd } from '../config/getCwd.js';
import { logger } from '../shared/logger.js';
import { showTempNotification } from '../shared/showTempNotification.js';
import * as path from 'path';
import { RepomixConfigFile } from '../config/configSchema.js';
import { DatabaseService } from '../core/storage/databaseService.js';
import { getRepoName } from '../utils/repoName.js';

type RunRepomixFn = typeof runRepomix;

export type RunRepomixOnSelectedFilesDeps = {
  /**
   * Optional runner injection for testing (ESM-friendly).
   * Defaults to the real runRepomix.
   */
  runner?: RunRepomixFn;
  /**
   * Optional deps injection (stubs/spies for tests).
   * Defaults to defaultRunRepomixDeps.
   */
  runRepomixDeps?: typeof defaultRunRepomixDeps;
};

export async function runRepomixOnSelectedFiles(
  uris: vscode.Uri[],
  overrideConfig: RepomixConfigFile = {},
  signal?: AbortSignal,
  databaseService?: DatabaseService,
  configFilePath?: string,
  injected: RunRepomixOnSelectedFilesDeps = {}
) {
  const runner = injected.runner ?? runRepomix;
  const runRepomixDeps = injected.runRepomixDeps ?? defaultRunRepomixDeps;
  const cwd = getCwd();

  if (!uris || uris.length === 0) {
    logger.both.info('No files selected');
    showTempNotification('No files selected to run this command! :)');
    return;
  }

  const includePatterns: string[] = [];
  const overrideIncludes = overrideConfig.include || [];

  for (const uri of uris) {
    const relativePath = path.relative(cwd, uri.fsPath).replace(/\\/g, '/');
    let isDir = false;

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      isDir = stat.type === vscode.FileType.Directory;
    } catch (e) {
      // If we can't stat, assume it's a file or let it be handled later?
      // But we need to know if it's a dir to apply patterns.
      // If it doesn't exist, repomix might fail or ignore it.
      // We'll treat it as a file/exact path if we can't tell.
      logger.both.warn(`Could not stat ${relativePath}, assuming file.`);
    }

    if (isDir && overrideIncludes.length > 0) {
      // If it's a directory and we have override patterns, apply them to this directory
      for (const pattern of overrideIncludes) {
        // pattern usually comes from config, e.g. "**/*.php"
        // We want "src/**/*.php"
        // Ensure we handle potential leading ./ or / in pattern if present, though glob patterns usually relative
        includePatterns.push(path.posix.join(relativePath, pattern));
      }
    } else {
      // It's a file, or no patterns specified. Include the path directly.
      includePatterns.push(relativePath);
    }
  }

  logger.both.info(`Running repomix with calculated include patterns: ${includePatterns.join(', ')}`);

  if (databaseService) {
    try {
      // Log the run to the database for debugging
      const files = uris.map(uri => path.relative(cwd, uri.fsPath).replace(/\\/g, '/'));
      const repoName = await getRepoName(cwd);
      await databaseService.saveDebugRun(files, repoName);
    } catch (e) {
      logger.both.error('Failed to save debug run', e);
    }
  }

  const finalOverrideConfig = {
    ...overrideConfig,
    include: includePatterns,
  };

  await runner({
    ...runRepomixDeps,
    mergeConfigOverride: finalOverrideConfig,
    signal,
    configFilePath,
  });
}
