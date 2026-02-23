import * as assert from 'assert';
import * as path from 'path';
import { ArchitectureState } from '../../../chat/architecture/architectureState.js';
import { checkFreshnessNode } from '../../../chat/architecture/nodes/checkFreshness.js';
import { scanDirectoryNode } from '../../../chat/architecture/nodes/scanDirectory.js';
import { gatherDependenciesNode } from '../../../chat/architecture/nodes/gatherDependencies.js';

suite('Architecture Generator Nodes', () => {
  const testWorkspaceRoot = path.join(__dirname, '../../test-workspace');

  suite('scanDirectoryNode', () => {
    test('should build directory tree with classification', async () => {
      const mockState = {
        repoId: 'test-repo',
        repoRoot: testWorkspaceRoot,
      } as typeof ArchitectureState.State;

      const result = await scanDirectoryNode(mockState);

      assert.ok(result.directoryTree, 'Directory tree should be built');
      assert.strictEqual(result.directoryTree.type, 'directory', 'Root should be a directory');
      assert.ok(
        Array.isArray(result.directoryTree.children),
        'Directory should have children'
      );
    });

    test('should classify common directories', async () => {
      const mockState = {
        repoId: 'test-repo',
        repoRoot: testWorkspaceRoot,
      } as typeof ArchitectureState.State;

      const result = await scanDirectoryNode(mockState);

      // Check that classifications are present
      function hasClassification(node: any): boolean {
        if (node.classification) return true;
        if (node.children && Array.isArray(node.children)) {
          return node.children.some((child: any) => hasClassification(child));
        }
        return false;
      }

      const hasClassifications = hasClassification(result.directoryTree);
      assert.ok(hasClassifications, 'Should classify at least one directory');
    });
  });

  suite('gatherDependenciesNode', () => {
    test('should extract dependencies from package.json', async () => {
      const mockState = {
        repoId: 'test-repo',
        repoRoot: testWorkspaceRoot,
      } as typeof ArchitectureState.State;

      const result = await gatherDependenciesNode(mockState);

      assert.ok(result.dependencies, 'Dependencies should be extracted');
      assert.ok(typeof result.dependencies === 'object', 'Dependencies should be an object');
    });
  });

  suite('checkFreshnessNode', () => {
    test('should handle missing architecture gracefully', async () => {
      const mockState = {
        repoId: 'non-existent-repo',
        repoRoot: testWorkspaceRoot,
      } as typeof ArchitectureState.State;

      const result = await checkFreshnessNode(mockState);

      // Should not throw, and should return isFresh: false for non-existent repo
      assert.strictEqual(result.isFresh, false, 'Should mark as not fresh when no existing architecture');
    });
  });
});
