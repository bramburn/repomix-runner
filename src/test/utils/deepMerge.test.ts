import * as assert from 'assert';
import { deepMerge } from '../../utils/deepMerge.js';

suite('deepMerge Utility', () => {
  test('should merge two objects deeply', () => {
    const target = { a: 1, b: { c: 2 } };
    const source = { b: { d: 3 }, e: 4 };
    const expected = { a: 1, b: { c: 2, d: 3 }, e: 4 };

    const result = deepMerge(target, source);
    assert.deepStrictEqual(result, expected);
  });

  test('should modify target in place', () => {
    const target = { a: 1 };
    const source = { b: 2 };

    const result = deepMerge(target, source);
    assert.strictEqual(result, target);
    assert.deepStrictEqual(target, { a: 1, b: 2 });
  });

  test('should NOT modify source', () => {
    const target = { a: 1, b: { c: 2 } };
    const source = { b: { d: 3 }, e: 4 };
    const sourceOriginal = JSON.parse(JSON.stringify(source)); // Deep copy for comparison

    deepMerge(target, source);
    assert.deepStrictEqual(source, sourceOriginal);
  });

  test('should handle null target', () => {
    const target = null;
    const source = { a: 1 };
    const result = deepMerge(target, source);
    assert.deepStrictEqual(result, source);
  });

  test('should handle null source', () => {
    const target = { a: 1 };
    const source = null;
    const result = deepMerge(target, source);
    assert.strictEqual(result, target);
    assert.deepStrictEqual(target, { a: 1 });
  });

  test('should handle undefined source', () => {
    const target = { a: 1 };
    const source = undefined;
    const result = deepMerge(target, source);
    assert.strictEqual(result, target);
    assert.deepStrictEqual(target, { a: 1 });
  });

  test('should handle undefined target', () => {
    const target = undefined;
    const source = { a: 1 };
    const result = deepMerge(target, source);
    assert.deepStrictEqual(result, source);
  });

  test('should overwrite primitives', () => {
    const target = { a: 1 };
    const source = { a: 2 };
    deepMerge(target, source);
    assert.strictEqual(target.a, 2);
  });
});
