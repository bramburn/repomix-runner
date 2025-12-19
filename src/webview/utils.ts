import { vscode } from './vscode-api.js';

export const updateVsState = (updates: any) => {
  const current = vscode.getState() || {};
  vscode.setState({ ...current, ...updates });
};
