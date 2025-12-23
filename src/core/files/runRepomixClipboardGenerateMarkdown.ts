import * as cp from 'child_process';
import * as path from 'path';
import type { ExtensionContext } from 'vscode';

/**
 * Gets the path to the repomix-clipboard binary.
 * The binary is bundled in the extension's bin directory.
 */
function getClipboardBinaryPath(extensionContext: ExtensionContext): string {
  return path.join(extensionContext.extensionPath, 'assets', 'bin', 'repomix-clipboard.exe');
}

/**
 * Runs the repomix-clipboard binary in "generate markdown" mode.
 *
 * This mode:
 * - Takes a list of repo-relative file paths
 * - Generates a markdown file with each file's contents
 * - Copies the markdown file to the clipboard (as a file drop)
 *
 * CLI: repomix-clipboard.exe --generate-md --cwd <ABS_REPO_ROOT> <REL_FILE_1> <REL_FILE_2> ...
 *
 * @param extensionContext - VS Code extension context
 * @param cwd - Absolute path to the repository root
 * @param relFiles - Array of repo-relative file paths
 * @throws Error if the binary fails or exits with non-zero code
 */
export async function runRepomixClipboardGenerateMarkdown(
  extensionContext: ExtensionContext,
  cwd: string,
  relFiles: string[]
): Promise<void> {
  const exe = getClipboardBinaryPath(extensionContext);

  const args = [
    '--generate-md',
    '--cwd', cwd,
    ...relFiles,
  ];

  console.log(`[runRepomixClipboardGenerateMarkdown] Spawning: ${exe} ${args.join(' ')}`);

  await new Promise<void>((resolve, reject) => {
    const child = cp.spawn(exe, args, {
      cwd,
      windowsHide: true,
    });

    let stderr = '';
    child.stderr?.on('data', (d) => {
      stderr += String(d);
    });

    child.on('error', (err) => {
      console.error(`[runRepomixClipboardGenerateMarkdown] Spawn error:`, err);
      reject(err);
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[runRepomixClipboardGenerateMarkdown] Success, exit code: ${code}`);
        resolve();
      } else {
        const errorMsg = stderr || `repomix-clipboard exited with code ${code}`;
        console.error(`[runRepomixClipboardGenerateMarkdown] Failed: ${errorMsg}`);
        reject(new Error(errorMsg));
      }
    });
  });
}
