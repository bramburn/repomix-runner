import * as vscode from 'vscode';
import * as path from 'path';
import { Bundle } from '../bundles/types.js';
import { readRepomixRunnerVscodeConfig, readRepomixFileConfig } from '../../config/configLoader.js';
import { addFileExtension } from '../../utils/fileExtensions.js';
import { generateOutputFilename } from '../../utils/generateOutputFilename.js';
import { getCwd } from '../../config/getCwd.js';
import { RepomixConfigFile } from '../../config/configSchema.js';

export async function resolveBundleOutputPath(bundle: Bundle): Promise<string> {
  const cwd = getCwd();
  const config = readRepomixRunnerVscodeConfig();
  let overrideConfig: RepomixConfigFile = {};

  // Use the same config resolution as runBundle:
  // 1. Bundle-specific config path
  // 2. Global runner config path from VSCode settings
  // 3. Default repomix.config.json in workspace root
  const configPath = bundle.configPath || config.runner.configPath || 'repomix.config.json';

  // Try to read the config file (will return undefined if it doesn't exist)
  const bundleConfig = await readRepomixFileConfig(cwd, configPath);
  if (bundleConfig) {
    overrideConfig = bundleConfig;
  }

  // Calculate output filename
  overrideConfig.output ??= {};
  const baseFilePath = overrideConfig.output.filePath || config.output.filePath;
  const useBundleNameAsOutputName = config.runner.useBundleNameAsOutputName;

  const outputStyle = overrideConfig.output.style || config.output.style;

  let outputFilename = generateOutputFilename(
    bundle,
    baseFilePath,
    useBundleNameAsOutputName
  );

  outputFilename = addFileExtension(outputFilename, outputStyle);

  return path.resolve(cwd, outputFilename);
}
