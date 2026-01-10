import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { execPromisify } from '../../shared/execPromisify';
import { generateMarkdownContent } from './markdownGenerator';

/**
 * Gets the path to the repomix-clipboard binary.
 * The binary is bundled in the extension's bin directory.
 */
function getClipboardBinaryPath(context: vscode.ExtensionContext): string {
  const binaryName = process.platform === 'win32' ? 'repomix-clipboard.exe' : 'repomix-clipboard';
  return vscode.Uri.joinPath(context.extensionUri, 'assets', 'bin', binaryName).fsPath;
}

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

  console.log('[copy2clipboard] Starting markdown generation for', relativeFiles.length, 'files');
  console.log(`[Repomix] Generating markdown for ${relativeFiles.length} files`);

  const { concatenated, tokenCount } = await generateMarkdownContent(cwd, relativeFiles);

  // Platform-specific clipboard behavior
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    console.log('[copy2clipboard] Using Windows binary file-drop clipboard mode');
    // Windows: Write to temp file and copy the FILE to clipboard using Rust binary
    const tempOutputFile = path.join(cwd, `.repomix-clipboard-${Date.now()}.md`);
    await fs.promises.writeFile(tempOutputFile, concatenated, 'utf-8');

    const binaryPath = getClipboardBinaryPath(context);
    const cmd = `"${binaryPath}" "${tempOutputFile}"`;

    console.log('[copy2clipboard] Executing Windows binary:', binaryPath);
    console.log(`[Repomix] Executing binary for file-drop clipboard: ${cmd}`);

    try {
      await execPromisify(cmd, { cwd, timeout: 60000 });
      console.log('[copy2clipboard] Windows binary executed successfully');
      console.log(`[Repomix] Successfully copied file to clipboard (${tokenCount} tokens)`);
      // NOTE: Do NOT delete tempOutputFile immediately - file-drop clipboard consumers need it to exist at paste time
    } catch (error) {
      console.error('[copy2clipboard] Windows binary execution failed:', error);
      // Clean up temp file on error
      try { await fs.promises.unlink(tempOutputFile); } catch { }
      throw error;
    }
  } else {
    console.log('[copy2clipboard] Using VS Code clipboard API (Mac/Unix/Linux)');
    // Mac/Unix/Linux: Copy TEXT directly to clipboard using VS Code API
    await vscode.env.clipboard.writeText(concatenated);
    console.log('[copy2clipboard] Clipboard API write successful');
    console.log(`[Repomix] Successfully copied text to clipboard (${tokenCount} tokens)`);
  }

  return { tokenCount };
}
