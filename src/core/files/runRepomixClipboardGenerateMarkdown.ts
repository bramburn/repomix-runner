import * as cp from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { ExtensionContext } from 'vscode';
import * as vscode from 'vscode';

/**
 * Gets the path to the repomix-clipboard binary.
 * The binary is bundled in the extension's bin directory.
 */
function getClipboardBinaryPath(extensionContext: ExtensionContext): string {
  return path.join(extensionContext.extensionPath, 'assets', 'bin', 'repomix-clipboard.exe');
}

/**
 * Calculates token count for a file using GPT tokenizer
 */
async function calculateTokenCount(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    // Create a Node.js script to calculate tokens
    const tokenScript = `
      const { encode } = require('gpt-tokenizer');
      const fs = require('fs');
      try {
        const content = fs.readFileSync('${filePath.replace(/\\/g, '\\\\')}', 'utf-8');
        const tokens = encode(content);
        console.log(tokens.length);
      } catch (error) {
        console.error(error.message);
        process.exit(1);
      }
    `;

    // Write temporary script
    const tempScriptPath = path.join(os.tmpdir(), `token-count-${Date.now()}.js`);
    fs.writeFileSync(tempScriptPath, tokenScript);

    // Execute the script
    const child = cp.spawn('node', [tempScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      // Clean up temp script
      try {
        fs.unlinkSync(tempScriptPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      if (code === 0) {
        const tokenCount = parseInt(stdout.trim(), 10);
        if (isNaN(tokenCount)) {
          reject(new Error('Failed to parse token count'));
        } else {
          resolve(tokenCount);
        }
      } else {
        reject(new Error(`Token count failed: ${stderr || `exit code ${code}`}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
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
  extensionContext: ExtensionContext,
  cwd: string,
  relFiles: string[]
): Promise<number> {
  const exe = getClipboardBinaryPath(extensionContext);

  const args = [
    '--generate-md',
    '--cwd', cwd,
    ...relFiles,
  ];

  console.log(`[runRepomixClipboardGenerateMarkdown] Spawning: ${exe} ${args.join(' ')}`);

  // Create a temporary file to store the generated markdown
  const tempDir = os.tmpdir();
  const tempMarkdownPath = path.join(tempDir, `repomix-markdown-${Date.now()}.md`);

  // Add output path argument if binary supports it
  // If not supported, we'll need to capture stdout
  args.push('--output', tempMarkdownPath);

  return new Promise<number>((resolve, reject) => {
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

    child.on('close', async (code) => {
      try {
        if (code === 0) {
          console.log(`[runRepomixClipboardGenerateMarkdown] Success, exit code: ${code}`);
          
          // Check if markdown file was created
          if (fs.existsSync(tempMarkdownPath)) {
            try {
              // Calculate token count
              const tokenCount = await calculateTokenCount(tempMarkdownPath);
              console.log(`[runRepomixClipboardGenerateMarkdown] Token count: ${tokenCount}`);
              
              // Show notification with token count
              vscode.window.showInformationMessage(
                `Copied ${relFiles.length} files as markdown to clipboard (${tokenCount.toLocaleString()} tokens)`
              );
              
              // Clean up temp file
              fs.unlinkSync(tempMarkdownPath);
              
              resolve(tokenCount);
            } catch (tokenError) {
              console.error(`[runRepomixClipboardGenerateMarkdown] Token count error:`, tokenError);
              // Still resolve success but with 0 tokens
              vscode.window.showInformationMessage(
                `Copied ${relFiles.length} files as markdown to clipboard`
              );
              resolve(0);
            }
          } else {
            // Binary might not support --output flag, try alternative approach
            console.log(`[runRepomixClipboardGenerateMarkdown] No output file created, binary may copy directly to clipboard`);
            vscode.window.showInformationMessage(
              `Copied ${relFiles.length} files as markdown to clipboard`
            );
            resolve(0);
          }
        } else {
          const errorMsg = stderr || `repomix-clipboard exited with code ${code}`;
          console.error(`[runRepomixClipboardGenerateMarkdown] Failed: ${errorMsg}`);
          reject(new Error(errorMsg));
        }
      } catch (finalError) {
        reject(finalError);
      }
    });
  });
}