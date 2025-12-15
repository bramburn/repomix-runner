import * as vscode from 'vscode';
import { getCwd } from '../config/getCwd.js';
import { runRepomixOnSelectedFiles } from './runRepomixOnSelectedFiles.js';
import { logger } from '../shared/logger.js';
import { showTempNotification } from '../shared/showTempNotification.js';
import { readRepomixRunnerVscodeConfig } from '../config/configLoader.js';
import { RepomixConfigFile } from '../config/configSchema.js';
import { BundleManager } from '../core/bundles/bundleManager.js';
import { readRepomixFileConfig } from '../config/configLoader.js';
import { resolveBundleOutputPath } from '../core/files/outputPathResolver.js';
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

  // Calculate output filename using the shared resolver
  const outputFilePath = await resolveBundleOutputPath(bundle);

  try {
    // Validate the FINAL resolved path to catch issues from any source (bundle config, global config, or overrides)
    validateOutputFilePath(outputFilePath, cwd);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.both.error('Security validation failed for final output path:', errorMessage);
    vscode.window.showErrorMessage(`Security error: ${errorMessage}`);
    return; // Stop execution immediately
  }

  // We need to construct the override config expected by runRepomixOnSelectedFiles
  // We can't pass the full path directly if it expects relative logic, but checking runRepomixOnSelectedFiles...
  // It takes overrideConfig.output.filePath.

  // Re-reading config just to respect the flow (though resolveBundleOutputPath did it too)
  // This is a slight duplication of effort (reading config files twice) but ensures consistency
  let overrideConfig: RepomixConfigFile = {};
  if (bundle.configPath) {
    const bundleConfig = await readRepomixFileConfig(cwd, bundle.configPath);
    overrideConfig = bundleConfig || {};
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
      // Merge other nested objects if necessary, currently mainly output is used
    };
  }

  overrideConfig.output ??= {};
  // Important: resolveBundleOutputPath returns absolute path.
  // runRepomix handles absolute paths correctly? Let's assume yes or make it relative if needed.
  // runRepomix does: filePath: path.resolve(cwd, outputFilePath) in mergeConfigs
  // So if we pass an absolute path, path.resolve(cwd, absPath) returns absPath. It is safe.
  overrideConfig.output.filePath = outputFilePath;

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
