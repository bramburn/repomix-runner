import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { generateMarkdownContent } from './markdownGenerator';
import { copySingleFileRespectingMode } from '../../commands/copySingleFileRespectingMode';
import { tempDirManager } from './tempDirManager';

/**
 * Generates markdown by concatenating files and copies to clipboard.
 *
 * **Platform-specific behavior:**
 * - **Windows**: Copies the concatenated FILE to clipboard (using Rust binary for file-drop)
 * - **Mac/Unix/Linux**: Copies the TEXT CONTENT to clipboard (using VS Code API)
 *
 * @param context - VS Code extension context
 * @param cwd - Absolute path to the repository root
 * @param relativeFiles - Array of repo-relative file paths
 * @returns Promise resolving with token count when markdown is copied to clipboard
 * @throws Error if validation fails
 */
export async function runRepomixClipboardGenerateMarkdown(
  context: vscode.ExtensionContext,
  cwd: string,
  relativeFiles: string[]
): Promise<{ tokenCount: number }> {
  // Validate inputs
  if (!relativeFiles || relativeFiles.length === 0) {
    throw new Error('No files provided to generate markdown');
  }

  if (!cwd || !fs.existsSync(cwd)) {
    throw new Error(`Invalid workspace directory: ${cwd}`);
  }

  // 1. Generate Content
  const { concatenated, tokenCount } = await generateMarkdownContent(cwd, relativeFiles);

  // 2. Write to a temporary file (Required for "File Mode", but also safe for "Content Mode")
  // We use the tempDirManager to ensure it gets cleaned up correctly
  const tempDir = await tempDirManager.createTempDir('repomix-gen');
  const tempOutputFile = path.join(tempDir, `repomix-selection-${Date.now()}.md`);

  await fs.promises.writeFile(tempOutputFile, concatenated, 'utf-8');

  try {
    // 3. Delegate to the wrapper
    // This will check config.runner.copyMode:
    // - If 'content': It reads the file we just wrote and puts text on clipboard.
    // - If 'file': It passes the file path to the OS clipboard binary/script.
    await copySingleFileRespectingMode(tempOutputFile);

    console.log(`[Repomix] Successfully copied markdown to clipboard (${tokenCount} tokens)`);
  } catch (error) {
    console.error('[copy2clipboard] Execution failed:', error);
    throw error;
  } finally {
    // Note: copySingleFileRespectingMode schedules its own cleanup for the *destination* temp file 
    // it creates (in file mode), but we should clean up our *source* generation file.
    // However, if the mode is 'file', the wrapper copies THIS file to another temp location.
    // So it is safe to delete this immediate file after the operation.
    try {
      await fs.promises.unlink(tempOutputFile);
    } catch { }
  }

  return { tokenCount };
}
