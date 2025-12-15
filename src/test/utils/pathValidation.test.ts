import * as assert from 'assert';
import * as path from 'path';
import { validateOutputFilePath } from '../../utils/pathValidation.js';

suite('Path Validation', () => {
    const rootDir = '/root';

    test('Valid relative file path', () => {
        // file.txt in /root -> PASS
        assert.doesNotThrow(() => validateOutputFilePath('file.txt', rootDir));
    });

    test('Valid deep relative path', () => {
        // a/b/c/file.txt in /root -> PASS
        assert.doesNotThrow(() => validateOutputFilePath('a/b/c/file.txt', rootDir));
    });

    test('Valid absolute path inside root', () => {
        // /root/file.txt in /root -> PASS
        const absolutePath = path.join(rootDir, 'file.txt');
        assert.doesNotThrow(() => validateOutputFilePath(absolutePath, rootDir));
    });

    test('Valid path with similar prefix (partial match edge case handled)', () => {
        // /root/..foo is valid file inside /root
        // Note: '..foo' is a valid filename.
        // path.resolve('/root', '..foo') -> /root/..foo.
        // path.relative('/root', '/root/..foo') -> '..foo'.
        // It should pass.
        assert.doesNotThrow(() => validateOutputFilePath('..foo', rootDir));
    });

    test('Attack Vector: Parent directory traversal', () => {
        // ../file.txt -> THROW
        assert.throws(() => validateOutputFilePath('../file.txt', rootDir), /Invalid output path/);
    });

    test('Attack Vector: Deep traversal', () => {
        // ../../../../etc/passwd -> THROW
        assert.throws(() => validateOutputFilePath('../../../../etc/passwd', rootDir), /Invalid output path/);
    });

    test('Attack Vector: Absolute path outside root', () => {
        // /etc/passwd -> THROW
        // Using /etc/passwd as example of absolute path outside /root
        const outsidePath = '/etc/passwd';
        assert.throws(() => validateOutputFilePath(outsidePath, rootDir), /Invalid output path/);
    });

    test('Attack Vector: Partial match prefix', () => {
        // /root_secret/file when root is /root -> THROW
        // This validates that startsWith check (if used) correctly handles directory boundaries.
        // /root_secret is a sibling of /root, not a child.
        const partialMatchPath = '/root_secret/file';
        assert.throws(() => validateOutputFilePath(partialMatchPath, rootDir), /Invalid output path/);
    });

    test('Attack Vector: Root itself as output (if meant to be file)', () => {
        // If user tries to write to '.', it resolves to rootDir.
        // The prompt doesn't explicitly say fail, but usually we output to a file.
        // However, technically '.' is 'inside' root.
        // My implementation allows it (relative === '').
        // If I should fail, I'd need to change implementation.
        // But for now, let's just test that it doesn't throw a traversal error.
        assert.doesNotThrow(() => validateOutputFilePath('.', rootDir));
    });
});
