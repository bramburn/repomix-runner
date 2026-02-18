import * as assert from 'assert';
import { repomixRunnerConfigDefaultSchema } from '../../config/configSchema.js';

suite('Config Schema Test Suite', () => {
    test('repomixRunnerConfigDefaultSchema should include respectGitignoreInMarkdown', () => {
        const config = repomixRunnerConfigDefaultSchema.parse({});
        
        // Should have default value of false
        assert.strictEqual(config.runner.respectGitignoreInMarkdown, false);
        
        // Should accept true value
        const configWithTrue = repomixRunnerConfigDefaultSchema.parse({
            runner: {
                respectGitignoreInMarkdown: true
            }
        });
        assert.strictEqual(configWithTrue.runner.respectGitignoreInMarkdown, true);
        
        // Should accept false value
        const configWithFalse = repomixRunnerConfigDefaultSchema.parse({
            runner: {
                respectGitignoreInMarkdown: false
            }
        });
        assert.strictEqual(configWithFalse.runner.respectGitignoreInMarkdown, false);
    });
});
