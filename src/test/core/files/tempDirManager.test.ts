import * as assert from 'assert';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { TempDirManager } from '../../../core/files/tempDirManager.js';

suite('TempDirManager Integration Test', () => {
    let tempDirManager: TempDirManager;
    const testDirName = 'repomix-runner-test-integration';

    setup(() => {
        // Create a new manager instance for each test
        // This creates the directory synchronously in constructor
        tempDirManager = new TempDirManager(testDirName);
    });

    teardown(() => {
        // Clean up the manager's directory
        tempDirManager.cleanup();
    });

    test('cleanupFile should delete a file after the specified delay', async () => {
        const tempDir = tempDirManager.getTempDir();
        const testFile = path.join(tempDir, 'test-file.txt');

        // Ensure the temp directory exists
        if (!existsSync(tempDir)) {
            await fs.mkdir(tempDir, { recursive: true });
        }

        await fs.writeFile(testFile, 'test content');

        assert.ok(existsSync(testFile), 'Test file should exist initially');

        const delay = 50; // 50ms delay
        const cleanupPromise = tempDirManager.cleanupFile(testFile, delay);

        // Verify file still exists immediately after call (during the delay)
        assert.ok(existsSync(testFile), 'Test file should still exist immediately after cleanupFile called');

        // Wait for the cleanup to complete
        await cleanupPromise;

        assert.ok(!existsSync(testFile), 'Test file should be deleted after the delay');
    });

    test('cleanupFile should delete a directory recursively after the specified delay', async () => {
        const tempDir = tempDirManager.getTempDir();

        // Ensure the temp directory exists
        if (!existsSync(tempDir)) {
             await fs.mkdir(tempDir, { recursive: true });
        }

        const testSubDir = path.join(tempDir, 'subdir');
        const nestedFile = path.join(testSubDir, 'nested.txt');

        await fs.mkdir(testSubDir, { recursive: true });
        await fs.writeFile(nestedFile, 'nested content');

        assert.ok(existsSync(nestedFile), 'Nested file should exist');

        const delay = 50;
        const cleanupPromise = tempDirManager.cleanupFile(testSubDir, delay);

        assert.ok(existsSync(testSubDir), 'Directory should still exist immediately after call');

        await cleanupPromise;

        assert.ok(!existsSync(testSubDir), 'Directory should be deleted');
    });

    test('cleanupFile should handle non-existent files gracefully', async () => {
        const tempDir = tempDirManager.getTempDir();
        const nonExistentFile = path.join(tempDir, 'non-existent.txt');

        const delay = 10;
        // Should not throw error
        await tempDirManager.cleanupFile(nonExistentFile, delay);
    });
});
