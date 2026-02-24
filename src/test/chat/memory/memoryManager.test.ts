import * as assert from 'assert';
import { MemoryManager } from '../../../chat/memory/memoryManager.js';
import type { MemoryCreateInput } from '../../../chat/memory/types.js';

suite('memoryManager', () => {
  test('rejects non-UUID scopeId for session scope', async () => {
    const manager = new MemoryManager({} as any);

    await assert.rejects(
      () =>
        manager.create({
          scope: 'session',
          scopeId: 'not-a-uuid',
          key: 'k',
          value: 'v',
          source: 'user',
        }),
      /valid threadId UUID/
    );
  });

  test('accepts any scopeId for repo scope', async () => {
    const manager = new MemoryManager({} as any);
    let capturedInput: any;

    (manager as any).repository = {
      createMemory: async (input: any) => {
        capturedInput = input;
        return {
          id: 'memory-1',
          scope: input.scope,
          scopeId: input.scopeId,
          key: input.key,
          value: input.value,
          source: input.source,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          expiresAt: null,
        };
      },
    };

    await manager.create({
      scope: 'repo',
      scopeId: 'workspace-1',
      key: 'k',
      value: 'v',
      source: 'user',
    });

    assert.strictEqual(capturedInput.scopeId, 'workspace-1');
  });

  test('trims scopeId and key/value before repository create', async () => {
    const manager = new MemoryManager({} as any);
    let capturedInput: any;

    (manager as any).repository = {
      createMemory: async (input: MemoryCreateInput) => {
        capturedInput = input;
        return {
          id: 'memory-1',
          scope: input.scope,
          scopeId: input.scopeId,
          key: input.key,
          value: input.value,
          source: input.source,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          expiresAt: null,
        };
      },
    };

    await manager.create({
      scope: 'repo',
      scopeId: ' repo-scope ',
      key: '  my-key  ',
      value: '  my-value  ',
      source: 'user',
    });

    assert.strictEqual(capturedInput.scopeId, 'repo-scope');
    assert.strictEqual(capturedInput.key, 'my-key');
    assert.strictEqual(capturedInput.value, 'my-value');
  });
});
