import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { dedupeNode, finalizeNode } from '../../search/nodes.js';
import { SearchGraphState } from '../../search/state.js';

suite('Search Nodes Test Suite', () => {
    test('dedupeNode should keep best score per file path', async () => {
        const state = {
            errors: [],
            vectorHits: [
                { id: '1', score: 0.5, path: 'file.ts', snippet: 'a' },
                { id: '2', score: 0.8, path: 'file.ts', snippet: 'b' }, // better score
                { id: '3', score: 0.7, path: 'other.ts', snippet: 'c' },
            ]
        } as unknown as SearchGraphState;

        const result = await dedupeNode(state);

        assert.strictEqual(result.dedupedHits!.length, 2);
        const fileHit = result.dedupedHits!.find(h => h.path === 'file.ts');
        assert.strictEqual(fileHit?.score, 0.8);
        assert.strictEqual(fileHit?.id, '2');
    });

    test('finalizeNode should filter by .gitignore if present', async () => {
        // Mock a repo root with .gitignore
        const tempDir = path.join(__dirname, 'temp_test_node_' + Date.now());
        fs.mkdirSync(tempDir, { recursive: true });
        fs.writeFileSync(path.join(tempDir, '.gitignore'), 'ignored.ts\n');

        const state = {
            errors: [],
            repoRoot: tempDir,
            maxResults: 10,
            rerankedHits: [
                { path: 'good.ts', score: 1.0 },
                { path: 'ignored.ts', score: 0.9 },
                { path: 'node_modules/lib.js', score: 0.8 },
            ]
        } as unknown as SearchGraphState;

        try {
            const result = await finalizeNode(state);
            assert.strictEqual(result.finalHits!.length, 1);
            assert.strictEqual(result.finalHits![0].path, 'good.ts');
        } finally {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
