import * as assert from 'assert';
import * as path from 'path';
import { validateOutputFilePath } from '../../utils/pathValidation';

suite('validateOutputFilePath', () => {
    const cwd = '/workspace';

    test('should pass for simple relative path', () => {
        assert.doesNotThrow(() => validateOutputFilePath('output.txt', cwd));
    });

    test('should pass for relative path in subdirectory', () => {
        assert.doesNotThrow(() => validateOutputFilePath('subdir/output.txt', cwd));
    });

    test('should throw for path traversing out of workspace', () => {
        assert.throws(() => validateOutputFilePath('../output.txt', cwd), /Security validation failed/);
    });

    test('should throw for deep traversal out of workspace', () => {
        assert.throws(() => validateOutputFilePath('subdir/../../output.txt', cwd), /Security validation failed/);
    });

    test('should throw for sibling directory with similar prefix', () => {
        // e.g. /workspace-secrets vs /workspace
        const siblingPath = '/workspace-secrets/file.txt';
        assert.throws(() => validateOutputFilePath(siblingPath, cwd), /Security validation failed/);
    });

    test('should throw for absolute path outside workspace', () => {
        const absPath = '/etc/passwd';
        assert.throws(() => validateOutputFilePath(absPath, cwd), /Security validation failed/);
    });

    test('should pass for absolute path inside workspace', () => {
        const absPath = path.join(cwd, 'output.txt');
        assert.doesNotThrow(() => validateOutputFilePath(absPath, cwd));
    });
});
