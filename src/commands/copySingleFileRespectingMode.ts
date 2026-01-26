import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { readRepomixRunnerVscodeConfig } from '../config/configLoader.js';
import { copyToClipboard } from '../core/files/copyToClipboard.js';
import { tempDirManager } from '../core/files/tempDirManager.js';

/**
 * Copies a single file to the clipboard respecting the global copyMode setting.
 * @param filePath The absolute path to the file to copy.
 */
export async function copySingleFileRespectingMode(filePath: string): Promise<'content' | 'file'> {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const config = readRepomixRunnerVscodeConfig();

  if (config.runner.copyMode === 'content') {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    await vscode.env.clipboard.writeText(content);
  } else {
    // For file mode, we need a temporary path
    const originalFilename = path.basename(filePath);
    const tmpDir = path.join(tempDirManager.getTempDir(), `copy_${Date.now()}`);
    await fs.promises.mkdir(tmpDir, { recursive: true });
    const tmpFilePath = path.join(tmpDir, originalFilename);

    await copyToClipboard(filePath, tmpFilePath);

    // We don't cleanup immediately because the OS might need the file
    // IndexingController uses tempDirManager.cleanupFile(tmpFilePath) which defaults to 3 minutes
    await tempDirManager.cleanupFile(tmpFilePath);
  }

  // Return the copy mode for frontend feedback differentiation
  return config.runner.copyMode;
}
