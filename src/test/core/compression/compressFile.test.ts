import * as assert from 'assert';
import * as sinon from 'sinon';
import { compressFile, compressFileWithTokens } from '../../../core/compression/compressFile.js';
import { LanguageParser } from '../../../core/compression/LanguageParser.js';
import type {
  BodyReplacement,
  CaptureLike,
  CompressionOptions,
  ParseContext,
  ParseStrategy,
} from '../../../core/compression/types.js';

type FakeParserService = {
  getParserForLang: (language: string) => Promise<any>;
  getQueryForLang: (language: string) => Promise<any>;
  getStrategyForLang: (language: string) => ParseStrategy | null;
};

function createStubbedParserService(stub: sinon.SinonStub, service: FakeParserService): void {
  stub.callsFake(() => service as unknown as LanguageParser);
}

suite('Compression API', () => {
  let sandbox: sinon.SinonSandbox;
  let getInstanceStub: sinon.SinonStub;

  setup(() => {
    sandbox = sinon.createSandbox();
    getInstanceStub = sandbox.stub(LanguageParser, 'getInstance');
  });

  teardown(() => {
    sandbox.restore();
  });

  test('compressFile returns null for unsupported extension', async () => {
    const result = await compressFile('README.md', '# title');
    assert.strictEqual(result, null);
  });

  test('compressFile returns original content when no captures are found', async () => {
    createStubbedParserService(getInstanceStub, {
      async getParserForLang() {
        return {
          parse() {
            return { rootNode: {} };
          },
        };
      },
      async getQueryForLang() {
        return {
          captures() {
            return [];
          },
        };
      },
      getStrategyForLang() {
        return {
          parseCapture() {
            return null;
          },
          getBodyReplacement() {
            return null;
          },
        };
      },
    });

    const source = 'export const value = 1;';
    const result = await compressFile('file.ts', source);
    assert.strictEqual(result, source);
  });

  test('compressFile returns original when captures exist but no replacements apply', async () => {
    const capture: CaptureLike = {
      name: 'definition.function',
      node: {
        type: 'function_declaration',
        text: '',
        startIndex: 0,
        endIndex: 20,
        children: [],
      },
    };

    createStubbedParserService(getInstanceStub, {
      async getParserForLang() {
        return {
          parse() {
            return { rootNode: {} };
          },
        };
      },
      async getQueryForLang() {
        return {
          captures() {
            return [capture];
          },
        };
      },
      getStrategyForLang() {
        return {
          parseCapture() {
            return null;
          },
          getBodyReplacement() {
            return null;
          },
        };
      },
    });

    const source = 'function foo() { return 1; }';
    const result = await compressFile('file.ts', source);
    assert.strictEqual(result, source);
  });

  test('compressFile skips overlapping replacements and malformed ranges', async () => {
    const source = '012345678901234567890123456789';

    const captures: CaptureLike[] = [
      {
        name: 'outer',
        node: { type: 'n', text: '', startIndex: 5, endIndex: 15, children: [] },
      },
      {
        name: 'inner',
        node: { type: 'n', text: '', startIndex: 10, endIndex: 20, children: [] },
      },
      {
        name: 'bad',
        node: { type: 'n', text: '', startIndex: 1, endIndex: 2, children: [] },
      },
    ];

    const strategy: ParseStrategy = {
      parseCapture() {
        return null;
      },
      getBodyReplacement(capture: CaptureLike, _context: ParseContext, _options?: CompressionOptions) {
        if (capture.name === 'inner') {
          return { bodyStartIndex: 10, bodyEndIndex: 20, replacementText: 'A' };
        }

        if (capture.name === 'outer') {
          // Overlaps the already-applied "inner" range and should be skipped.
          return { bodyStartIndex: 5, bodyEndIndex: 15, replacementText: 'B' };
        }

        // Invalid range should be skipped.
        return { bodyStartIndex: 8, bodyEndIndex: 4, replacementText: 'X' };
      },
    };

    createStubbedParserService(getInstanceStub, {
      async getParserForLang() {
        return {
          parse() {
            return { rootNode: {} };
          },
        };
      },
      async getQueryForLang() {
        return {
          captures() {
            return captures;
          },
        };
      },
      getStrategyForLang() {
        return strategy;
      },
    });

    const result = await compressFile('file.ts', source);
    assert.strictEqual(result, '0123456789A0123456789');
  });

  test('compressFileWithTokens returns non-null compressed content for no-capture files', async () => {
    createStubbedParserService(getInstanceStub, {
      async getParserForLang() {
        return {
          parse() {
            return { rootNode: {} };
          },
        };
      },
      async getQueryForLang() {
        return {
          captures() {
            return [];
          },
        };
      },
      getStrategyForLang() {
        return {
          parseCapture() {
            return null;
          },
          getBodyReplacement(): BodyReplacement | null {
            return null;
          },
        };
      },
    });

    const source = 'const hello = "world";';
    const result = await compressFileWithTokens('file.ts', source);
    assert.strictEqual(result.compressed, source);
    assert.ok(result.tokenCount > 0);
  });
});
