import * as assert from 'assert';
import { assemblePromptFromPayload } from '../../../chat/batch/packageAssembler.js';

suite('packageAssembler', () => {
  test('assembles prompt with goal, context, dependencies, and output instructions', () => {
    const prompt = assemblePromptFromPayload({
      goal: 'Implement feature X',
      contextFiles: [{ path: 'src/foo.ts', content: 'export const x = 1;' }],
      repoArchitecture: '# Repo Tree',
      dependencies: { react: '^19.0.0' },
      outputInstruction: 'code_change',
    });

    assert.ok(prompt.includes('Implement feature X'));
    assert.ok(prompt.includes('src/foo.ts'));
    assert.ok(prompt.includes('react: ^19.0.0'));
    assert.ok(prompt.includes('Output Instructions'));
  });
});
