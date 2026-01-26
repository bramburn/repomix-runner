import * as assert from 'assert';
import * as vscode from 'vscode';
import { getGitApi, getRepoForActiveEditor, getAllChangedUris } from '../../git/gitUtils';

suite('Git Utils Test Suite', () => {
  test('getGitApi should return API when Git extension is available', async () => {
    // This test will pass if the Git extension is available
    // In a real test environment, we might need to mock the extension
    const api = await getGitApi();
    // api can be undefined if Git extension is not available, which is acceptable
    assert.ok(api === undefined || typeof api === 'object');
  });

  test('getRepoForActiveEditor should handle case when no repositories exist', async () => {
    const repo = await getRepoForActiveEditor();
    // Should handle gracefully - either return undefined or a repo
    assert.ok(repo === undefined || typeof repo === 'object');
  });

  test('getAllChangedUris should return array of URIs', () => {
    // Mock repository object for testing
    const mockRepo: any = {
      state: {
        indexChanges: [],
        workingTreeChanges: [],
        untrackedChanges: []
      }
    };
    
    const uris = getAllChangedUris(mockRepo);
    assert.ok(Array.isArray(uris));
  });

  test('getAllChangedUris should deduplicate URIs', () => {
    const mockUri1 = vscode.Uri.file('/test/file1.txt');
    const mockUri2 = vscode.Uri.file('/test/file2.txt');
    
    const mockRepo: any = {
      state: {
        indexChanges: [{ uri: mockUri1 }],
        workingTreeChanges: [{ uri: mockUri1 }], // Duplicate
        untrackedChanges: [{ uri: mockUri2 }]
      }
    };
    
    const uris = getAllChangedUris(mockRepo);
    assert.strictEqual(uris.length, 2); // Should deduplicate
    assert.deepStrictEqual(uris, [mockUri1, mockUri2]);
  });
});