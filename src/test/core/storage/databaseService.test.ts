import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { DatabaseService } from '../../../core/storage/databaseService.js';

suite('DatabaseService (repo_file_state prefix lookup)', () => {
  let dbService: DatabaseService;
  let tempDir: string;
  let sandbox: sinon.SinonSandbox;
  const repoId = 'test-repo';

  setup(async () => {
    sandbox = sinon.createSandbox();

    tempDir = path.join(__dirname, 'temp_db_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    const mockContext = {
      globalStorageUri: vscode.Uri.file(path.join(tempDir, 'storage')),
      secrets: {
        get: sandbox.stub(),
        store: sandbox.stub()
      }
    } as unknown as vscode.ExtensionContext;

    dbService = new DatabaseService(mockContext);
    await dbService.initialize();
  });

  teardown(() => {
    dbService.dispose();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    sandbox.restore();
  });

  test('getRepoFilePathsByPathOrPrefix should return descendants for directory path without sibling overmatch', async () => {
    await dbService.markRepoFileIndexed(repoId, 'src/utils/a.ts', 'hash-a');
    await dbService.markRepoFileIndexed(repoId, 'src/utils/nested/b.ts', 'hash-b');
    await dbService.markRepoFileIndexed(repoId, 'src/utils2/c.ts', 'hash-c');

    const matches = await dbService.getRepoFilePathsByPathOrPrefix(repoId, 'src/utils');

    assert.deepStrictEqual(matches, ['src/utils/a.ts', 'src/utils/nested/b.ts']);
  });

  test('getRepoFilePathsByPathOrPrefix should return exact file match', async () => {
    await dbService.markRepoFileIndexed(repoId, 'src/main.ts', 'hash-main');
    await dbService.markRepoFileIndexed(repoId, 'src/other.ts', 'hash-other');

    const matches = await dbService.getRepoFilePathsByPathOrPrefix(repoId, 'src/main.ts');

    assert.deepStrictEqual(matches, ['src/main.ts']);
  });
});
