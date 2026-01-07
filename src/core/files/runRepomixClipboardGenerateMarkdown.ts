import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { execPromisify } from '../../shared/execPromisify';
import { encode } from 'gpt-tokenizer';

/**
 * Calculates token count for content using GPT tokenizer
 */
async function calculateTokenCount(content: string): Promise<number> {
  try {
    const tokens = encode(content);
    return tokens.length;
  } catch (error) {
    throw new Error(`Failed to calculate token count: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Runs repomix to generate markdown for selected files and copies to clipboard.
 *
 * **Design Rationale:**
 * - Uses `npx repomix` instead of platform-specific binaries
 * - Works seamlessly across all environments: Windows, macOS, Linux, WSL, SSH, Dev Containers
 * - The VS Code clipboard API `vscode.env.clipboard` automatically handles clipboard
 *   operations across remote boundaries, ensuring content is available on the user's
 *   local machine regardless of where the extension host runs
 *
 * @param context - VS Code extension context
 * @param cwd - Absolute path to the repository root
 * @param relativeFiles - Array of repo-relative file paths
 * @returns Promise resolving with token count when markdown is copied to clipboard
 * @throws Error if repomix execution fails or validation fails
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

  const tempOutputFile = path.join(cwd, `.repomix-clipboard-${Date.now()}.md`);

  try {
    console.log(`[Repomix] Generating markdown for ${relativeFiles.length} files`);

    // Build the include list for repomix
    const includeList = relativeFiles.join(',');

    // Use npx repomix with markdown output
    // This works on any platform (Windows, Mac, Linux) and in remote environments
    const cmd = `npx -y repomix@latest "${cwd}" --include "${includeList}" --style markdown --output "${tempOutputFile}"`;

    console.log(`[Repomix] Executing: ${cmd}`);

    // Execute repomix with timeout (60 seconds)
    const { stderr, stdout } = await execPromisify(cmd, { cwd, timeout: 60000 });

    if (stdout) {
      console.log(`[Repomix] stdout:`, stdout);
    }

    if (stderr) {
      console.error(`[Repomix] stderr:`, stderr);
      // Note: repomix may output to stderr even on success, so we don't throw here
    }

    // Verify the output file was created
    if (!fs.existsSync(tempOutputFile)) {
      throw new Error('Repomix failed to generate output file');
    }

    // Read the generated markdown file
    const content = await fs.promises.readFile(tempOutputFile, 'utf-8');

    if (!content || content.trim().length === 0) {
      throw new Error('Generated markdown file is empty');
    }

    // Calculate token count for user feedback
    const tokenCount = await calculateTokenCount(content);
    console.log(`[Repomix] Generated markdown with ${tokenCount} tokens`);

    // Copy to clipboard using VSCode API
    // This automatically works across remote boundaries (WSL, SSH, Dev Containers)
    await vscode.env.clipboard.writeText(content);

    console.log(`[Repomix] Successfully copied ${relativeFiles.length} files to clipboard (${tokenCount} tokens)`);

    return { tokenCount };

  } catch (error) {
    console.error(`[Repomix] Error:`, error);
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Provide specific error messages for common failure scenarios
    if (errorMsg.includes('npx') || errorMsg.includes('command not found')) {
      throw new Error('npx not found. Please ensure Node.js is installed on the remote machine.');
    }

    if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
      throw new Error('Repomix operation timed out. This may be due to network issues or a large number of files.');
    }

    if (errorMsg.includes('EACCES') || errorMsg.includes('permission denied')) {
      throw new Error('Permission denied. Check file system permissions for the workspace directory.');
    }

    if (errorMsg.includes('ENOENT')) {
      throw new Error('File not found. One or more selected files may have been deleted.');
    }

    throw new Error(`Failed to generate markdown: ${errorMsg}`);
  } finally {
    // Clean up temporary file
    try {
      if (await fs.promises.access(tempOutputFile).then(() => true).catch(() => false)) {
        await fs.promises.unlink(tempOutputFile);
        console.log(`[Repomix] Cleaned up temporary file: ${tempOutputFile}`);
      }
    } catch (cleanupError) {
      console.warn(`[Repomix] Failed to clean up temporary file:`, cleanupError);
      // Don't throw on cleanup failure
    }
  }
}