import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getCwd } from '../config/getCwd.js';
import { readRepomixRunnerVscodeConfig } from '../config/configLoader.js';
import { generateCompressedMarkdownContent } from '../core/files/compressedMarkdownGenerator.js';
import { tempDirManager } from '../core/files/tempDirManager.js';
import { copyToClipboard } from '../core/files/copyToClipboard.js';
import { expandUrisToFilesRespectingGitignore } from '../core/files/filteredFileExpander';

/**
 * Expands a list of URIs (files or folders) into a flat list of file URIs.
 * Recursively walks folders. Stops when maxFiles is reached.
 */
async function expandUrisToFiles(
  uris: vscode.Uri[],
  maxFiles: number
): Promise<vscode.Uri[]> {
  const result: vscode.Uri[] = [];
  const visited = new Set<string>();

  async function walk(uri: vscode.Uri) {
    if (result.length >= maxFiles) {
      return;
    }

    const key = uri.toString();
    if (visited.has(key)) {
      return;
    }
    visited.add(key);

    try {
      const stat = await vscode.workspace.fs.stat(uri);

      if (stat.type & vscode.FileType.File) {
        result.push(uri);
        return;
      }

      if (stat.type & vscode.FileType.Directory) {
        const entries = await vscode.workspace.fs.readDirectory(uri);
        for (const [name, type] of entries) {
          await walk(vscode.Uri.joinPath(uri, name));
        }
      }
    } catch (err) {
      console.warn(`[Repomix] Failed to read ${uri.toString()}:`, err);
    }
  }

  for (const uri of uris) {
    await walk(uri);
  }

  return result;
}

export async function copySelectedFilesAsCompressed(
  context: vscode.ExtensionContext,
  clickedFile: vscode.Uri,
  selectedFiles?: vscode.Uri[]
) {
  const MAX_FILES = 50;

  try {
    const cwd = getCwd();
    const config = readRepomixRunnerVscodeConfig();
    const { copyMode, respectGitignoreInMarkdown } = config.runner;

    // Fallback to clickedFile if selectedFiles is empty
    const sourceUris = selectedFiles?.length ? selectedFiles : [clickedFile];

    // Expand folders into files (up to MAX_FILES) with optional gitignore filtering
    const expansionResult = await expandUrisToFilesRespectingGitignore(
      sourceUris,
      MAX_FILES,
      cwd,
      respectGitignoreInMarkdown
    );
    
    const expandedFiles = expansionResult.files;

    if (expandedFiles.length === 0) {
      vscode.window.showWarningMessage(
        "Selected items contain no files inside the workspace"
      );
      return;
    }

    // Show warning if we hit the limit
    if (expandedFiles.length === MAX_FILES) {
      vscode.window.showWarningMessage(
        `Only the first ${MAX_FILES} files were included.`
      );
    }

    // Show info about ignored files if gitignore filtering was applied
    if (respectGitignoreInMarkdown && expansionResult.ignoredCount > 0) {
      const fileWord = expansionResult.ignoredCount === 1 ? 'file' : 'files';
      console.log(`[Repomix] Ignored ${expansionResult.ignoredCount} ${fileWord} due to .gitignore rules`);
      
      // Only show notification for significant numbers of ignored files
      if (expansionResult.ignoredCount >= 5) {
        vscode.window.showInformationMessage(
          `${expansionResult.ignoredCount} files were ignored due to .gitignore rules`
        );
      }
    }

    const relativeFiles = expandedFiles
      .map((uri) => path.relative(cwd, uri.fsPath))
      .filter((f) => !f.startsWith(".."));

    if (relativeFiles.length === 0) {
      vscode.window.showWarningMessage(
        "Selected files are outside the workspace"
      );
      return;
    }

    // Basic validation
    if (relativeFiles.some(f => f.includes('..') || path.isAbsolute(f))) {
      vscode.window.showErrorMessage('Invalid file list: relative paths contain .. or are absolute');
      return;
    }

    console.log(`[Repomix] Copying ${relativeFiles.length} files as compressed Markdown (mode: ${copyMode}${respectGitignoreInMarkdown ? ', gitignore filtering: ON' : ''})`);

    // Generate compressed content and get token count
    const { concatenated, tokenCount } = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Repomix: Copying ${relativeFiles.length} files (compressed)...`
      },
      async () => {
        // Generate compressed content regardless of copy mode
        const result = await generateCompressedMarkdownContent(cwd, relativeFiles);
        
        if (copyMode === 'content') {
          await vscode.env.clipboard.writeText(result.concatenated);
        } else {
          // For file mode, we need to write compressed content to temp file and use Rust binary
          await copyCompressedToFileMode(context, cwd, result.concatenated, result.tokenCount);
        }
        
        return result;
      }
    );

    const fileWord = relativeFiles.length === 1 ? "file" : "files";
    const modeSuffix = copyMode === 'content' ? "content " : "";
    const gitignoreSuffix = respectGitignoreInMarkdown ? " (respecting .gitignore)" : "";
    const formattedTokenCount = ` (${tokenCount.toLocaleString()} tokens)`;

    const message = vscode.window.showInformationMessage(
      `✓ Copied Compressed ${relativeFiles.length} ${formattedTokenCount} ${fileWord} ${modeSuffix} to clipboard${gitignoreSuffix}`
    );
    setTimeout(() => {
      message.then(() => {});
    }, 5000); 
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Repomix] Failed to copy selected files:", err);
    vscode.window.showErrorMessage(`Failed to copy files: ${msg}`);
  }
}

/**
 * Helper function to handle file mode copying for compressed content
 */
async function copyCompressedToFileMode(
  context: vscode.ExtensionContext,
  cwd: string,
  content: string,
  tokenCount: number
): Promise<{ tokenCount: number }> {
  // Create temp directory and file
  const tempDir = await tempDirManager.createTempDir('repomix-compressed');
  const tempFilePath = path.join(tempDir, 'compressed-output.md');
  
  // Write compressed content to temp file
  await fs.promises.writeFile(tempFilePath, content, 'utf-8');
  
  // Copy temp file to clipboard using the existing copyToClipboard function
  const tmpFilePath = path.join(tempDirManager.getTempDir(), `compressed_${Date.now()}.md`);
  await fs.promises.mkdir(path.dirname(tmpFilePath), { recursive: true });
  await fs.promises.copyFile(tempFilePath, tmpFilePath);
  
  await copyToClipboard(tempFilePath, tmpFilePath);
  
  // Cleanup temp files after delay
  await tempDirManager.cleanupFile(tmpFilePath);
  
  return { tokenCount };
}