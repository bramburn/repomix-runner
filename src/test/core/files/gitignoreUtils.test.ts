import * as assert from 'assert';
import { collectGitignorePatterns } from '../../../core/files/gitignoreUtils.js';
import * as path from 'path';
import * as fs from 'fs';

suite('GitignoreUtils Test Suite', () => {
    let tempDir: string;

    setup(() => {
        // Create temp dir for test repo
        tempDir = path.join(__dirname, 'gitignore_test_' + Date.now());
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
    });

    teardown(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    test('collectGitignorePatterns should discover root .gitignore', () => {
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.log\nnode_modules/\n');

        const patterns = collectGitignorePatterns(tempDir);

        assert.ok(patterns.includes('*.log'), 'Should include *.log pattern');
        assert.ok(patterns.includes('node_modules/'), 'Should include node_modules/ pattern');
    });

    test('collectGitignorePatterns should discover subfolder .gitignore', () => {
        // Root .gitignore
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.log\n');
        
        // Subfolder with its own .gitignore
        const subfolder = path.join(tempDir, 'subfolder');
        fs.mkdirSync(subfolder);
        fs.writeFileSync(path.join(subfolder, '.gitignore'), 'temp/\n*.tmp\n');

        const patterns = collectGitignorePatterns(tempDir);

        // Root patterns
        assert.ok(patterns.includes('*.log'), 'Should include root *.log pattern');
        
        // Subfolder patterns (should be prefixed)
        assert.ok(patterns.includes('subfolder/temp/'), 'Should include subfolder temp/ pattern');
        assert.ok(patterns.includes('subfolder/**/*.tmp'), 'Should include subfolder *.tmp pattern with recursion');
    });

    test('collectGitignorePatterns should handle nested subfolders', () => {
        // Root .gitignore
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.log\n');
        
        // Level 1 subfolder
        const level1 = path.join(tempDir, 'level1');
        fs.mkdirSync(level1);
        fs.writeFileSync(path.join(level1, '.gitignore'), 'cache/\n');
        
        // Level 2 subfolder
        const level2 = path.join(level1, 'level2');
        fs.mkdirSync(level2);
        fs.writeFileSync(path.join(level2, '.gitignore'), '*.cache\n');

        const patterns = collectGitignorePatterns(tempDir);

        // Root patterns
        assert.ok(patterns.includes('*.log'), 'Should include root *.log pattern');
        
        // Level 1 patterns
        assert.ok(patterns.includes('level1/cache/'), 'Should include level1 cache/ pattern');
        
        // Level 2 patterns
        assert.ok(patterns.includes('level1/level2/*.cache'), 'Should include level2 *.cache pattern');
    });

    test('collectGitignorePatterns should preserve global patterns', () => {
        // Root .gitignore with global pattern
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '**/*.log\n');
        
        // Subfolder .gitignore with global pattern
        const subfolder = path.join(tempDir, 'subfolder');
        fs.mkdirSync(subfolder);
        fs.writeFileSync(path.join(subfolder, '.gitignore'), '**/temp/**\n');

        const patterns = collectGitignorePatterns(tempDir);

        // Global patterns should be preserved as-is
        assert.ok(patterns.includes('**/*.log'), 'Should preserve root **/*.log pattern');
        assert.ok(patterns.includes('**/temp/**'), 'Should preserve subfolder **/temp/** pattern');
    });

    test('collectGitignorePatterns should handle absolute patterns', () => {
        // Root .gitignore with absolute pattern
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '/build/\n/dist/\n');
        
        // Subfolder .gitignore with absolute pattern
        const subfolder = path.join(tempDir, 'src');
        fs.mkdirSync(subfolder);
        fs.writeFileSync(path.join(subfolder, '.gitignore'), '/generated/\n');

        const patterns = collectGitignorePatterns(tempDir);

        // Absolute patterns should be converted to relative to their location
        assert.ok(patterns.includes('build/'), 'Should convert /build/ to build/');
        assert.ok(patterns.includes('dist/'), 'Should convert /dist/ to dist/');
        assert.ok(patterns.includes('src/generated/'), 'Should convert /generated/ to src/generated/');
    });

    test('collectGitignorePatterns should sort by depth', () => {
        // Create subfolder .gitignore first (to test sorting)
        const subfolder = path.join(tempDir, 'subfolder');
        fs.mkdirSync(subfolder);
        fs.writeFileSync(path.join(subfolder, '.gitignore'), 'local.tmp\n');
        
        // Then create root .gitignore
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '*.tmp\n');

        const patterns = collectGitignorePatterns(tempDir);

        // Root patterns should come before subfolder patterns (due to depth sorting)
        const rootPatternIndex = patterns.indexOf('*.tmp');
        const subfolderPatternIndex = patterns.indexOf('subfolder/local.tmp');
        
        assert.ok(rootPatternIndex < subfolderPatternIndex, 'Root patterns should come before subfolder patterns');
    });

    test('collectGitignorePatterns should skip comments and empty lines', () => {
        fs.writeFileSync(path.join(tempDir, '.gitignore'), '# This is a comment\n\n*.log\n   \n# Another comment\n*.tmp\n');

        const patterns = collectGitignorePatterns(tempDir);

        assert.strictEqual(patterns.length, 2, 'Should only have 2 patterns (no comments or empty lines)');
        assert.ok(patterns.includes('*.log'), 'Should include *.log');
        assert.ok(patterns.includes('*.tmp'), 'Should include *.tmp');
    });

    test('collectGitignorePatterns should handle directory patterns', () => {
        const subfolder = path.join(tempDir, 'subfolder');
        fs.mkdirSync(subfolder);
        fs.writeFileSync(path.join(subfolder, '.gitignore'), 'build/\n');

        const patterns = collectGitignorePatterns(tempDir);

        // Directory patterns should be added both as-is and with recursive matching
        assert.ok(patterns.includes('subfolder/build/'), 'Should include directory pattern');
        assert.ok(patterns.includes('subfolder/**/build/'), 'Should include recursive directory pattern');
    });
});
