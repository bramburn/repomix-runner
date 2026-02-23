import * as assert from 'assert';
import {
  countTokens,
  countTokensMultiple,
  calculateBudget,
  allocateFileBudget,
  isCompressionNeeded,
  calculateSavings,
  calculateCompressionRatio,
  createCompressionConfig,
  GEMINI_FLASH_BUDGET,
  CLAUDE_OPUS_BUDGET,
  getModelBudgetConfig,
} from '../../../chat/compression/tokenBudget.js';

suite('Token Budget Calculator', () => {
  suite('countTokens', () => {
    test('should return 0 for empty string', () => {
      assert.strictEqual(countTokens(''), 0);
    });

    test('should count tokens for simple text', () => {
      const count = countTokens('Hello world');
      assert.ok(count > 0, 'Should return positive token count');
      assert.ok(count < 10, 'Simple text should have few tokens');
    });

    test('should count more tokens for longer text', () => {
      const short = countTokens('Hello');
      const long = countTokens('Hello world, this is a longer text with more words');
      assert.ok(long > short, 'Longer text should have more tokens');
    });
  });

  suite('countTokensMultiple', () => {
    test('should sum tokens across multiple texts', () => {
      const total = countTokensMultiple(['Hello', 'World']);
      const individual = countTokens('Hello') + countTokens('World');
      assert.strictEqual(total, individual);
    });

    test('should return 0 for empty array', () => {
      assert.strictEqual(countTokensMultiple([]), 0);
    });
  });

  suite('calculateBudget', () => {
    test('should calculate budget for 200K context window at 80%', () => {
      const budget = calculateBudget(200_000, 80);
      assert.strictEqual(budget.total, 160_000);
      assert.strictEqual(budget.systemPrompt, 2000);
      assert.ok(budget.conversationSummaries > 0);
      assert.ok(budget.recentMessages > 0);
      assert.ok(budget.fileContext > 0);
      assert.ok(budget.outputReserve > 0);
    });

    test('should respect model-specific allocations', () => {
      const geminiBudget = calculateBudget(1_000_000, 80, GEMINI_FLASH_BUDGET);
      const opusBudget = calculateBudget(200_000, 80, CLAUDE_OPUS_BUDGET);
      assert.ok(geminiBudget.total > opusBudget.total);
      assert.ok(geminiBudget.fileContext > opusBudget.fileContext);
    });

    test('budget components should not exceed total', () => {
      const budget = calculateBudget(200_000, 80);
      const sum =
        budget.systemPrompt +
        budget.conversationSummaries +
        budget.recentMessages +
        budget.fileContext +
        budget.outputReserve;
      assert.ok(sum <= budget.total, 'Sum should not exceed total');
    });

    test('should handle different threshold percentages', () => {
      const budget50 = calculateBudget(200_000, 50);
      const budget90 = calculateBudget(200_000, 90);
      assert.strictEqual(budget50.total, 100_000);
      assert.strictEqual(budget90.total, 180_000);
    });
  });

  suite('allocateFileBudget', () => {
    test('should divide budget evenly among files', () => {
      const perFile = allocateFileBudget(10000, 5);
      assert.strictEqual(perFile, 2000);
    });

    test('should respect minimum per-file allocation', () => {
      const perFile = allocateFileBudget(100, 10);
      assert.strictEqual(perFile, 100);
    });

    test('should return 0 for no files', () => {
      assert.strictEqual(allocateFileBudget(10000, 0), 0);
    });
  });

  suite('isCompressionNeeded', () => {
    test('should return true when tokens exceed threshold', () => {
      assert.ok(isCompressionNeeded(170_000, 200_000, 80));
    });

    test('should return false when tokens are within threshold', () => {
      assert.ok(!isCompressionNeeded(100_000, 200_000, 80));
    });

    test('should return true at exact threshold', () => {
      assert.ok(isCompressionNeeded(160_000, 200_000, 80));
    });
  });

  suite('calculateSavings', () => {
    test('should calculate positive savings', () => {
      assert.strictEqual(calculateSavings(1000, 500), 500);
    });

    test('should return 0 if no savings', () => {
      assert.strictEqual(calculateSavings(500, 1000), 0);
    });
  });

  suite('calculateCompressionRatio', () => {
    test('should calculate 50% compression', () => {
      const ratio = calculateCompressionRatio(1000, 500);
      assert.ok(Math.abs(ratio - 0.5) < 0.001);
    });

    test('should return 0 for zero original tokens', () => {
      assert.strictEqual(calculateCompressionRatio(0, 0), 0);
    });
  });

  suite('getModelBudgetConfig', () => {
    test('should return Gemini config for gemini models', () => {
      const config = getModelBudgetConfig('gemini-2.5-flash');
      assert.strictEqual(config.contextWindow, 1_000_000);
    });

    test('should return Opus config for claude models', () => {
      const config = getModelBudgetConfig('claude-opus-4');
      assert.strictEqual(config.contextWindow, 200_000);
    });

    test('should default to Opus for unknown models', () => {
      const config = getModelBudgetConfig('unknown-model');
      assert.strictEqual(config.contextWindow, 200_000);
    });
  });

  suite('createCompressionConfig', () => {
    test('should create config with defaults', () => {
      const config = createCompressionConfig();
      assert.strictEqual(config.contextThresholdPercent, 80);
      assert.strictEqual(config.maxRecentMessages, 10);
      assert.strictEqual(config.modelContextWindow, 200_000);
      assert.strictEqual(config.messageGroupSize, 5);
    });

    test('should create config with custom values', () => {
      const config = createCompressionConfig(90, 20, 1_000_000, 10);
      assert.strictEqual(config.contextThresholdPercent, 90);
      assert.strictEqual(config.maxRecentMessages, 20);
      assert.strictEqual(config.modelContextWindow, 1_000_000);
      assert.strictEqual(config.messageGroupSize, 10);
    });
  });
});
