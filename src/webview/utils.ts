import { vscode } from './vscode-api.js';
import { WebViewState } from './types.js';

export const updateVsState = (updates: Partial<WebViewState>) => {
  const current = vscode.getState() || {};
  vscode.setState({ ...current, ...updates });
};
