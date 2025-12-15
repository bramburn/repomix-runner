import * as assert from 'assert';
import * as path from 'path';
import { validateOutputFilePath } from '../../utils/pathValidation';

suite('Path Validation Utils', () => {
    const workspaceRoot = path.resolve('/test/workspace');

    test('validates path inside workspace', () => {
        assert.doesNotThrow(() => {
            validateOutputFilePath('output.txt', workspaceRoot);
        });
        assert.doesNotThrow(() => {
            validateOutputFilePath('subfolder/output.txt', workspaceRoot);
        });
    });

    test('validates absolute path inside workspace', () => {
        const absolutePath = path.join(workspaceRoot, 'output.txt');
        assert.doesNotThrow(() => {
            validateOutputFilePath(absolutePath, workspaceRoot);
        });
    });

    test('allows root path itself', () => {
        assert.doesNotThrow(() => {
            validateOutputFilePath('.', workspaceRoot);
        });
        assert.doesNotThrow(() => {
            validateOutputFilePath(workspaceRoot, workspaceRoot);
        });
    });

    test('throws error for path outside workspace using ../', () => {
        assert.throws(() => {
            validateOutputFilePath('../outside.txt', workspaceRoot);
        }, /Security Error/);
    });

    test('throws error for absolute path outside workspace', () => {
        assert.throws(() => {
            validateOutputFilePath('/etc/passwd', workspaceRoot);
        }, /Security Error/);
    });

    test('throws error for partial path match', () => {
        // e.g. /test/workspace_secret vs /test/workspace
        const siblingFolder = workspaceRoot + '_secret';
        assert.throws(() => {
            validateOutputFilePath(siblingFolder, workspaceRoot);
        }, /Security Error/);
    });
});
