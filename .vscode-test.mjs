import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out-test/test/lanes/integration.entry.test.js',
  workspaceFolder: 'src/test/test-workspace/root',
  version: '1.96.2',
});
