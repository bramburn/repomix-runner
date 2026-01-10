import * as vscode from 'vscode';
import * as path from 'path';
import { getCwd } from '../config/getCwd';
import { runRepomixClipboardGenerateMarkdown } from '../core/files/runRepomixClipboardGenerateMarkdown';
import { readRepomixRunnerVscodeConfig } from '../config/configLoader';
import { generateMarkdownContent } from '../core/files/markdownGenerator';

export async function copySelectedFilesToClipboard(
  context: vscode.ExtensionContext,
  clickedFile: vscode.Uri,
  selectedFiles?: vscode.Uri[]
) {
  try {
    const cwd = getCwd();
    const config = readRepomixRunnerVscodeConfig();
    const filesToCopy = selectedFiles?.length ? selectedFiles : [clickedFile];

    const relativeFiles = filesToCopy
      .map((uri) => path.relative(cwd, uri.fsPath))
      .filter((f) => !f.startsWith(".."));

    if (relativeFiles.length === 0) {
      vscode.window.showWarningMessage(
        "Selected files are outside the workspace"
      );
      return;
    }

    const { copyMode } = config.runner;
    console.log(`[Repomix] Copying ${relativeFiles.length} files as Markdown (mode: ${copyMode})`);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Repomix: Copying ${relativeFiles.length} files...`
      },
      async () => {
        if (copyMode === 'content') {
          const { concatenated } = await generateMarkdownContent(cwd, relativeFiles);
          await vscode.env.clipboard.writeText(concatenated);
        } else {
          await runRepomixClipboardGenerateMarkdown(context, cwd, relativeFiles);
        }
      }
    );

    const fileWord = relativeFiles.length === 1 ? "file" : "files";
    const modeSuffix = copyMode === 'content' ? "content " : "";
    vscode.window.showInformationMessage(
      `✓ Copied ${relativeFiles.length} ${fileWord} ${modeSuffix}as Markdown to clipboard`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Repomix] Failed to copy selected files:", err);
    vscode.window.showErrorMessage(`Failed to copy files: ${msg}`);
  }
}
