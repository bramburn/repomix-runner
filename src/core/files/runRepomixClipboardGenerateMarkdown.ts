import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { execPromisify } from '../../shared/execPromisify';

/**
 * Gets the path to the repomix-clipboard binary.
 * The binary is bundled in the extension's bin directory.
 */
function getClipboardBinaryPath(context: vscode.ExtensionContext): string {
  const binaryName = process.platform === 'win32' ? 'repomix-clipboard.exe' : 'repomix-clipboard';
  return vscode.Uri.joinPath(context.extensionUri, 'assets', 'bin', binaryName).fsPath;
}
/**
 * Calculates token count for a file using GPT tokenizer
 */
import { encode } from 'gpt-tokenizer';

async function calculateTokenCount(filePath: string): Promise<number> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const tokens = encode(content);
    return tokens.length;
  } catch (error) {
    throw new Error(`Failed to calculate token count for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Runs the repomix-clipboard binary in "generate markdown" mode.
 *
 * This mode:
 * - Takes a list of repo-relative file paths
 * - Generates a markdown file with each file's contents
 * - Copies the markdown file to the clipboard (as a file drop)
 * - Returns token count of the generated markdown
 *
 * CLI: repomix-clipboard.exe --generate-md --cwd <ABS_REPO_ROOT> <REL_FILE_1> <REL_FILE_2> ...
 *
 * @param extensionContext - VS Code extension context
 * @param cwd - Absolute path to the repository root
 * @param relFiles - Array of repo-relative file paths
 * @returns Promise resolving to token count of generated markdown
 * @throws Error if the binary fails or exits with non-zero code
 */

export async function runRepomixClipboardGenerateMarkdown(
  context: vscode.ExtensionContext,
  cwd: string,
  relativeFiles: string[]
): Promise<void> {
  // 1. Locate the Rust binary (repomix-clipboard)
  const binaryPath = getClipboardBinaryPath(context);

  // 2. Construct Arguments
  const args = [
    '--generate-md',
    '--cwd',
    cwd,
    ...relativeFiles
  ];

  // 3. Execute
  try {
    // Quote the binary path in case of spaces
    const cmd = `"${binaryPath}"`;
    
    // Quote arguments to prevent shell issues
    const escapedArgs = args.map(arg => `"${arg}"`).join(' ');
    const fullCommand = `${cmd} ${escapedArgs}`;

    console.log(`[Repomix] Executing: ${fullCommand}`);
    
    await execPromisify(fullCommand, { cwd });
  } catch (error) {
    console.error(`[Repomix] Binary Error:`, error);
    throw new Error('Failed to execute clipboard binary. Check console for details.');
  }
}