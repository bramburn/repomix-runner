import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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

  setup(() => {
    sandbox = sinon.createSandbox();
    getCwdStub = sandbox.stub(getCwdModule, 'getCwd');
    runRepomixStub = sandbox.stub(runRepomixModule, 'runRepomix');
    getTempDirStub = sandbox.stub(tempDirManager, 'getTempDir');
    showTempNotificationStub = sandbox.stub(showTempNotificationModule, 'showTempNotification');
    loggerInfoStub = sandbox.stub(logger.both, 'info');
  });

  teardown(() => {
    sandbox.restore();
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

    // Create a mock deps object for testing
    const mockDeps = {
      ...defaultRunRepomixDeps,
    };

    await runRepomixOnSelectedFiles(mockUris, {}, undefined, undefined, undefined, {
      runner: runRepomixStub,
      runRepomixDeps: mockDeps,
    });

    assert.strictEqual(getCwdStub.calledOnce, true);
    assert.strictEqual(runRepomixStub.calledOnce, true);

    sinon.assert.calledWith(runRepomixStub, {
      ...mockDeps,
      mergeConfigOverride: { include: ['file1.ts', 'file2.ts'] },
    });
  });

  test('should merge overrideConfig with calculated include patterns', async () => {
    // Setup a real temp directory to act as workspace root
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repomix-test-'));
    const subDir = path.join(tmpDir, 'subdir');
    fs.mkdirSync(subDir);

    try {
      getCwdStub.returns(tmpDir);

      const uris = [vscode.Uri.file(subDir)];
      const overrideConfig = {
        include: ['**/*.ts'],
        output: { style: 'xml' as const }
      };

      await runRepomixOnSelectedFiles(uris, overrideConfig);

      assert.strictEqual(runRepomixStub.calledOnce, true);
      const args = runRepomixStub.firstCall.args[0];

      // Check that include patterns are calculated correctly for the directory
      // subdir is strictly a directory, so it should expand the include pattern
      // pattern: **/*.ts -> subdir/**/*.ts

      const expectedInclude = ['subdir/**/*.ts'];

      // Verify mergeConfigOverride
      assert.deepStrictEqual(args.mergeConfigOverride.include, expectedInclude);
      assert.strictEqual(args.mergeConfigOverride.output.style, 'xml');

    } finally {
      // Cleanup
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {
        console.error('Failed to cleanup temp dir', e);
      }
    }
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
