import * as vscode from 'vscode';
import { llmProviderManager } from '../core/llm/LLMProviderManager';

/**
 * Command: Repomix: Switch LLM Provider
 * Shows a quick pick to switch the default LLM provider
 */
export async function switchLLMProvider(): Promise<void> {
  try {
    // Get available text generation providers
    const availableProviders = llmProviderManager.getProvidersForCapability('text');
    
    if (availableProviders.length === 0) {
      vscode.window.showWarningMessage(
        'No LLM providers configured. Please configure at least one provider in settings.'
      );
      return;
    }
    
    // Get current default provider
    const currentProvider = llmProviderManager.getDefaultProvider().id;
    
    // Create quick pick items
    const items = availableProviders.map(providerId => {
      const provider = llmProviderManager.getProvider(providerId);
      const isCurrent = providerId === currentProvider;
      
      return {
        label: `${isCurrent ? '$(check)' : ''} ${provider.name}`,
        description: isCurrent ? 'Current' : undefined,
        detail: `Supports: ${[
          provider.capabilities.supportsTextGeneration ? 'Text' : '',
          provider.capabilities.supportsEmbeddings ? 'Embeddings' : '',
          provider.capabilities.supportsStructuredOutput ? 'Structured' : ''
        ].filter(Boolean).join(', ')}`,
        providerId
      };
    });
    
    // Show quick pick
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select default LLM provider',
      matchOnDescription: true,
      matchOnDetail: true
    });
    
    if (!selected) {
      return; // User cancelled
    }
    
    // Update configuration
    const config = vscode.workspace.getConfiguration('repomix');
    await config.update('llm.defaultProvider', selected.providerId, vscode.ConfigurationTarget.Global);
    
    vscode.window.showInformationMessage(
      `Default LLM provider switched to ${selected.providerId}. Reload window for changes to take effect.`,
      'Reload Window'
    ).then(selection => {
      if (selection === 'Reload Window') {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to switch LLM provider: ${errorMessage}`);
    console.error('[switchLLMProvider] Error:', error);
  }
}
