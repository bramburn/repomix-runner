# VSCode UX & UI Guidelines for PRD Generation

This document provides reference information for generating PRDs specifically for VSCode extensions.

## Common VSCode UI Components

- **TreeView**: Used for sidebar lists, navigation, and hierarchical data. Use `vscode.window.createTreeView`.
- **WebviewView**: For complex, custom UI in the sidebar. Use `vscode.window.registerWebviewViewProvider`.
- **WebviewPanel**: For full-editor custom UI. Use `vscode.window.createWebviewPanel`.
- **QuickPick**: For searchable, list-based input/selection. Use `vscode.window.showQuickPick`.
- **StatusBar**: For persistent, low-priority information. Use `vscode.window.createStatusBarItem`.
- **FileDecoration**: For adding badges or colors to the file explorer. Use `vscode.window.registerFileDecorationProvider`.

## Design Patterns

- **Command Pattern**: Encapsulate actions as commands registered in `package.json`.
- **Provider Pattern**: Decouple data retrieval from the UI (e.g., `TextDocumentContentProvider`, `TreeDataProvider`).
- **State Management**: 
    - `workspaceState`: Persist state across sessions.
    - `globalState`: Persist state across workspaces.
    - `context.secrets`: Secure storage for API keys.
- **Message Passing**: Standardized protocol for `postMessage` and `onDidReceiveMessage` between Webview and Extension Host.

## Styling Guidelines

- **Theme Variables**: ALWAYS prefer VSCode theme variables over hardcoded colors.
    - `--vscode-editor-background`
    - `--vscode-button-background`
    - `--vscode-foreground`
    - `--vscode-font-family`
- **Fluent UI**: Use `@fluentui/react-components` for a native VSCode feel if React is used in webviews.
- **Icons**: Use Codicons (`vscode-codicon`) for standard UI iconography.

## Communication Protocol (Webview <-> Extension)

When planning a Webview, define the message interface:
```typescript
interface WebviewMessage {
  command: string;
  data: any;
}
```
Example implementation in PRD:
```typescript
// Extension Host
webviewView.webview.onDidReceiveMessage(message => {
  switch (message.command) {
    case 'actionName':
      doSomething(message.data);
      return;
  }
});

// Webview
vscode.postMessage({ command: 'actionName', data: { ... } });
```
