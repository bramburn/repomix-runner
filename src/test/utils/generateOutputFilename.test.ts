import * as assert from 'assert';
import { generateOutputFilename } from '../../utils/generateOutputFilename.js';
import { Bundle } from '../../core/bundles/types.js';

suite('generateOutputFilename', () => {
  const mockBundle: Bundle = {
    name: 'Test Bundle',
    created: '',
    lastUsed: '',
    tags: [],
    files: []
  };

  test('should use bundle.output if present', () => {
    const bundle: Bundle = { ...mockBundle, output: 'custom-output.xml' };
    const result = generateOutputFilename(bundle, 'default.xml', true);
    assert.strictEqual(result, 'custom-output.xml');
  });

  test('should return configFilePath if useBundleNameAsOutputName is false', () => {
    const result = generateOutputFilename(mockBundle, 'default.xml', false);
    assert.strictEqual(result, 'default.xml');
  });

  test('should inject sanitized bundle name into filename', () => {
    const result = generateOutputFilename(mockBundle, 'default.xml', true);
    assert.strictEqual(result, 'default.test-bundle.xml');
  });

  test('should handle directories in configFilePath', () => {
    const result = generateOutputFilename(mockBundle, 'folder/sub/default.xml', true);
    // Note: path separator might vary on OS, but logic should preserve what path.parse/join does
    // We expect it to end with default.test-bundle.xml and contain folder/sub
    assert.ok(result.endsWith('default.test-bundle.xml'));
    assert.ok(result.includes('folder'));
  });

  test('should sanitize unsafe characters from bundle name', () => {
    const unsafeBundle: Bundle = { ...mockBundle, name: 'Unsafe/Bundle Name!@#' };
    const result = generateOutputFilename(unsafeBundle, 'default.xml', true);
    // Unsafe/Bundle Name!@# -> unsafe-bundle-name
    assert.strictEqual(result, 'default.unsafe-bundle-name.xml');
  });

  test('should handle bundle name with spaces', () => {
    const spaceBundle: Bundle = { ...mockBundle, name: '  My   Cool   Bundle  ' };
    const result = generateOutputFilename(spaceBundle, 'default.xml', true);
    assert.strictEqual(result, 'default.my-cool-bundle.xml');
  });

  test('should handle configFilePath without extension', () => {
    const result = generateOutputFilename(mockBundle, 'output', true);
    assert.strictEqual(result, 'output.test-bundle');
  });

  test('should handle configFilePath with multiple dots', () => {
    const result = generateOutputFilename(mockBundle, 'my.output.file.xml', true);
    assert.strictEqual(result, 'my.output.file.test-bundle.xml');
  });
});
