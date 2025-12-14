import * as vscode from 'vscode';
import { runRepomix } from './runRepomix.js';
import { getCwd } from '../config/getCwd.js';
import { defaultRunRepomixDeps } from './runRepomix.js';
import { logger } from '../shared/logger.js';
import { showTempNotification } from '../shared/showTempNotification.js';
import * as path from 'path';
import { RepomixConfigFile } from '../config/configSchema.js';

export async function runRepomixOnSelectedFiles(
  uris: vscode.Uri[],
  overrideConfig: RepomixConfigFile = {}
) {
  let cwd = getCwd();

  if (!uris || uris.length === 0) {
    logger.both.info('No files selected');
    showTempNotification('No files selected to run this command! :)');
    return;
  }

  const workspaceFolders = uris
    .map(uri => vscode.workspace.getWorkspaceFolder(uri))
    .filter((wf): wf is vscode.WorkspaceFolder => wf !== undefined);

  if (workspaceFolders.length > 0) {
    const firstFolder = workspaceFolders[0];
    const allSame = workspaceFolders.every(
      f => f.uri.toString() === firstFolder.uri.toString()
    );

    if (!allSame) {
      vscode.window.showErrorMessage(
        'Multi-root selection is not supported. Please select files from a single workspace root.'
      );
      return;
    }
    cwd = firstFolder.uri.fsPath;
  }

  const selectedFiles = uris.map(uri => path.relative(cwd, uri.fsPath));

  logger.both.info(`Running repomix on selected files: ${selectedFiles.join(', ')}`);

  // TODO add test for config merging
  const finalOverrideConfig = {
    ...overrideConfig,
    ...{ include: selectedFiles },
  };

  await runRepomix({
    ...defaultRunRepomixDeps,
    getCwd: () => cwd,
    mergeConfigOverride: finalOverrideConfig,
  });
}
