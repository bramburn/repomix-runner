import * as vscode from 'vscode';
import { getCwd } from '../config/getCwd.js';
import { runRepomixOnSelectedFiles } from './runRepomixOnSelectedFiles.js';
import { logger } from '../shared/logger.js';
import { showTempNotification } from '../shared/showTempNotification.js';
import { readRepomixRunnerVscodeConfig } from '../config/configLoader.js';
import { RepomixConfigFile } from '../config/configSchema.js';
import { BundleManager } from '../core/bundles/bundleManager.js';
import { readRepomixFileConfig } from '../config/configLoader.js';
import { generateOutputFilename } from './generateOutputFilename.js';
import { validateOutputFilePath } from '../utils/pathValidation.js';
import * as path from 'path';

export async function runBundle(
  bundleManager: BundleManager,
  bundleId: string,
  signal?: AbortSignal,
  additionalOverrides?: RepomixConfigFile
) {
  const cwd = getCwd();
  const bundle = await bundleManager.getBundle(bundleId);

  // We need to construct the override config expected by runRepomixOnSelectedFiles
  let overrideConfig: RepomixConfigFile = {};
  if (bundle.configPath) {
    try {
      const bundleConfig = await readRepomixFileConfig(cwd, bundle.configPath);
      overrideConfig = bundleConfig || {};
    } catch (error: any) {
       logger.both.error('Failed to parse bundle config:', error);
       vscode.window.showErrorMessage(`Failed to parse bundle config: ${error.message}`);
       return;
    }
  }

  // Apply additional overrides (e.g., compress flag)
  if (additionalOverrides) {
    overrideConfig = {
      ...overrideConfig,
      ...additionalOverrides,
      output: {
        ...overrideConfig.output,
        ...additionalOverrides.output,
      },
    };
  }

  // Load VS Code config to get base values
  const config = readRepomixRunnerVscodeConfig();

  // Calculate final output path using the new utility
  const finalOutputFilePath = generateOutputFilename(
    bundle,
    overrideConfig.output?.filePath || config.output.filePath, // Base path from config
    config.runner.useBundleNameAsOutputName
  );

  // Explicitly set the calculated path in the override config so downstream functions use it
  overrideConfig.output = {
    ...overrideConfig.output,
    filePath: finalOutputFilePath
  };

  try {
    validateOutputFilePath(finalOutputFilePath, cwd);
  } catch (error: any) {
    logger.both.error('Security validation failed:', error);
    vscode.window.showErrorMessage(error.message);
    return;
  }

  try {
    // Convert file paths to URIs
    if (!bundle.files) {
      return;
    }
    const uris = bundle.files.map(filePath =>
      vscode.Uri.file(vscode.Uri.joinPath(vscode.Uri.file(cwd), filePath).fsPath)
    );

    // Validate that all files still exist
    const missingFiles: string[] = [];
    for (const uri of uris) {
      if (signal?.aborted) {
        throw new Error('Aborted');
      }
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        missingFiles.push(uri.fsPath);
      }
    }

    if (missingFiles.length > 0) {
      const proceed = await vscode.window.showWarningMessage(
        `Some files in this bundle no longer exist:\n${missingFiles.join(
          '\n'
        )}\n\nDo you want to proceed with the remaining files?`,
        'Yes',
        'No'
      );
      if (proceed !== 'Yes') {
        return;
      }
    }

    if (signal?.aborted) {
        throw new Error('Aborted');
    }

    // Filter out missing files
    const validUris = uris.filter(uri => !missingFiles.includes(uri.fsPath));

    if (validUris.length === 0) {
      showTempNotification('No valid files remaining in bundle.');
      return;
    }

    // Run Repomix on the bundle files
    await runRepomixOnSelectedFiles(validUris, overrideConfig, signal);

    if (signal?.aborted) {
       return;
    }

    const updatedBundle = {
      ...bundle,
      lastUsed: new Date().toISOString(),
    };

    await bundleManager.saveBundle(bundleId, updatedBundle);
  } catch (error: any) {
    if (error.name === 'AbortError' || error.message === 'Aborted') {
        logger.both.info('Bundle execution cancelled');
        throw error;
    }
    logger.both.error('Failed to run bundle:', error);
    vscode.window.showErrorMessage(`Failed to run bundle: ${error}`);
  }
}
