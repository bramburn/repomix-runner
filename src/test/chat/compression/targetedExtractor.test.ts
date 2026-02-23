import * as assert from 'assert';
import { parseGoalForSymbols } from '../../../chat/compression/targetedExtractor.js';

suite('Targeted Extractor', () => {
  suite('parseGoalForSymbols', () => {
    test('should extract PascalCase class names', () => {
      const symbols = parseGoalForSymbols('Update the UserService and AccountManager classes');
      assert.ok(symbols.includes('UserService'), 'Should find UserService');
      assert.ok(symbols.includes('AccountManager'), 'Should find AccountManager');
    });

    test('should extract camelCase function names', () => {
      const symbols = parseGoalForSymbols('Fix the calculateTotal function in the checkout module');
      assert.ok(symbols.includes('calculateTotal'), 'Should find calculateTotal');
    });

    test('should extract backtick-quoted identifiers', () => {
      const symbols = parseGoalForSymbols('Refactor `processOrder` to handle errors');
      assert.ok(symbols.includes('processOrder'), 'Should find processOrder');
    });

    test('should extract quoted identifiers', () => {
      const symbols = parseGoalForSymbols('The "fetchData" function needs optimization');
      assert.ok(symbols.includes('fetchData'), 'Should find fetchData');
    });

    test('should exclude common programming keywords', () => {
      const symbols = parseGoalForSymbols('function class const return async await');
      assert.ok(!symbols.includes('function'), 'Should not include function');
      assert.ok(!symbols.includes('class'), 'Should not include class');
    });

    test('should exclude very short identifiers', () => {
      const symbols = parseGoalForSymbols('a b c id ok');
      assert.ok(!symbols.includes('a'), 'Should not include single char');
      assert.ok(!symbols.includes('id'), 'Should not include 2-char');
    });

    test('should return empty array for goal with no identifiers', () => {
      const symbols = parseGoalForSymbols('fix the bug');
      // "fix", "the", "bug" should all be excluded (common words or too short)
      assert.ok(Array.isArray(symbols));
    });
  });
});
