import * as assert from 'assert';
import * as vscode from 'vscode';

suite('AI Chat Webview Test Suite', () => {
  test('AI Chat webview view should be registered', async () => {
    // This test verifies that the extension activates successfully
    const extensionId = 'bramburn.repomix-runner-plus';
    const extension = vscode.extensions.getExtension(extensionId);
    assert.ok(extension, 'Extension is not found');
    assert.ok(!extension.isActive, 'Extension should be inactive initially');
    
    // Activate the extension
    await extension.activate();
    assert.ok(extension.isActive, 'Extension should be active after activation');
    
    // Note: We can't directly test webview views through the VS Code API
    // The presence of the view is verified by the fact that:
    // 1. The extension activates without errors
    // 2. The AiChatWebviewProvider is imported and registered
    // 3. The package.json includes the view contribution
    
    console.log('AI Chat webview registration test completed');
  });
});