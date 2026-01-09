import * as vscode from 'vscode';
import { execPromisify } from '../../shared/execPromisify.js';
import { copyFile, access } from 'fs/promises';
import { tempDirManager } from './tempDirManager.js';
import * as path from 'path';
import * as fs from 'fs';
import { readRepomixRunnerVscodeConfig } from '../../config/configLoader.js';
import { getRemoteEnvironment } from './remoteDetection.js';
type OperatingSystem = 'darwin' | 'win32' | 'linux';

async function checkXclipInstalled(dep: { execPromisify: typeof execPromisify }): Promise<boolean> {
  try {
    await dep.execPromisify('command -v xclip');
    return true;
  } catch {
    return false;
  }
}

function toUri(path: string): string {
  return `file://${path.replace(/ /g, '%20')}`;
}

const CLIPBOARD_COMMANDS = {
  darwin: (path: string) =>
    `osascript -e 'tell application "Finder" to set the clipboard to (POSIX file "${path}")'`,
  win32: (path: string) => {
    return `"${getWin32BinaryPath()}" "${path}"`;
  },
  linux: (path: string) => `echo "${toUri(path)}" | xclip -selection clipboard -t text/uri-list`,
} as const;

function getWin32BinaryPath(): string {
  const possiblePaths = [
    path.join(__dirname, '..', 'assets', 'bin', 'repomix-clipboard.exe'), // dist/../assets = assets
    path.join(__dirname, 'assets', 'bin', 'repomix-clipboard.exe'),       // dist/assets?
    path.join(__dirname, '..', '..', '..', 'assets', 'bin', 'repomix-clipboard.exe'), // src/core/files/../../../assets (dev)
    path.join(process.cwd(), 'assets', 'bin', 'repomix-clipboard.exe') // Fallback to CWD
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return 'repomix-clipboard.exe';
}



export async function copyToClipboard(
  outputFileAbs: string,
  tmpFilePath: string,
  os?: OperatingSystem,
  dep: {
    copyFile: typeof copyFile;
    execPromisify: typeof execPromisify;
    access: typeof access;
    createTempDir: typeof tempDirManager.createTempDir;
  } = {
      copyFile,
      execPromisify,
      access,
      createTempDir: tempDirManager.createTempDir,
    }
) {
  console.log('[copy2clipboard] Starting copy operation:', {
    outputFileAbs,
    tmpFilePath,
    providedOs: os,
  });

  // Determine correct OS: use client OS from remote detection if available, otherwise use provided os or process.platform
  const targetOs = os || getRemoteEnvironment().localOs as OperatingSystem;
  console.log('[copy2clipboard] Target OS determined:', targetOs);

  const config = readRepomixRunnerVscodeConfig();
  console.log('[copy2clipboard] Copy mode:', config.runner.copyMode);
  if (config.runner.copyMode === 'content') {
    console.log('[copy2clipboard] Using content mode (clipboard API)');
    try {
      const content = await fs.promises.readFile(outputFileAbs, 'utf-8');
      await vscode.env.clipboard.writeText(content);
      console.log('[copy2clipboard] Content copied successfully via clipboard API');
      // Optional: Showing a message here might be redundant if the caller also shows one, 
      // but usually the caller shows "Copied..." messages. 
      // However, the caller usually expects this function to JUST do the copy.
      // The controllers often show their own success message. 
      // check if we should show message here? 
      // The existing code threw errors but didn't show success info inside this function (execution did).
      // But for 'content' mode via VSCode API, it's instant.

      // Actually, existing controllers show success message AFTER this function returns.
      // So we should NOT show message here to avoid double messaging, UNLESS the caller message is specific to "File".
      // Most callers say "Copied X to clipboard". 
      // BundleController: `vscode.window.showInformationMessage(\`Copied "${originalFilename}" to clipboard.\`);`
      // So we are good. just return.
      return;
    } catch (error: any) {
      console.error('[copy2clipboard] Failed to copy content:', error);
      vscode.window.showErrorMessage(`Failed to copy content to clipboard: ${error.message}`);
      throw error;
    }
  }

  console.log('[copy2clipboard] Using file mode (binary clipboard)');

  if (targetOs === 'linux') {
    console.log('[copy2clipboard] Linux detected, checking for xclip');
    const isXclipInstalled = await checkXclipInstalled(dep);
    if (!isXclipInstalled) {
      vscode.window.showErrorMessage(
        'xclip is not installed on this system, you need it to copy file to clipboard: sudo apt-get install xclip'
      );
      return;
    }
    console.log('[copy2clipboard] xclip is installed');
  }

  // Check if the temporary file exists before proceeding
  try {
    await dep.access(tmpFilePath);
    console.log('[copy2clipboard] Temp file exists:', tmpFilePath);
  } catch {
    console.log('[copy2clipboard] Temp file does not exist, creating directory');
    dep.createTempDir('repomix_runner');
  }

  // First copy the file to the tmp folder to keep the file if config.runner.keepOutputFile is false
  try {
    await dep.copyFile(outputFileAbs, tmpFilePath);
    console.log('[copy2clipboard] File copied to temp location');
  } catch (copyError) {
    console.error('[copy2clipboard] Failed to copy file to temp folder:', copyError);
    vscode.window.showErrorMessage(`Could not copy output file to temp folder: ${copyError}`);
    throw copyError;
  }

  if (!(targetOs in CLIPBOARD_COMMANDS)) {
    console.error('[copy2clipboard] Unsupported OS:', targetOs);
    throw new Error(`Unsupported operating system: ${targetOs}`);
  }

  try {
    const command = CLIPBOARD_COMMANDS[targetOs](tmpFilePath);
    console.log('[copy2clipboard] Executing clipboard command for platform:', targetOs);
    await dep.execPromisify(command);
    console.log('[copy2clipboard] Clipboard command executed successfully');
  } catch (err: any) {
    console.error('[copy2clipboard] Clipboard command failed:', err);
    if (targetOs === 'win32') {
      vscode.window.showErrorMessage(`Error setting file to clipboard using helper tool: ${err.message}. Ensure repomix-clipboard.exe is correctly installed.`);
    } else {
      vscode.window.showErrorMessage(`Error setting file to clipboard: ${err.message}`);
    }
    throw err;
  }
}
