import * as vscode from 'vscode';
import * as path from 'path';
import { compressFile } from '../core/compression/index.js';

export async function testCompression(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showWarningMessage('No active editor found. Open a TypeScript/JavaScript file first.');
    return;
  }

  const filePath = editor.document.fileName;
  const content = editor.document.getText();
  const keepName = await vscode.window.showInputBox({
    prompt: 'Enter a function/class name to keep full (optional)',
    placeHolder: 'e.g. calculateTotal',
  });

  const options = keepName?.trim() ? { keepNames: [keepName.trim()] } : undefined;
  const compressed = await compressFile(filePath, content, options);

  if (!compressed) {
    vscode.window.showErrorMessage('Compression failed. Check console for WASM/parser errors.');
    return;
  }

  const languageId = editor.document.languageId || 'typescript';
  const outputDoc = await vscode.workspace.openTextDocument({
    content: `// Compressed View of: ${path.basename(filePath)}\n// Keeping: ${keepName || 'None'}\n\n${compressed}`,
    language: languageId,
  });

  await vscode.window.showTextDocument(outputDoc, {
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
  });
}
