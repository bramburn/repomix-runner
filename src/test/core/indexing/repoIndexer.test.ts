import * as assert from 'assert';
import { DatabaseService } from '../../../core/storage/databaseService.js';
import { indexRepository } from '../../../core/indexing/repoIndexer.js';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as sinon from 'sinon';

suite('RepoIndexer Test Suite', () => {
    let dbService: DatabaseService;
    let tempDir: string;
    let sandbox: sinon.SinonSandbox;

    setup(async () => {
        sandbox = sinon.createSandbox();

        // Create temp dir for test repo
        tempDir = path.join(__dirname, 'temp_repo_' + Date.now());
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Mock vscode extension context
        const mockContext = {
            globalStorageUri: vscode.Uri.file(path.join(tempDir, 'storage')),
            secrets: {
                get: sandbox.stub(),
                store: sandbox.stub()
            }
        } as unknown as vscode.ExtensionContext;

        dbService = new DatabaseService(mockContext);
        await dbService.initialize();
    });

    teardown(() => {
        dbService.dispose();
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
        sandbox.restore();
    });

    test('indexRepository should index files and respect ignore patterns', async () => {
        // Setup repo structure
        // /
        //   - file1.txt
        //   - src/
        //     - main.ts
        //   - node_modules/
        //     - lib.js
        //   - ignored.log
        //   - .gitignore (contains *.log)

        fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content');

        fs.mkdirSync(path.join(tempDir, 'src'));
        fs.writeFileSync(path.join(tempDir, 'src', 'main.ts'), 'console.log("hello")');

        fs.mkdirSync(path.join(tempDir, 'node_modules'));
        fs.writeFileSync(path.join(tempDir, 'node_modules', 'lib.js'), 'library');

        fs.writeFileSync(path.join(tempDir, 'ignored.log'), 'log data');

        fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.log\n');

        // Run indexer
        const count = await indexRepository(tempDir, dbService);

        // Verification
        // Expected: file1.txt, src/main.ts, .gitignore (3 files)
        // Ignored: ignored.log (.gitignore), node_modules (default ignore)

        assert.strictEqual(count, 3, 'Should index exactly 3 files');

        const repoId = `dir:${path.basename(tempDir)}`;
        const dbCount = await dbService.getRepoFileCount(repoId);
        assert.strictEqual(dbCount, 3, 'Database should verify 3 files');
    });

    test('indexRepository should update existing index', async () => {
        // Initial file
        fs.writeFileSync(path.join(tempDir, 'test.txt'), 'content');

        await indexRepository(tempDir, dbService);
        let count = await dbService.getRepoFileCount(`dir:${path.basename(tempDir)}`);
        assert.strictEqual(count, 1);

        // Add new file
        fs.writeFileSync(path.join(tempDir, 'new.txt'), 'content');

        // Re-run indexer
        await indexRepository(tempDir, dbService);
        count = await dbService.getRepoFileCount(`dir:${path.basename(tempDir)}`);

        assert.strictEqual(count, 2, 'Should update index count');
    });

    test('indexRepository should respect subfolder .gitignore files', async () => {
        // Setup repo structure with subfolder .gitignore
        // /
        //   - file1.txt
        //   - root.log           (should be ignored by root .gitignore)
        //   - .gitignore         (contains *.log)
        //   - subfolder1/
        //     - file2.txt
        //     - data.log         (should be ignored by root .gitignore)
        //     - temp/            (should be ignored by subfolder1/.gitignore)
        //       - cache.tmp
        //     - .gitignore       (contains temp/)

        // Root files
        fs.writeFileSync(path.join(tempDir, 'file1.txt'), 'content1');
        fs.writeFileSync(path.join(tempDir, 'root.log'), 'log data');
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.log\n');

        // Subfolder1 with its own .gitignore
        const subfolder1 = path.join(tempDir, 'subfolder1');
        fs.mkdirSync(subfolder1, { recursive: true });
        fs.writeFileSync(path.join(subfolder1, 'file2.txt'), 'content2');
        fs.writeFileSync(path.join(subfolder1, 'data.log'), 'more log data');
        
        const tempDir_in_sub = path.join(subfolder1, 'temp');
        fs.mkdirSync(tempDir_in_sub, { recursive: true });
        fs.writeFileSync(path.join(tempDir_in_sub, 'cache.tmp'), 'temp data');
        
        fs.writeFileSync(path.join(subfolder1, '.gitignore'), 'temp/\n');

        // Run indexer
        const count = await indexRepository(tempDir, dbService);

        // Verification
        // Expected: file1.txt, .gitignore, subfolder1/file2.txt, subfolder1/.gitignore (4 files)
        // Ignored: root.log (*.log from root), subfolder1/data.log (*.log from root), subfolder1/temp/cache.tmp (temp/ from subfolder)
        
        assert.strictEqual(count, 4, 'Should index exactly 4 files');

        const repoId = `dir:${path.basename(tempDir)}`;
        const dbCount = await dbService.getRepoFileCount(repoId);
        assert.strictEqual(dbCount, 4, 'Database should verify 4 files');
        
        // Verify specific files are present
        const files = await dbService.getRepoFiles(repoId);
        const filePaths = files.sort();
        
        assert.ok(filePaths.includes('file1.txt'), 'file1.txt should be indexed');
        assert.ok(filePaths.includes('.gitignore'), '.gitignore should be indexed');
        assert.ok(filePaths.includes('subfolder1/file2.txt'), 'subfolder1/file2.txt should be indexed');
        assert.ok(filePaths.includes('subfolder1/.gitignore'), 'subfolder1/.gitignore should be indexed');
        
        // Verify ignored files are NOT present
        assert.ok(!filePaths.includes('root.log'), 'root.log should be ignored by root .gitignore');
        assert.ok(!filePaths.includes('subfolder1/data.log'), 'subfolder1/data.log should be ignored by root .gitignore');
        assert.ok(!filePaths.includes('subfolder1/temp/cache.tmp'), 'subfolder1/temp/cache.tmp should be ignored by subfolder .gitignore');
    });
});
