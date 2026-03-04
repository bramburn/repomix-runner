import * as assert from 'assert';
import * as sinon from 'sinon';
import { OpenRouterProvider } from '../../../core/indexing/embeddings/OpenRouterProvider.js';
import { embeddingService } from '../../../core/indexing/embeddingService.js';

suite('OpenRouterProvider', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();

    // Stub console methods to reduce noise
    sandbox.stub(console, 'log');
    sandbox.stub(console, 'warn');
    sandbox.stub(console, 'error');
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('buildProviderPreferences', () => {
    test('should return undefined when no provider config', () => {
      const provider = new OpenRouterProvider({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-api-key',
        model: 'openai/text-embedding-3-small',
        dimension: 1536
      });

      // Access private method via reflection
      // @ts-ignore
      const prefs = provider.buildProviderPreferences();
      assert.strictEqual(prefs, undefined, 'Should return undefined when no provider config');
    });

    test('should include order when specified', () => {
      const provider = new OpenRouterProvider({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-api-key',
        model: 'openai/text-embedding-3-small',
        dimension: 1536,
        provider: {
          order: ['openai', 'anthropic']
        }
      });

      // @ts-ignore
      const prefs = provider.buildProviderPreferences();
      assert.deepStrictEqual(prefs?.order, ['openai', 'anthropic']);
    });

    test('should default allowFallbacks to true', () => {
      const provider = new OpenRouterProvider({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-api-key',
        model: 'openai/text-embedding-3-small',
        dimension: 1536,
        provider: {
          order: ['openai']
        }
      });

      // @ts-ignore
      const prefs = provider.buildProviderPreferences();
      assert.strictEqual(prefs?.allowFallbacks, true, 'Should default allowFallbacks to true');
    });

    test('should include quantizations when specified', () => {
      const provider = new OpenRouterProvider({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-api-key',
        model: 'openai/text-embedding-3-small',
        dimension: 1536,
        provider: {
          quantizations: ['float16', 'int8']
        }
      });

      // @ts-ignore
      const prefs = provider.buildProviderPreferences();
      assert.deepStrictEqual(prefs?.quantizations, ['float16', 'int8']);
    });
  });

  suite('getDimensions', () => {
    test('should return configured dimension', () => {
      const provider = new OpenRouterProvider({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-api-key',
        model: 'openai/text-embedding-3-small',
        dimension: 1536
      });

      assert.strictEqual(provider.getDimensions(), 1536);
    });
  });
});

suite('EmbeddingService with OpenRouter', () => {
  let sandbox: sinon.SinonSandbox;

  setup(() => {
    sandbox = sinon.createSandbox();
    sandbox.stub(console, 'log');
    sandbox.stub(console, 'warn');
    sandbox.stub(console, 'error');
  });

  teardown(() => {
    sandbox.restore();
  });

  test('should switch to OpenRouter provider', () => {
    embeddingService.switchProvider({
      provider: 'openrouter',
      openrouter: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
        model: 'openai/text-embedding-3-small',
        dimension: 1536
      }
    });

    assert.strictEqual(embeddingService.getDimensions(), 1536);
  });

  test('should throw error when switching with missing config', () => {
    assert.throws(() => {
      embeddingService.switchProvider({
        provider: 'openrouter'
        // Missing openrouter config
      } as any);
    }, /OpenRouter config is missing/);
  });
});
