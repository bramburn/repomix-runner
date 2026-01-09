import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { encode } from 'gpt-tokenizer';
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
 * List of binary file extensions to skip
 */
const BINARY_EXTENSIONS = new Set([
  // Executables
  '.exe', '.dll', '.so', '.dylib', '.app', '.bin',
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg', '.webp',
  // Videos
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm',
  // Audio
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a',
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
  // Documents (binary formats)
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // Fonts
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  // Other binary files
  '.sqlite', '.db', '.jar', '.war', '.ear', '.class', '.pyc', '.pyo',
  '.obj', '.lib', '.pdb', '.idb', '.suo', '.sln', '.dmg', '.pkg',
]);

/**
 * Known text basenames (including dotfiles) that often have NO extension.
 */
const TEXT_BASENAMES = new Set([
  // Docs
  'readme', 'license', 'changelog',
  // Build / tooling
  'makefile', 'dockerfile', 'podfile', 'gemfile', 'fastfile', 'appfile', 'brewfile',
  // iOS / CocoaPods
  'podfile.lock',
  // Python
  'pipfile', 'pipfile.lock',
  // Rust
  'cargo.toml', 'cargo.lock',
  // JS
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  // Java / Android
  'gradle.properties', 'settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts',
  // Dotfiles
  '.env', '.env.local', '.env.development', '.env.production', '.env.test',
  '.gitignore', '.gitattributes', '.gitmodules',
  '.editorconfig', '.npmrc', '.nvmrc',
  '.prettierrc', '.prettierignore', '.eslintrc', '.eslintignore',
].map((s) => s.toLowerCase()));

/**
 * List of text-based file extensions to process
 */
const TEXT_EXTENSIONS = new Set([
  // Code files
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
  '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.kts', '.scala', '.dart',
  '.m', '.mm',
  // Web / markup
  '.html', '.htm', '.css', '.scss', '.sass', '.less', '.styl',
  '.xml',
  // Data / config
  '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.properties', '.env',
  '.plist', '.xcconfig', '.pbxproj',
  '.sql', '.graphql', '.gql', '.proto',
  // Docs / plain text
  '.md', '.mdx', '.txt', '.log',
  // Shell / scripts
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
]);

/**
 * Check if a file is likely a binary file.
 * Strategy:
 * - Known binary extensions => binary
 * - Known text extensions or known text basenames => text
 * - No extension => text ONLY if basename is in TEXT_BASENAMES
 * - Unknown extension => assume binary (conservative)
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();

  if (BINARY_EXTENSIONS.has(ext)) {return true;}
  if (TEXT_EXTENSIONS.has(ext)) {return false;}
  // Basename whitelist (covers extensionless + dotfiles)
  if (TEXT_BASENAMES.has(basename)) {return false;}
  // Common text files without extensions
  if (basename === 'readme' || basename === 'license' || basename === 'changelog') {return false;}
  // If no extension, default to binary unless whitelisted above
  if (!ext) {return true;}
  // Unknown extensions - assume binary for safety
  return true;
}

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

  const entries: string[] = [];

  for (const relativeFile of relativeFiles) {
    const fullPath = path.join(cwd, relativeFile);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      entries.push(`<file path="${relativeFile}">[Error: File not found]</file>`);
      console.warn(`[Repomix] File not found: ${relativeFile}`);
      continue;
    }

    // Check if it's a file (not a directory)
    const stats = await fs.promises.stat(fullPath).catch(() => null);
    if (!stats || !stats.isFile()) {
      entries.push(`<file path="${relativeFile}">[Error: Not a file]</file>`);
      console.warn(`[Repomix] Not a file: ${relativeFile}`);
      continue;
    }

    // Skip binary files
    if (isBinaryFile(relativeFile)) {
      console.log(`[Repomix] Skipping binary file: ${relativeFile}`);
      continue;
    }

    // Read file content
    try {
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      entries.push(`<file path="${relativeFile}">${content}</file>`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      entries.push(`<file path="${relativeFile}">[Error: ${errorMsg}]</file>`);
      console.warn(`[Repomix] Failed to read file: ${relativeFile}`, error);
    }
  }

  if (entries.length === 0) {
    throw new Error('No text files could be read (all files may be binary)');
  }

  const concatenated = entries.join('\n');

  // Calculate token count for user feedback
  const tokenCount = await calculateTokenCount(concatenated);
  console.log(`[Repomix] Generated markdown with ${tokenCount} tokens from ${entries.length} files`);

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
      try { await fs.promises.unlink(tempOutputFile); } catch {}
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
