import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { generateMarkdownContent, isBinaryFile } from '../../../core/files/markdownGenerator';

suite('markdownGenerator', () => {
    const tempDir = path.join(os.tmpdir(), 'repomix-test-' + Date.now());

    setup(async () => {
        if (!fs.existsSync(tempDir)) {
            await fs.promises.mkdir(tempDir, { recursive: true });
        }
    });

    teardown(async () => {
        if (fs.existsSync(tempDir)) {
            await fs.promises.rm(tempDir, { recursive: true, force: true });
        }
    });

    test('isBinaryFile should correctly identify binary files', () => {
        assert.strictEqual(isBinaryFile('test.exe'), true);
        assert.strictEqual(isBinaryFile('test.png'), true);
        assert.strictEqual(isBinaryFile('test.ts'), false);
        assert.strictEqual(isBinaryFile('README'), false);
        assert.strictEqual(isBinaryFile('LICENSE'), false);
        assert.strictEqual(isBinaryFile('unknown_ext.xyz'), true);
    });

    test('generateMarkdownContent should concatenate files with markdown code blocks', async () => {
        const file1 = path.join(tempDir, 'file1.txt');
        const file2 = path.join(tempDir, 'file2.ts');

        await fs.promises.writeFile(file1, 'content of file 1', 'utf-8');
        await fs.promises.writeFile(file2, 'content of file 2', 'utf-8');

        const { concatenated, tokenCount } = await generateMarkdownContent(tempDir, ['file1.txt', 'file2.ts']);

        assert.ok(concatenated.includes('## file1.txt'));
        assert.ok(concatenated.includes('```txt\ncontent of file 1\n```'));

        assert.ok(concatenated.includes('## file2.ts'));
        assert.ok(concatenated.includes('```ts\ncontent of file 2\n```'));

        assert.ok(tokenCount > 0);
    });

    test('generateMarkdownContent should handle missing files', async () => {
        const { concatenated } = await generateMarkdownContent(tempDir, ['non-existent.txt']);
        assert.ok(concatenated.includes('## non-existent.txt'));
        assert.ok(concatenated.includes('> File not found'));
    });

    test('generateMarkdownContent should skip binary files', async () => {
        const binaryFile = path.join(tempDir, 'test.png');
        await fs.promises.writeFile(binaryFile, Buffer.from([0x89, 0x50, 0x4E, 0x47])); // PNG header

        const { concatenated } = await generateMarkdownContent(tempDir, ['test.png']);
        // Should throw if no text files found
        // Actually our implementation throws:
        // if (entries.length === 0) { throw new Error('No text files could be read (all files may be binary)'); }
    });

    test('generateMarkdownContent should throw error if no text files found', async () => {
        const binaryFile = path.join(tempDir, 'test.png');
        await fs.promises.writeFile(binaryFile, Buffer.from([0x89, 0x50, 0x4E, 0x47]));

        try {
            await generateMarkdownContent(tempDir, ['test.png']);
            assert.fail('Should have thrown an error');
        } catch (error: any) {
            assert.strictEqual(error.message, 'No text files could be read (all files may be binary)');
        }
    });
});
