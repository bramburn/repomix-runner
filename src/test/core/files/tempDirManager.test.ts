import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as sinon from 'sinon';
import { TempDirManager } from '../../../core/files/tempDirManager.js';
import { logger } from '../../../shared/logger.js';
import * as vscode from 'vscode';

suite('TempDirManager Integration Test', () => {
  let tempDirManager: TempDirManager;
  let testTempDir: string;
  let showErrorMessageStub: sinon.SinonStub;

  setup(() => {
    // Stub VS Code window.showErrorMessage and logger to prevent side effects
    showErrorMessageStub = sinon.stub(vscode.window, 'showErrorMessage');
    sinon.stub(logger.output, 'error');
    sinon.stub(logger.both, 'debug');
    sinon.stub(logger.both, 'error');

    // Create a new instance for each test
    tempDirManager = new TempDirManager('test_repomix_runner');
    testTempDir = tempDirManager.getTempDir();
  });

  teardown(() => {
    // Cleanup any remaining files
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
    sinon.restore();
  });

  test('cleanupFile should wait and then remove a file', async () => {
    // Create a test file
    const filePath = path.join(testTempDir, 'test-file.txt');
    if (!fs.existsSync(testTempDir)) {
      fs.mkdirSync(testTempDir, { recursive: true });
    }
    fs.writeFileSync(filePath, 'test content');

    assert.ok(fs.existsSync(filePath), 'File should exist before cleanup');

    // Call cleanupFile with a short delay (e.g., 50ms)
    const delay = 50;
    const cleanupPromise = tempDirManager.cleanupFile(filePath, delay);

    // Verify file still exists immediately after call (since it waits)
    assert.ok(fs.existsSync(filePath), 'File should still exist immediately after calling cleanupFile');

    // Wait for the cleanup to complete
    await cleanupPromise;

    // Verify file is gone
    assert.ok(!fs.existsSync(filePath), 'File should be removed after cleanup');
  });

  test('cleanupFile should wait and then remove a directory recursively', async () => {
    // Create a test directory with a file inside
    const dirPath = path.join(testTempDir, 'test-dir');
    const innerFilePath = path.join(dirPath, 'inner-file.txt');

    if (!fs.existsSync(testTempDir)) {
      fs.mkdirSync(testTempDir, { recursive: true });
    }
    fs.mkdirSync(dirPath);
    fs.writeFileSync(innerFilePath, 'inner content');

    assert.ok(fs.existsSync(dirPath), 'Directory should exist before cleanup');
    assert.ok(fs.existsSync(innerFilePath), 'Inner file should exist before cleanup');

    // Call cleanupFile with a short delay
    const delay = 50;
    const cleanupPromise = tempDirManager.cleanupFile(dirPath, delay);

    // Verify directory still exists immediately
    assert.ok(fs.existsSync(dirPath), 'Directory should still exist immediately after calling cleanupFile');

    // Wait for the cleanup to complete
    await cleanupPromise;

    // Verify directory is gone
    assert.ok(!fs.existsSync(dirPath), 'Directory should be removed after cleanup');
  });
});
