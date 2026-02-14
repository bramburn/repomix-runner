import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getCwd } from '../config/getCwd.js';
import { readRepomixRunnerVscodeConfig } from '../config/configLoader.js';
import { generateCompressedMarkdownContent } from '../core/files/compressedMarkdownGenerator.js';
import { tempDirManager } from '../core/files/tempDirManager.js';
import { copyToClipboard } from '../core/files/copyToClipboard.js';

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
    const { copyMode } = config.runner;

    // Fallback to clickedFile if selectedFiles is empty
    const sourceUris = selectedFiles?.length ? selectedFiles : [clickedFile];

    // Expand folders into files (up to MAX_FILES)
    const expandedFiles = await expandUrisToFiles(sourceUris, MAX_FILES);

    if (expandedFiles.length === 0) {
      vscode.window.showWarningMessage(
        "Selected items contain no files inside the workspace"
      );
      return;
    }

    if (expandedFiles.length === MAX_FILES) {
      vscode.window.showWarningMessage(
        `Only the first ${MAX_FILES} files were included.`
      );
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

    console.log(`[Repomix] Copying ${relativeFiles.length} files as compressed Markdown (mode: ${copyMode})`);

    let result: { tokenCount: number } | undefined;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Repomix: Copying ${relativeFiles.length} files (compressed)...`
      },
      async () => {
        // Generate compressed content regardless of copy mode
        const { concatenated, tokenCount } = await generateCompressedMarkdownContent(cwd, relativeFiles);
        
        if (copyMode === 'content') {
          await vscode.env.clipboard.writeText(concatenated);
          result = { tokenCount };
        } else {
          // For file mode, we need to write compressed content to temp file and use Rust binary
          result = await copyCompressedToFileMode(context, cwd, concatenated, tokenCount);
        }
      }
    );

    const fileWord = relativeFiles.length === 1 ? "file" : "files";
    const modeSuffix = copyMode === 'content' ? "content " : "";
    const formattedTokenCount = result?.tokenCount ? ` (${result.tokenCount.toLocaleString()} tokens)` : "";

    vscode.window.showInformationMessage(
      `✓ Copied ${relativeFiles.length} ${fileWord} ${modeSuffix}as compressed Markdown to clipboard${formattedTokenCount}`
    );
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