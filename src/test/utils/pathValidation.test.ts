import * as assert from 'assert';
import * as path from 'path';
import { validateOutputFilePath } from '../../utils/pathValidation';

// Standardize the workspace root for testing
const workspaceRoot = path.resolve('/test/workspace');

suite('validateOutputFilePath Security Checks', () => {

    test('should pass for simple relative path', () => {
        assert.doesNotThrow(() => validateOutputFilePath('output.txt', workspaceRoot));
    });

    test('should pass for relative path in subdirectory', () => {
        assert.doesNotThrow(() => validateOutputFilePath('subdir/output.txt', workspaceRoot));
    });

    test('should pass for path that resolves to the root directory itself (dot)', () => {
        assert.doesNotThrow(() => validateOutputFilePath('.', workspaceRoot));
    });

    test('should pass for path that is the absolute root directory itself', () => {
        assert.doesNotThrow(() => validateOutputFilePath(workspaceRoot, workspaceRoot));
    });

    test('should pass for absolute path inside workspace', () => {
        const absPath = path.join(workspaceRoot, 'output.txt');
        assert.doesNotThrow(() => validateOutputFilePath(absPath, workspaceRoot));
    });
    
    // --- Traversal and Security Failure Cases ---

    test('should throw for path traversing out of workspace (simple ../)', () => {
        assert.throws(() => validateOutputFilePath('../output.txt', workspaceRoot), /Security/);
    });

    test('should throw for deep traversal out of workspace (subdir/../../)', () => {
        assert.throws(() => validateOutputFilePath('subdir/../../output.txt', workspaceRoot), /Security/);
    });

    test('should throw for absolute path outside workspace', () => {
        const absPath = '/etc/passwd';
        assert.throws(() => validateOutputFilePath(absPath, workspaceRoot), /Security/);
    });

    test('should throw for sibling directory with similar prefix (partial path match)', () => {
        // e.g. /test/workspace_secret vs /test/workspace
        const siblingPath = workspaceRoot + '_secret/file.txt';
        assert.throws(() => validateOutputFilePath(siblingPath, workspaceRoot), /Security/);
    });

});