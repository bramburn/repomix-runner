import * as assert from 'assert';
import { estimateBatchCost } from '../../webview/components/ai-chat/CostEstimator.js';

suite('PackagesTab helpers', () => {
  test('estimateBatchCost returns positive value for non-zero tokens', () => {
    const value = estimateBatchCost(50_000, 10_000);
    assert.ok(value > 0);
  });

  test('estimateBatchCost scales with token volume', () => {
    const low = estimateBatchCost(10_000, 2_000);
    const high = estimateBatchCost(100_000, 20_000);
    assert.ok(high > low);
  });
});
