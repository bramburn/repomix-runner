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
});
