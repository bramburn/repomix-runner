import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getRepomixOutputPath } from '../../utils/repomix_output_detector.js';

suite('getRepomixOutputPath', () => {
  let testDir: string;

  setup(() => {
    // Create a temporary directory for each test
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repomix-test-'));
  });

  teardown(() => {
    // Clean up the temporary directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should return default repomix-output.xml when no config exists', () => {
    const result = getRepomixOutputPath(testDir);
    assert.strictEqual(result, path.join(testDir, 'repomix-output.xml'));
  });

  test('should use filePath from repomix.config.json if present', () => {
    const configPath = path.join(testDir, 'repomix.config.json');
    const config = {
      output: {
        filePath: 'custom-output.md'
      }
    };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const result = getRepomixOutputPath(testDir);
    assert.strictEqual(result, path.resolve(testDir, 'custom-output.md'));
  });

  test('should derive extension from style when filePath is not set', () => {
    const configPath = path.join(testDir, 'repomix.config.json');
    const config = {
      output: {
        style: 'markdown'
      }
    };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const result = getRepomixOutputPath(testDir);
    assert.strictEqual(result, path.join(testDir, 'repomix-output.md'));
  });

  test('should handle all style types correctly', () => {
    const styles = [
      { style: 'markdown', expected: 'repomix-output.md' },
      { style: 'plain', expected: 'repomix-output.txt' },
      { style: 'json', expected: 'repomix-output.json' },
      { style: 'xml', expected: 'repomix-output.xml' }
    ];

    for (const { style, expected } of styles) {
      const testSubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repomix-test-'));
      try {
        const configPath = path.join(testSubDir, 'repomix.config.json');
        const config = { output: { style } };
        fs.writeFileSync(configPath, JSON.stringify(config));

        const result = getRepomixOutputPath(testSubDir);
        assert.strictEqual(result, path.join(testSubDir, expected));
      } finally {
        fs.rmSync(testSubDir, { recursive: true, force: true });
      }
    }
  });

  test('should fallback to checking file existence when config is invalid', () => {
    const configPath = path.join(testDir, 'repomix.config.json');
    fs.writeFileSync(configPath, 'invalid json {');

    // Create a markdown file
    const mdPath = path.join(testDir, 'repomix-output.md');
    fs.writeFileSync(mdPath, 'test content');

    const result = getRepomixOutputPath(testDir);
    assert.strictEqual(result, mdPath);
  });

  test('should check files in priority order: md -> txt -> json -> xml', () => {
    // Create only txt file
    const txtPath = path.join(testDir, 'repomix-output.txt');
    fs.writeFileSync(txtPath, 'test content');

    const result = getRepomixOutputPath(testDir);
    assert.strictEqual(result, txtPath);
  });

  test('should prefer markdown over other formats when multiple exist', () => {
    const mdPath = path.join(testDir, 'repomix-output.md');
    const txtPath = path.join(testDir, 'repomix-output.txt');
    fs.writeFileSync(mdPath, 'markdown content');
    fs.writeFileSync(txtPath, 'text content');

    const result = getRepomixOutputPath(testDir);
    assert.strictEqual(result, mdPath);
  });

  test('should handle absolute paths in filePath config', () => {
    const configPath = path.join(testDir, 'repomix.config.json');
    const absolutePath = path.join(testDir, 'subdir', 'output.md');
    const config = {
      output: {
        filePath: absolutePath
      }
    };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const result = getRepomixOutputPath(testDir);
    assert.strictEqual(result, path.resolve(testDir, absolutePath));
  });

  test('should default to xml when style is unknown', () => {
    const configPath = path.join(testDir, 'repomix.config.json');
    const config = {
      output: {
        style: 'unknown'
      }
    };
    fs.writeFileSync(configPath, JSON.stringify(config));

    const result = getRepomixOutputPath(testDir);
    assert.strictEqual(result, path.join(testDir, 'repomix-output.xml'));
  });
});

