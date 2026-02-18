import * as vscode from 'vscode';
import * as path from 'path';
import { getCwd } from '../config/getCwd';
import { runRepomixClipboardGenerateMarkdown } from '../core/files/runRepomixClipboardGenerateMarkdown';
import { readRepomixRunnerVscodeConfig } from '../config/configLoader';
import { generateMarkdownContent } from '../core/files/markdownGenerator';
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
        for (const [name, fileType] of entries) {
          if (result.length >= maxFiles) {
            break;
          }
          const child = vscode.Uri.joinPath(uri, name);
          if (fileType & vscode.FileType.File) {
            result.push(child);
          } else if (fileType & vscode.FileType.Directory) {
            await walk(child);
          }
        }
      }
    } catch {
      // File might not exist or be inaccessible, skip it
    }
  }

  for (const uri of uris) {
    await walk(uri);
    if (result.length >= maxFiles) {
      break;
    }
  }

  return result;
}

export async function copySelectedFilesToClipboard(
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

    console.log(`[Repomix] Copying ${relativeFiles.length} files as Markdown (mode: ${copyMode}${respectGitignoreInMarkdown ? ', gitignore filtering: ON' : ''})`);

    let result: { tokenCount: number } | undefined;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Repomix: Copying ${relativeFiles.length} files...`
      },
      async () => {
        if (copyMode === 'content') {
          const { concatenated, tokenCount } = await generateMarkdownContent(cwd, relativeFiles);
          await vscode.env.clipboard.writeText(concatenated);
          result = { tokenCount };
        } else {
          result = await runRepomixClipboardGenerateMarkdown(context, cwd, relativeFiles);
        }
      }
    );

    const fileWord = relativeFiles.length === 1 ? "file" : "files";
    const modeSuffix = copyMode === 'content' ? "content " : "";
    const gitignoreSuffix = respectGitignoreInMarkdown ? " (respecting .gitignore)" : "";
    const formattedTokenCount = result?.tokenCount ? ` (${result.tokenCount.toLocaleString()} tokens)` : "";

    vscode.window.showInformationMessage(
      `✓ Copied ${relativeFiles.length} ${fileWord} ${modeSuffix}as Markdown to clipboard${gitignoreSuffix}${formattedTokenCount}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Repomix] Failed to copy selected files:", err);
    vscode.window.showErrorMessage(`Failed to copy files: ${msg}`);
  }
}
