type OutputChannel = {
  appendLine: (value: string) => void;
  show: () => void;
  clear: () => void;
  dispose: () => void;
};

const createNoopOutputChannel = (): OutputChannel => ({
  appendLine: () => {},
  show: () => {},
  clear: () => {},
  dispose: () => {},
});

export const window = {
  createOutputChannel: () => createNoopOutputChannel(),
  showInformationMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showErrorMessage: async () => undefined,
};

export const commands = {
  executeCommand: async () => undefined,
};

export const workspace = {
  workspaceFolders: [],
};

export const Uri = {
  file: (fsPath: string) => ({ fsPath }),
};

export default {
  window,
  commands,
  workspace,
  Uri,
};
