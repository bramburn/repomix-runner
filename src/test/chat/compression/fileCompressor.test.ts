import * as assert from 'assert';
import { isBinaryContent } from '../../../chat/compression/fileCompressor.js';

suite('File Compressor', () => {
  suite('isBinaryContent', () => {
    test('should detect null bytes as binary', () => {
      assert.ok(isBinaryContent('Hello\0World'));
    });

    test('should not flag normal text as binary', () => {
      assert.ok(!isBinaryContent('Hello World'));
    });

    test('should not flag code as binary', () => {
      const code = 'function hello() {\n  return "world";\n}';
      assert.ok(!isBinaryContent(code));
    });

    test('should detect high ratio of non-printable chars as binary', () => {
      const binary = '\x01\x02\x03\x04\x05\x06\x07\x08\x0E\x0F';
      assert.ok(isBinaryContent(binary));
    });
  });
});
