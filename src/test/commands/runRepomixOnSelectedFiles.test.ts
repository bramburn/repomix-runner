import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { runRepomixOnSelectedFiles } from '../../commands/runRepomixOnSelectedFiles.js';
import * as getCwdModule from '../../config/getCwd.js';
import * as runRepomixModule from '../../commands/runRepomix.js';
import { defaultRunRepomixDeps } from '../../commands/runRepomix.js';
import { tempDirManager } from '../../core/files/tempDirManager.js';
import { logger } from '../../shared/logger.js';
import * as showTempNotificationModule from '../../shared/showTempNotification.js';

suite('runRepomixOnSelectedFiles', () => {
  let sandbox: sinon.SinonSandbox;
  let getCwdStub: sinon.SinonStub;
  let runRepomixStub: sinon.SinonStub;
  let getTempDirStub: sinon.SinonStub;
  let showTempNotificationStub: sinon.SinonStub;
  let loggerInfoStub: sinon.SinonStub;
  let tempTestDir: string;

  setup(() => {
    sandbox = sinon.createSandbox();
    getCwdStub = sandbox.stub(getCwdModule, 'getCwd');
    runRepomixStub = sandbox.stub(runRepomixModule, 'runRepomix');
    getTempDirStub = sandbox.stub(tempDirManager, 'getTempDir');
    showTempNotificationStub = sandbox.stub(showTempNotificationModule, 'showTempNotification');
    loggerInfoStub = sandbox.stub(logger.both, 'info');

    // Create a temporary directory for real file tests
    tempTestDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repomix-test-'));
  });

  teardown(() => {
    sandbox.restore();
    // Clean up temp dir
    try {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    } catch (e) {
      console.error('Failed to cleanup temp dir:', e);
    }
  });

  test('should run repomix with selected files config', async () => {
    const mockCwd = '/test/path';
    const mockTempDir = '/temp/dir';
    const mockUris = [
      vscode.Uri.file('/test/path/file1.ts'),
      vscode.Uri.file('/test/path/file2.ts'),
    ];

    getCwdStub.returns(mockCwd);
    getTempDirStub.returns(mockTempDir);

    await runRepomixOnSelectedFiles(mockUris);

    assert.strictEqual(getCwdStub.calledOnce, true);
    assert.strictEqual(runRepomixStub.calledOnce, true);

    sinon.assert.calledWith(runRepomixStub, {
      ...defaultRunRepomixDeps,
      mergeConfigOverride: { include: ['file1.ts', 'file2.ts'] },
    });
  });

  test('should merge override config correctly with calculated include patterns', async () => {
    // Setup real directory structure
    const subDirName = 'subdir';
    const subDirPath = path.join(tempTestDir, subDirName);
    fs.mkdirSync(subDirPath);

    // Mock CWD to be the temp directory so relative paths work
    getCwdStub.returns(tempTestDir);
    getTempDirStub.returns('/temp/output');

    const mockUris = [vscode.Uri.file(subDirPath)];

    const overrideConfig = {
      ignore: {
        customPatterns: ['*.log']
      },
      include: ['**/*.ts']
    };

    await runRepomixOnSelectedFiles(mockUris, overrideConfig);

    assert.strictEqual(runRepomixStub.calledOnce, true);

    const expectedInclude = [path.posix.join(subDirName, '**/*.ts')];

    sinon.assert.calledWith(runRepomixStub, {
      ...defaultRunRepomixDeps,
      mergeConfigOverride: {
        ignore: {
          customPatterns: ['*.log']
        },
        include: expectedInclude
      },
    });
  });

  test('should show notification when no files are selected', async () => {
    const mockCwd = '/test/path';
    getCwdStub.returns(mockCwd);

    await runRepomixOnSelectedFiles([]);

    sinon.assert.calledWith(showTempNotificationStub, 'No files selected to run this command! :)');
    sinon.assert.calledWith(loggerInfoStub, 'No files selected');
    assert.strictEqual(runRepomixStub.called, false);
  });
});
