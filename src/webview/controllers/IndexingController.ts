import * as vscode from 'vscode';
import { BaseController } from './BaseController.js';
import { DatabaseService } from '../../core/storage/databaseService.js';
import { getCwd } from '../../config/getCwd.js';
import { indexRepository } from '../../core/indexing/repoIndexer.js';
import { getRepoId } from '../../utils/repoIdentity.js';

export class IndexingController extends BaseController {
  constructor(
    context: any,
    private readonly databaseService: DatabaseService
  ) {
    super(context);
  }

  async handleMessage(message: any): Promise<boolean> {
    switch (message.command) {
      case 'indexRepo':
        await this.handleIndexRepo();
        return true;
      case 'deleteRepoIndex':
        await this.handleDeleteRepoIndex();
        return true;
      case 'getRepoIndexCount':
        await this.handleGetRepoIndexCount();
        return true;
    }
    return false;
  }

  async onWebviewLoaded() {
    await this.handleGetRepoIndexCount();
  }

  private async handleIndexRepo() {
    try {
      const cwd = getCwd();

      // Notify starting
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Indexing Repository...",
        cancellable: false
      }, async () => {
        const count = await indexRepository(cwd, this.databaseService);

        this.context.postMessage({
          command: 'repoIndexComplete',
          count
        });

        vscode.window.showInformationMessage(`Successfully indexed ${count} files.`);
      });

    } catch (error) {
      console.error('Failed to index repo:', error);
      vscode.window.showErrorMessage(`Failed to index repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleDeleteRepoIndex() {
    try {
      const cwd = getCwd();
      const repoId = await getRepoId(cwd);

      await this.databaseService.clearRepoFiles(repoId);

      this.context.postMessage({
        command: 'repoIndexDeleted'
      });

      vscode.window.showInformationMessage('Repository index cleared.');

    } catch (error) {
      console.error('Failed to delete repo index:', error);
      vscode.window.showErrorMessage(`Failed to delete index: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleGetRepoIndexCount() {
    try {
      const cwd = getCwd();
      const repoId = await getRepoId(cwd);
      const count = await this.databaseService.getRepoFileCount(repoId);

      this.context.postMessage({
        command: 'repoIndexCount',
        count
      });

    } catch (error) {
      console.error('Failed to get repo index count:', error);
    }
  }
}