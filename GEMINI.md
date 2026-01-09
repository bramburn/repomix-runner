# Gemini CLI Context: Repomix Runner Plus

This document summarizes the Repomix Runner Plus VSCode extension, its purpose, architecture, and key patterns.

## Project Overview

**Repomix Runner Plus** is a VSCode extension designed to streamline the process of bundling files for AI processing. It leverages the external `Repomix` tool to create consolidated outputs, supports reusable file bundles, and integrates advanced AI features for intelligent file selection and indexing. The extension aims to improve developer productivity by simplifying code context management for AI tools.

## Key Features

*   **File Bundling:** Allows users to select files and bundle them into a single output for AI consumption.
*   **Bundle Management:** Users can create, edit, delete, and manage reusable bundles of files.
*   **AI Integration:**
    *   **Smart Agent (`smartRunCommand`):** Utilizes LangGraph and Google Generative AI to intelligently select files based on natural language queries.
    *   **Background Indexing:** Continuously monitors file changes in the repository to update embeddings in a vector database (e.g., Pinecone) for faster AI retrieval.
    *   **Token Count Management:** Offers options for compressing output and selecting token encodings.
*   **Clipboard Workflows:** Supports copying file content or entire files to the clipboard, with special handling for remote development environments (SSH).
*   **Configuration:** Extensible configuration via VSCode settings and an optional `repomix.config.json` file.
*   **UI Integration:** Features include a dedicated Explorer view (`repomixBundles`), an Activity Bar view (`Repomix Control Panel`), and file decorations.
*   **Rust Integration:** Some high-performance components are likely implemented in Rust, managed via build scripts.

## Architecture and Patterns

The extension follows a modular and layered architecture, common in VSCode extension development and modern software engineering.

### 1. VSCode Extension Development Patterns

*   **Activation/Deactivation Lifecycle:** Standard `activate` and `deactivate` functions manage extension startup and cleanup.
*   **Command Registration:** Commands are registered using `vscode.commands.registerCommand`, linking user actions to specific functions.
*   **UI Integration:**
    *   **TreeView:** Utilizes `vscode.window.createTreeView` with a custom `BundleDataProvider` for managing bundles in the Explorer.
    *   **Webview:** Employs `vscode.window.registerWebviewViewProvider` for interactive panels like the "Repomix Control Panel".
    *   **File Decorations:** Uses `vscode.window.registerFileDecorationProvider` to add visual indicators to files related to bundles.
*   **Event Handling:** `vscode.workspace.createFileSystemWatcher` is used for real-time monitoring of file system changes (create, delete, modify).
*   **Disposable Management:** `context.subscriptions.push()` is used to register disposables, ensuring resources are properly released upon deactivation.
*   **Configuration Management:** Reads settings from VSCode's `workspaceState`, `context.secrets` (for sensitive data like API keys), and potentially user-defined config files.

### 2. AI and Indexing Patterns

*   **Background Processing:** A dedicated background monitor runs file system watchers to trigger incremental updates without blocking the UI.
*   **Debouncing:** File system events are debounced (2.5-second delay) to batch rapid changes, optimizing performance and reducing redundant operations.
*   **Ignore Filtering:** Leverages the `ignore` npm package to parse `.gitignore` and custom patterns, excluding irrelevant files (e.g., `node_modules`, build artifacts) from indexing.
*   **Incremental Indexing:** Employs `RepoIndexMonitor` and `RepoEmbeddingOrchestrator` to update vector databases (like Pinecone) by processing only changed files, rather than re-indexing the entire repository.
*   **LLM Agent Development (LangGraph):** The "Smart Agent" feature utilizes LangGraph and Google Generative AI, demonstrating patterns for building stateful LLM agents, including prompt engineering, state management, and tool integration.
*   **Secret Management:** API keys and other sensitive information are stored securely using `context.secrets`.

### 3. File Handling and Cross-Environment Patterns

*   **Remote Development Support:** Detects remote environments (SSH, WSL, Dev Containers) and adapts clipboard operations accordingly, including base64 encoding for remote-to-local file transfer.
*   **Clipboard Modes:** Implements distinct modes for clipboard operations (File Object vs. Text Content) to cater to different user needs and OS capabilities.
*   **Performance Optimization:** The use of Rust for certain operations suggests offloading performance-critical tasks to compiled code.

### 4. Modularity and Separation of Concerns

The codebase is organized into logical directories (`src/core`, `src/commands`, `src/agent`, `src/webview`, `src/config`, `src/shared`, `src/utils`) promoting maintainability and testability.

## Folder Structure

```
C:\dev\repomix-runner\
├───.claude\
├───.github\
├───.idea\
├───.vscode\
├───assets\
├───bin\
├───dist
├───node_modules
├───rust\
├───scripts\
├───src\
│   ├───agent\
│   ├───commands\
│   ├───config\
│   ├───core\
│   ├───search\
│   ├───shared\
│   ├───test\
│   ├───types\
│   └───utils\
│   └───webview\
├───verification\
├───.cursorignore
├───.gitignore
├───.prettierrc
├───.vscode-test.mjs
├───.vscodeignore
├───architecture.md
├───CHANGELOG.md
├───esbuild.js
├───eslint.config.mjs
├───gemini-types.d.ts
├───GEMINI.md
├───ingest.md
├───LICENSE.md
├───package-lock.json
├───package.json
├───README.md
├───REMOTE_BINARY_SUMMARY.md
├───remote-binary-execution-plan.md
├───remote-binary-implementation.md
├───repomix_search_4rJuCw.md
├───repomix.config.json
├───tsconfig.json
└───vsc-extension-quickstart.md
```

## Building and Running

The project uses `npm` scripts for building, testing, and packaging:

*   **Compile/Build:** `npm run compile` (uses `esbuild`)
*   **Watch Mode:** `npm run watch` (for development, recompiles on changes)
*   **Linting:** `npm run lint` (uses `eslint`)
*   **Testing:** `npm test` (uses `@vscode/test-electron`)
*   **Packaging:** `npm run package` (builds the extension for distribution)
*   **VSIX Package:** `npm run package:vsix` (creates a `.vsix` file for manual installation)
*   **Rust Build:** `npm run build:rust`

## Key Packages

*   **Core Framework & UI:**
    *   `react`, `react-dom`: For building the webview interface.
    *   `@fluentui/react-components`: Microsoft's Fluent UI components for consistent UI.
    *   `@vscode/vsce`: For packaging the VSCode extension.
    *   `@vscode/test-electron`: For running VSCode extension tests.
*   **AI/LLM & Vector Databases:**
    *   `@google/genai`: Google's Generative AI SDK.
    *   `@langchain/core`, `@langchain/google-genai`, `@langchain/langgraph`: For building LLM applications and agents.
    *   `@pinecone-database/pinecone`, `@qdrant/js-client-rest`: Clients for interacting with vector databases.
    *   `gpt-tokenizer`: For handling tokenization of text.
*   **Build & Development Tools:**
    *   `typescript`: For static typing.
    *   `eslint`: For code linting.
    *   `esbuild`: For fast module bundling.
*   **Utilities:**
    *   `ignore`: For parsing `.gitignore` files.
    *   `globby`: For file path matching.
    *   `zod`: For schema declaration and validation.
    *   `fast-xml-parser`: For parsing XML output.
    *   `sql.js`: For using SQLite in the browser/Node.js.
*   **Rust Integration:**
    *   Indicated by `rust/` directory and `scripts/build-rust.mjs`, suggesting Rust is used for performance-critical components.

## Configuration

*   **VSCode Settings:** A comprehensive set of settings is available via the VSCode settings UI, categorized into `Runner`, `Output`, `Include`, `Ignore`, `Security`, `Token Count`, and `Smart Agent`.
*   **`repomix.config.json`:** An optional file in the project root can override some extension settings.
*   **API Keys:** Sensitive keys (e.g., Google API Key, Pinecone API Key) are managed securely via VSCode's secret storage.

## Contribution and License

*   The project welcomes contributions, feedback, issues, and feature requests.
*   It is licensed under the MIT License.