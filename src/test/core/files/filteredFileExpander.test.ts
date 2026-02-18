import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { expandUrisToFilesRespectingGitignore } from '../../../core/files/filteredFileExpander.js';

suite('FilteredFileExpander Test Suite', () => {
    let tempDir: string;

    setup(() => {
        // Create temp dir for test repo
        tempDir = path.join(__dirname, 'filtered_expander_test_' + Date.now());
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
    });

    teardown(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('expandUrisToFilesRespectingGitignore should respect root .gitignore', async () => {
        // Setup test structure
        // tempDir/
        //   - file1.txt
        //   - ignored.log
        //   - .gitignore (contains *.log)
        
        fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1');
        fs.writeFileSync(path.join(tempDir, 'ignored.log'), 'log content');
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.log\n');

        const uris = [vscode.Uri.file(tempDir)];
        const result = await expandUrisToFilesRespectingGitignore(uris, 10, tempDir, true);

        assert.strictEqual(result.files.length, 2); // file1.txt + .gitignore
        assert.strictEqual(result.ignoredCount, 1); // ignored.log
        assert.strictEqual(result.totalCount, 3);
        
        const filePaths = result.files.map(u => path.basename(u.fsPath)).sort();
        assert.deepStrictEqual(filePaths, ['.gitignore', 'file1.txt']);
    });

    test('expandUrisToFilesRespectingGitignore should respect subfolder .gitignore', async () => {
        // Setup test structure
        // tempDir/
        //   - file1.txt
        //   - subfolder/
        //     - file2.txt
        //     - temp/
        //       - cache.tmp
        //     - .gitignore (contains temp/)
        
        fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1');
        
        const subfolder = path.join(tempDir, 'subfolder');
        fs.mkdirSync(subfolder, { recursive: true });
        fs.writeFileSync(path.join(subfolder, 'file2.txt'), 'content2');
        
        const tempDirInSub = path.join(subfolder, 'temp');
        fs.mkdirSync(tempDirInSub, { recursive: true });
        fs.writeFileSync(path.join(tempDirInSub, 'cache.tmp'), 'temp data');
        
        fs.writeFileSync(path.join(subfolder, '.gitignore'), 'temp/\n');

        const uris = [vscode.Uri.file(tempDir)];
        const result = await expandUrisToFilesRespectingGitignore(uris, 10, tempDir, true);

        assert.strictEqual(result.files.length, 3); // file1.txt, subfolder/file2.txt, subfolder/.gitignore
        assert.strictEqual(result.ignoredCount, 1); // subfolder/temp/cache.tmp
        assert.strictEqual(result.totalCount, 4);
        
        const filePaths = result.files.map(u => path.relative(tempDir, u.fsPath)).sort();
        assert.deepStrictEqual(filePaths, ['.gitignore', 'file1.txt', 'subfolder/.gitignore', 'subfolder/file2.txt']);
    });

    test('expandUrisToFilesRespectingGitignore should handle nested subfolder .gitignore', async () => {
        // Setup test structure
        // tempDir/
        //   - file1.txt
        //   - level1/
        //     - file2.txt
        //     - level2/
        //       - file3.txt
        //       - build/
        //         - output.bin
        //       - .gitignore (contains build/)
        
        fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1');
        
        const level1 = path.join(tempDir, 'level1');
        fs.mkdirSync(level1, { recursive: true });
        fs.writeFileSync(path.join(level1, 'file2.txt'), 'content2');
        
        const level2 = path.join(level1, 'level2');
        fs.mkdirSync(level2, { recursive: true });
        fs.writeFileSync(path.join(level2, 'file3.txt'), 'content3');
        
        const buildDir = path.join(level2, 'build');
        fs.mkdirSync(buildDir, { recursive: true });
        fs.writeFileSync(path.join(buildDir, 'output.bin'), 'binary data');
        
        fs.writeFileSync(path.join(level2, '.gitignore'), 'build/\n');

        const uris = [vscode.Uri.file(tempDir)];
        const result = await expandUrisToFilesRespectingGitignore(uris, 10, tempDir, true);

        assert.strictEqual(result.files.length, 4); // file1.txt, level1/file2.txt, level1/level2/file3.txt, level1/level2/.gitignore
        assert.strictEqual(result.ignoredCount, 1); // level1/level2/build/output.bin
        assert.strictEqual(result.totalCount, 5);
    });

    test('expandUrisToFilesRespectingGitignore should not filter explicitly selected files', async () => {
        // Even if a file is ignored by .gitignore, if it's explicitly selected, it should be included
        // tempDir/
        //   - ignored.log
        //   - .gitignore (contains *.log)
        
        fs.writeFileSync(path.join(tempDir, 'ignored.log'), 'log content');
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.log\n');

        const uris = [vscode.Uri.file(path.join(tempDir, 'ignored.log'))];
        const result = await expandUrisToFilesRespectingGitignore(uris, 10, tempDir, true);

        assert.strictEqual(result.files.length, 1); // ignored.log should still be included
        assert.strictEqual(result.ignoredCount, 0);
        assert.strictEqual(result.totalCount, 1);
        
        const filePaths = result.files.map(u => path.basename(u.fsPath));
        assert.deepStrictEqual(filePaths, ['ignored.log']);
    });

    test('expandUrisToFilesRespectingGitignore should respect gitignore when false', async () => {
        // When respectGitignore is false, should behave like original function
        // tempDir/
        //   - file1.txt
        //   - ignored.log
        //   - .gitignore (contains *.log)
        
        fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1');
        fs.writeFileSync(path.join(tempDir, 'ignored.log'), 'log content');
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.log\n');

        const uris = [vscode.Uri.file(tempDir)];
        const result = await expandUrisToFilesRespectingGitignore(uris, 10, tempDir, false);

        assert.strictEqual(result.files.length, 3); // All files should be included
        assert.strictEqual(result.ignoredCount, 0); // No filtering applied
        assert.strictEqual(result.totalCount, 3);
        
        const filePaths = result.files.map(u => path.basename(u.fsPath)).sort();
        assert.deepStrictEqual(filePaths, ['.gitignore', 'file1.txt', 'ignored.log']);
    });

    test('expandUrisToFilesRespectingGitignore should handle maxFiles limit', async () => {
        // Create more files than maxFiles limit
        for (let i = 0; i < 10; i++) {
            fs.writeFileSync(path.join(tempDir, `file${i}.txt`), `content${i}`);
        }

        const uris = [vscode.Uri.file(tempDir)];
        const result = await expandUrisToFilesRespectingGitignore(uris, 5, tempDir, false);

        assert.strictEqual(result.files.length, 5); // Should respect maxFiles limit
        assert.strictEqual(result.ignoredCount, 0);
        assert.strictEqual(result.totalCount, 10);
    });

    test('expandUrisToFilesRespectingGitignore should handle directory filtering for performance', async () => {
        // When a directory is ignored, its entire subtree should be skipped
        // tempDir/
        //   - file1.txt
        //   - ignored_dir/
        //     - nested/
        //       - file2.txt
        //   - .gitignore (contains ignored_dir/)
        
        fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1');
        
        const ignoredDir = path.join(tempDir, 'ignored_dir');
        fs.mkdirSync(ignoredDir, { recursive: true });
        const nestedDir = path.join(ignoredDir, 'nested');
        fs.mkdirSync(nestedDir, { recursive: true });
        fs.writeFileSync(path.join(nestedDir, 'file2.txt'), 'content2');
        
        fs.writeFileSync(path.join(tempDir, '.gitignore'), 'ignored_dir/\n');

        const uris = [vscode.Uri.file(tempDir)];
        const result = await expandUrisToFilesRespectingGitignore(uris, 10, tempDir, true);

        assert.strictEqual(result.files.length, 2); // file1.txt + .gitignore
        assert.strictEqual(result.ignoredCount, 2); // ignored_dir/ and ignored_dir/nested/file2.txt
        assert.strictEqual(result.totalCount, 3);
    });

    test('expandUrisToFilesRespectingGitignore should handle malformed gitignore gracefully', async () => {
        // Test that malformed .gitignore doesn't crash the function
        fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1');
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '[invalid pattern\n');

        const uris = [vscode.Uri.file(tempDir)];
        
        // Should not throw an error
        const result = await expandUrisToFilesRespectingGitignore(uris, 10, tempDir, true);
        
        // Should fall back to including all files
        assert.strictEqual(result.files.length, 2); // file1.txt + .gitignore
        assert.strictEqual(result.ignoredCount, 0);
    });
});
