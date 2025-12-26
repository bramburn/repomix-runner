import * as vscode from 'vscode';
import * as path from 'path';
import { getCwd } from '../config/getCwd';
import { runRepomixClipboardGenerateMarkdown } from '../core/files/runRepomixClipboardGenerateMarkdown';

export async function copySelectedFilesToClipboard(
  context: vscode.ExtensionContext,
  clickedFile: vscode.Uri, 
  selectedFiles?: vscode.Uri[]
) {
  try {
    const cwd = getCwd();
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

    console.log(`[Repomix] Copying ${relativeFiles.length} files as Markdown`);

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification },
      async () => {
        await runRepomixClipboardGenerateMarkdown(context, cwd, relativeFiles);
      }
    );

    const fileWord = relativeFiles.length === 1 ? "file" : "files";
    vscode.window.showInformationMessage(
      `✓ Copied ${relativeFiles.length} ${fileWord} as Markdown to clipboard`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Repomix] Failed to copy selected files:", err);
    vscode.window.showErrorMessage(`Failed to copy files: ${msg}`);
  }
}
