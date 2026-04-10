# Command System

<cite>
**Referenced Files in This Document**
- [package.json](file://package.json)
- [extension.ts](file://src/extension.ts)
- [runRepomix.ts](file://src/commands/runRepomix.ts)
- [runBundle.ts](file://src/commands/runBundle.ts)
- [runRepomixOnOpenFiles.ts](file://src/commands/runRepomixOnOpenFiles.ts)
- [runRepomixOnSelectedFiles.ts](file://src/commands/runRepomixOnSelectedFiles.ts)
- [copySelectedFilesToClipboard.ts](file://src/commands/copySelectedFilesToClipboard.ts)
- [copySelectedFilesAsCompressed.ts](file://src/commands/copySelectedFilesAsCompressed.ts)
- [copyRepomixOutput.ts](file://src/commands/copyRepomixOutput.ts)
- [openSettings.ts](file://src/commands/openSettings.ts)
- [openOutput.ts](file://src/commands/openOutput.ts)
- [createBundle.ts](file://src/commands/createBundle.ts)
- [editBundle.ts](file://src/commands/editBundle.ts)
- [deleteBundle.ts](file://src/commands/deleteBundle.ts)
- [selectActiveBundle.ts](file://src/commands/selectActiveBundle.ts)
- [goToConfigFile.ts](file://src/commands/goToConfigFile.ts)
- [mutateActiveBundle.ts](file://src/commands/mutateActiveBundle.ts)
- [testCompression.ts](file://src/commands/testCompression.ts)
- [switchLLMProvider.ts](file://src/commands/switchLLMProvider.ts)
- [utils.ts](file://src/commands/utils.ts)
- [gitUtils.ts](file://src/git/gitUtils.ts)
- [compressedMarkdownGenerator.ts](file://src/core/files/compressedMarkdownGenerator.ts)
- [compressFile.ts](file://src/core/compression/compressFile.ts)
- [LanguageParser.ts](file://src/core/compression/LanguageParser.ts)
- [types.ts](file://src/core/compression/types.ts)
- [LLMProviderManager.ts](file://src/core/llm/LLMProviderManager.ts)
- [BaseProvider.ts](file://src/core/llm/providers/BaseProvider.ts)
- [OllamaProvider.ts](file://src/core/llm/providers/OllamaProvider.ts)
- [LMStudioProvider.ts](file://src/core/llm/providers/LMStudioProvider.ts)
- [compatibilityShim.ts](file://src/core/llm/compatibilityShim.ts)
- [test-compression.ts](file://src/test-compression.ts)
- [test-compression.js](file://scripts/test-compression.js)
- [diagnose-compression.js](file://scripts/diagnose-compression.js)
- [.vscode/launch.json](file://.vscode/launch.json)
</cite>

## Update Summary
**Changes Made**
- Added comprehensive documentation for the new `switchLLMProvider` command
- Updated LLM provider architecture documentation to reflect the unified provider management system
- Enhanced command registration documentation to include the new LLM provider switching functionality
- Updated existing command documentation to reflect integration with the new LLM provider system
- Added documentation for the compatibility shim that maintains backward compatibility
- Updated architecture diagrams to show the new LLM provider management layer

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)
10. [Appendices](#appendices)

## Introduction
This document explains the Command System of the extension, covering how VS Code commands are registered, how command handlers are structured as pure functions, and how user interactions are orchestrated. It documents each command's purpose, parameters, execution flow, and user feedback mechanisms. It also covers command registration in package.json, command palette integration, keyboard shortcuts, error handling, progress reporting, command chaining, conditional visibility, dynamic generation of commands, and utility patterns for extending the system.

**Updated** The command system now includes a unified LLM provider management system that provides centralized control over multiple AI providers, with the new `switchLLMProvider` command enabling users to easily change their default provider.

## Project Structure
The command system is organized around a central activation routine that registers commands and wires them to pure function-based handlers. Commands are grouped under the namespace and grouped by feature areas such as bundling, running Repomix, copying output, compression testing, settings, and LLM provider management. The system now includes advanced compression capabilities for intelligent code extraction and AST-based file processing, with comprehensive debugging and diagnostic support, plus unified LLM provider management for seamless provider switching.

```mermaid
graph TB
subgraph "VS Code"
CP["Command Palette"]
Menu["Menus (Explorer, SCM, View)"]
KB["Keyboard Shortcuts"]
SCM["Git SCM Interface"]
DBG["VS Code Debugger"]
end
subgraph "Extension Activation"
EXT["extension.ts<br/>registerCommand(...)"]
WASM["WASM Path Initialization"]
LLM["LLM Provider Manager<br/>Initialization"]
end
subgraph "Commands"
R["runRepomix.ts"]
RB["runBundle.ts"]
ROF["runRepomixOnOpenFiles.ts"]
RSF["runRepomixOnSelectedFiles.ts"]
CCF["copySelectedFilesToClipboard.ts"]
CCS["copySelectedFilesAsCompressed.ts"]
CRO["copyRepomixOutput.ts"]
TC["testCompression.ts (ENHANCED)"]
OS["openSettings.ts"]
OO["openOutput.ts"]
CB["createBundle.ts"]
EB["editBundle.ts"]
DB["deleteBundle.ts"]
SAB["selectActiveBundle.ts"]
GCF["goToConfigFile.ts"]
MAB["mutateActiveBundle.ts"]
SWITCH["switchLLMProvider.ts (NEW)"]
U["utils.ts"]
GU["gitUtils.ts"]
end
subgraph "Compression System"
CMG["compressedMarkdownGenerator.ts"]
CF["compressFile.ts"]
LP["LanguageParser.ts"]
CT["types.ts"]
end
subgraph "LLM Provider System"
LPM["LLMProviderManager.ts"]
BP["BaseProvider.ts"]
OP["OllamaProvider.ts"]
LP["LMStudioProvider.ts"]
CS["compatibilityShim.ts"]
end
subgraph "Debugging & Diagnostics"
TST["test-compression.ts"]
TJS["test-compression.js"]
DIAG["diagnose-compression.js"]
LAUNCH["launch.json"]
end
CP --> EXT
Menu --> EXT
KB --> EXT
SCM --> EXT
DBG --> LAUNCH
EXT --> R
EXT --> RB
EXT --> ROF
EXT --> RSF
EXT --> CCF
EXT --> CCS
EXT --> CRO
EXT --> TC
EXT --> OS
EXT --> OO
EXT --> CB
EXT --> EB
EXT --> DB
EXT --> SAB
EXT --> GCF
EXT --> MAB
EXT --> SWITCH
CCS --> CMG
TC --> CF
TC --> LP
CF --> LP
LPM --> OP
LPM --> LP
LPM --> BP
CS --> LPM
SWITCH --> LPM
```

**Diagram sources**
- [extension.ts:662-665](file://src/extension.ts#L662-L665)
- [switchLLMProvider.ts:8-68](file://src/commands/switchLLMProvider.ts#L8-L68)
- [LLMProviderManager.ts:13-52](file://src/core/llm/LLMProviderManager.ts#L13-L52)
- [compatibilityShim.ts:28-72](file://src/core/llm/compatibilityShim.ts#L28-L72)

**Section sources**
- [extension.ts:79-92](file://src/extension.ts#L79-L92)
- [package.json:20-32](file://package.json#L20-L32)

## Core Components
- Pure function-based command handlers: Each command is a small, testable function that receives inputs and performs side effects via injected dependencies. Examples include runRepomix, runBundle, runRepomixOnOpenFiles, runRepomixOnSelectedFiles, copySelectedFilesToClipboard, copySelectedFilesAsCompressed, copyRepomixOutput, testCompression, openSettings, openOutput, createBundle, editBundle, deleteBundle, selectActiveBundle, goToConfigFile, mutateActiveBundle, and the new switchLLMProvider.
- Central registration: All commands are registered in extension.ts using vscode.commands.registerCommand and stored in context.subscriptions for lifecycle management.
- Unified LLM Provider Management: A centralized system manages multiple AI providers (Ollama, LM Studio, OpenRouter, Gemini) with automatic initialization, rate limiting, and usage tracking.
- Configuration-driven behavior: Many commands read from VS Code settings and repomix configuration files to tailor behavior (e.g., output path, style, copy mode, LLM provider selection).
- User feedback: Commands consistently use notifications, warnings, and progress reporting to inform users of outcomes and long-running tasks.
- Security checks: Commands validate paths and configurations to prevent unsafe operations.
- Advanced compression system: New compression capabilities provide AST-based code extraction and intelligent file compression for reduced token count.
- Git SCM integration: Seamless integration with VS Code's Git SCM interface for quick access to repository changes.
- **Enhanced Debugging Support**: Comprehensive VS Code debugger integration with dedicated launch configurations for extension development and testing.
- **Diagnostic Tooling**: Built-in diagnostic scripts for compression system health checking and troubleshooting.

**Section sources**
- [extension.ts:79-92](file://src/extension.ts#L79-L92)
- [switchLLMProvider.ts:8-68](file://src/commands/switchLLMProvider.ts#L8-L68)
- [LLMProviderManager.ts:13-52](file://src/core/llm/LLMProviderManager.ts#L13-L52)
- [compatibilityShim.ts:28-72](file://src/core/llm/compatibilityShim.ts#L28-L72)

## Architecture Overview
The command architecture follows a layered pattern:
- Presentation/UI: VS Code menus, command palette, keyboard shortcuts, Git SCM interface, and debugger trigger commands.
- Registration: extension.ts registers commands and wires them to pure function handlers.
- LLM Provider Layer: Unified LLM provider management system handles provider initialization, configuration, and switching.
- Execution: Handlers orchestrate configuration loading, validation, external tool invocation, compression processing, and LLM provider selection.
- Feedback: Notifications, progress dialogs, and error messages communicate outcomes.
- Persistence: Some commands update bundle state or write files.
- Compression pipeline: Advanced compression system processes files through AST parsing and intelligent extraction.
- Git Integration: Seamless integration with VS Code's Git SCM interface.
- **Debugging Integration**: VS Code debugger provides breakpoints, step-through debugging, and real-time inspection of compression operations.

```mermaid
sequenceDiagram
participant User as "User"
participant VSCode as "VS Code"
participant Debugger as "VS Code Debugger"
participant Ext as "extension.ts"
participant Cmd as "Command Handler"
participant LLM as "LLM Provider Manager"
participant Provider as "LLM Provider"
participant Comp as "Compression System"
participant Parser as "LanguageParser"
participant Git as "Git Utils"
participant Deps as "Dependencies"
participant Tool as "External Tool"
User->>VSCode : "Invoke command (palette/menu/shortcut/SCM)"
VSCode->>Ext : "executeCommand(namespace : command)"
Debugger->>Ext : "Debug session (breakpoints, inspection)"
Ext->>Cmd : "Call handler with parameters"
Cmd->>LLM : "Get available providers for capability"
LLM-->>Cmd : "Provider IDs with text generation support"
Cmd->>Git : "Get repository and changed files"
Git-->>Cmd : "URIs for staged/unstaged/untracked"
Cmd->>Comp : "Process files through compression pipeline"
Comp->>Parser : "Initialize WASM parser"
Parser-->>Comp : "Parser instance ready"
Comp->>Comp : "AST parsing, language detection, chunk extraction"
Comp-->>Cmd : "Compressed content with token count"
Cmd->>Deps : "Read config, validate, compute flags"
Cmd->>Tool : "Execute CLI with flags"
Tool-->>Cmd : "stdout/stderr"
Cmd->>VSCode : "Show notification/progress/error"
Cmd-->>Ext : "Return completion"
```

**Diagram sources**
- [extension.ts:662-665](file://src/extension.ts#L662-L665)
- [switchLLMProvider.ts:10-18](file://src/commands/switchLLMProvider.ts#L10-L18)
- [LLMProviderManager.ts:93-105](file://src/core/llm/LLMProviderManager.ts#L93-L105)
- [testCompression.ts:28-37](file://src/commands/testCompression.ts#L28-L37)
- [LanguageParser.ts:79-93](file://src/core/compression/LanguageParser.ts#L79-L93)

## Detailed Component Analysis

### Command Registration and Lifecycle
- Registration: All commands are registered in extension.ts with vscode.commands.registerCommand and pushed to context.subscriptions for disposal on deactivation.
- Lifecycle: Commands are long-lived during activation; subscriptions ensure proper cleanup. Background tasks (e.g., file watchers) are also managed here.
- Chaining: Some commands delegate to others (e.g., editBundle invokes selectActiveBundle internally, copySelectedFilesAsCompressed delegates to compression system).
- LLM Provider Integration: New commands integrate seamlessly with the unified LLM provider management system.
- **WASM Initialization**: Extension initializes WASM parser directory during activation for optimal compression performance.
- **LLM Provider Initialization**: Extension initializes the unified LLM provider manager during activation, loading configurations from VS Code settings.

```mermaid
sequenceDiagram
participant Ext as "extension.ts"
participant Reg as "registerCommand"
participant Sub as "context.subscriptions"
participant Cmd as "Command Handler"
participant LLM as "LLM Provider Manager"
participant Comp as "Compression System"
Ext->>LLM : "initializeFromConfig()"
LLM-->>Ext : "Initialize providers (Ollama, LM Studio, etc.)"
Ext->>Reg : "Register 'repomixRunner.switchLLMProvider'"
Reg-->>Ext : "Disposable"
Ext->>Sub : "Push disposable"
Ext->>Comp : "Initialize WASM path"
Comp->>Comp : "Set wasmDirectory"
Ext->>Cmd : "Invoke on user action"
Cmd->>LLM : "getProvidersForCapability('text')"
LLM-->>Cmd : "Available provider IDs"
Cmd->>Comp : "compressFile() with debugger support"
Comp->>Comp : "compressFile() for each language"
Comp-->>Cmd : "Concatenated content with token count"
Cmd->>Cmd : "Handle copy mode (content/file)"
Note over Ext,Sub : "Disposed on deactivate()"
```

**Diagram sources**
- [extension.ts:83-91](file://src/extension.ts#L83-L91)
- [extension.ts:662-665](file://src/extension.ts#L662-L665)
- [compatibilityShim.ts:28-72](file://src/core/llm/compatibilityShim.ts#L28-L72)
- [switchLLMProvider.ts:10-18](file://src/commands/switchLLMProvider.ts#L10-L18)
- [testCompression.ts:20-26](file://src/commands/testCompression.ts#L20-L26)

**Section sources**
- [extension.ts:79-92](file://src/extension.ts#L79-L92)
- [extension.ts:662-665](file://src/extension.ts#L662-L665)

### Pure Function-Based Command Pattern
- Handlers are pure functions with explicit inputs and side effects isolated via injected dependencies.
- Common patterns:
  - Dependency injection for testability (e.g., defaultRunRepomixDeps).
  - Abort signals for cancellation support.
  - Override configuration merges for flexible behavior.
  - Validation and security checks before invoking external tools.
  - Advanced compression pipeline integration for intelligent file processing.
  - Git utilities integration for SCM operations.
  - **Enhanced Error Handling**: Comprehensive error catching and user-friendly error messages for compression failures.
  - **LLM Provider Integration**: Commands can leverage the unified LLM provider system for text generation and structured output.

Examples:
- runRepomix: orchestrates config reading, flag building, execution, and post-processing.
- runRepomixOnSelectedFiles: computes include patterns from URIs and delegates to runRepomix.
- runBundle: resolves bundle-specific overrides, validates output paths, filters missing files, and executes on selected files.
- copySelectedFilesAsCompressed: integrates with compression system to extract essential code structures while maintaining token efficiency.
- **switchLLMProvider (NEW)**: Provides a user interface for switching the default LLM provider among available options.
- **testCompression (Enhanced)**: provides interactive compression testing with VS Code debugger integration, programmatic usage examples, and comprehensive error handling.

**Section sources**
- [runRepomix.ts:48-154](file://src/commands/runRepomix.ts#L48-L154)
- [runRepomixOnSelectedFiles.ts:26-100](file://src/commands/runRepomixOnSelectedFiles.ts#L26-L100)
- [runBundle.ts:15-156](file://src/commands/runBundle.ts#L15-L156)
- [copySelectedFilesToClipboard.ts:67-147](file://src/commands/copySelectedFilesToClipboard.ts#L67-L147)
- [copySelectedFilesAsCompressed.ts:58-170](file://src/commands/copySelectedFilesAsCompressed.ts#L58-L170)
- [switchLLMProvider.ts:8-68](file://src/commands/switchLLMProvider.ts#L8-L68)
- [testCompression.ts:1-39](file://src/commands/testCompression.ts#L1-L39)

### Command Palette, Menus, and Keyboard Shortcuts
- Contributes: package.json defines commands, categories, titles, icons, and menus.
- Menus:
  - Explorer context menu for file/folder actions (Run on Selection, Add to Bundle, Remove from Bundle, Copy as Markdown to Clipboard, Copy as Compressed Repomix to Clipboard).
  - View title/context menus for bundle management (Create, Run, Edit, Delete, Go to Config).
  - SCM resource state context menu for quick copy (Copy as Markdown to Clipboard).
  - SCM title menu for Git integration (Copy All Changed Files to Clipboard).
- Command palette: most commands are exposed; some are hidden via when clauses.
- Keyboard shortcuts: configured in package.json; commands are bound to repomixRunner.* identifiers.
- New commands: Copy as Compressed Repomix to Clipboard, Test Compression, and Switch LLM Provider are now available in command palette and explorer context menus.

**Updated** Added new commands: Copy as Compressed Repomix to Clipboard, Test Compression, and Switch LLM Provider with appropriate menu integration and keyboard shortcuts.

**Section sources**
- [package.json:515-591](file://package.json#L515-L591)

### LLM Provider Management System
- **Unified Provider Management**: The LLMProviderManager serves as the central orchestrator for all LLM providers, managing lifecycle, rate limiting, and usage tracking.
- **Provider Registration**: Providers are automatically registered based on VS Code configuration, supporting Ollama, LM Studio, OpenRouter, and Gemini.
- **Capability-Based Selection**: Commands can query providers by capability (text generation, embeddings) to ensure compatibility.
- **Rate Limiting and Usage Tracking**: Built-in rate limiting queues and usage statistics tracking for all providers.
- **Backward Compatibility**: The compatibility shim maintains the old llmClient API while redirecting to the new system.
- **Provider Switching**: The new switchLLMProvider command enables users to easily change their default provider through a quick pick interface.

**New Section** The unified LLM provider management system provides centralized control over multiple AI providers, enabling seamless switching and consistent behavior across the extension.

**Section sources**
- [LLMProviderManager.ts:13-187](file://src/core/llm/LLMProviderManager.ts#L13-L187)
- [BaseProvider.ts:16-145](file://src/core/llm/providers/BaseProvider.ts#L16-L145)
- [OllamaProvider.ts:18-194](file://src/core/llm/providers/OllamaProvider.ts#L18-L194)
- [LMStudioProvider.ts:19-172](file://src/core/llm/providers/LMStudioProvider.ts#L19-L172)
- [compatibilityShim.ts:28-72](file://src/core/llm/compatibilityShim.ts#L28-L72)
- [switchLLMProvider.ts:8-68](file://src/commands/switchLLMProvider.ts#L8-L68)

### Command Handlers Overview

#### runRepomix
- Purpose: Execute Repomix on the entire workspace root with merged configuration.
- Parameters: Optional dependency overrides and signal for cancellation.
- Flow:
  - Read VS Code and repomix configs.
  - Merge and validate configuration (security checks on output path).
  - Build CLI flags and execute via npx.
  - Copy to clipboard if enabled; notify outcome; optionally keep/remove output file.
- Error handling: Catches errors, logs, shows messages, respects AbortSignal.

```mermaid
flowchart TD
Start(["runRepomix"]) --> ReadCfg["Read VS Code + repomix config"]
ReadCfg --> MergeCfg["Merge configs + overrides"]
MergeCfg --> Validate["Validate output path"]
Validate --> BuildFlags["Build CLI flags"]
BuildFlags --> Exec["Execute npx repomix"]
Exec --> Post["Post-process (clipboard, notifications)"]
Post --> End(["Done"])
```

**Diagram sources**
- [runRepomix.ts:48-154](file://src/commands/runRepomix.ts#L48-L154)

**Section sources**
- [runRepomix.ts:48-154](file://src/commands/runRepomix.ts#L48-L154)

#### runBundle
- Purpose: Run Repomix on a bundle's files with bundle-specific overrides.
- Parameters: bundleManager, bundleId, optional AbortSignal, additional overrides.
- Flow:
  - Load bundle and merge overrides; validate output path.
  - Compute final output filename and extension.
  - Resolve URIs, validate existence, warn about missing files.
  - Delegate to runRepomixOnSelectedFiles with computed include patterns.
  - Update lastUsed timestamp.

**Section sources**
- [runBundle.ts:15-156](file://src/commands/runBundle.ts#L15-L156)

#### runRepomixOnOpenFiles
- Purpose: Run Repomix on currently open editor files.
- Flow: Collect open files, set include override, call runRepomix with merged config.

**Section sources**
- [runRepomixOnOpenFiles.ts:8-28](file://src/commands/runRepomixOnOpenFiles.ts#L8-L28)

#### runRepomixOnSelectedFiles
- Purpose: Run Repomix on a set of selected URIs with optional include patterns.
- Flow: Compute include patterns per URI (directory expansion with override patterns), optionally log run to DB, then run runRepomix with merged config.

**Section sources**
- [runRepomixOnSelectedFiles.ts:26-100](file://src/commands/runRepomixOnSelectedFiles.ts#L26-L100)

#### copySelectedFilesToClipboard
- Purpose: Copy selected files (or folders expanded) as Markdown to clipboard.
- Flow: Expand URIs to files (limit), compute relative paths, validate safety, generate Markdown (content or via repomix), write to clipboard, show token count.

**Section sources**
- [copySelectedFilesToClipboard.ts:67-147](file://src/commands/copySelectedFilesToClipboard.ts#L67-L147)

#### copySelectedFilesAsCompressed (NEW)
- Purpose: Copy selected files as compressed Markdown to clipboard using AST-based extraction.
- Parameters: extension context, clicked file URI, optional selected files array.
- Flow:
  - Expand URIs to files (up to 50 files limit), validate workspace boundaries.
  - Generate compressed content using generateCompressedMarkdownContent.
  - Handle copy mode: content mode writes directly to clipboard, file mode writes to temp file and uses existing copyToClipboard.
  - Show progress dialog during compression process.
  - Display token count and success notification.
- Compression pipeline: Uses LanguageParser with Tree-Sitter WASM parsers to extract function/class signatures and essential code structures.
- Error handling: Validates file lists, handles binary files gracefully, provides user-friendly error messages.

**New Section** The copySelectedFilesAsCompressed command provides intelligent code compression through AST-based extraction, significantly reducing token count while preserving essential code structures.

```mermaid
flowchart TD
Start(["copySelectedFilesAsCompressed"]) --> Validate["Validate URIs and workspace boundaries"]
Validate --> Expand["Expand URIs to files (max 50)"]
Expand --> Gen["generateCompressedMarkdownContent()"]
Gen --> Parse["compressFile() for each language"]
Parse --> Mode{"Copy mode?"}
Mode --> |content| CopyContent["Write to clipboard"]
Mode --> |file| CopyFile["Write to temp file + copyToClipboard"]
CopyContent --> Notify["Show success with token count"]
CopyFile --> Notify
Notify --> End(["Done"])
```

**Diagram sources**
- [copySelectedFilesAsCompressed.ts:58-170](file://src/commands/copySelectedFilesAsCompressed.ts#L58-L170)
- [compressedMarkdownGenerator.ts:11-58](file://src/core/files/compressedMarkdownGenerator.ts#L11-L58)
- [compressFile.ts:74-133](file://src/core/compression/compressFile.ts#L74-L133)

**Section sources**
- [copySelectedFilesAsCompressed.ts:58-170](file://src/commands/copySelectedFilesAsCompressed.ts#L58-L170)
- [compressedMarkdownGenerator.ts:11-70](file://src/core/files/compressedMarkdownGenerator.ts#L11-L70)
- [compressFile.ts:74-133](file://src/core/compression/compressFile.ts#L74-L133)

#### copyRepomixOutput
- Purpose: Find and copy the Repomix output file to clipboard.
- Flow: Resolve output path from config or defaults, check existence, read content, copy to clipboard, notify.

**Section sources**
- [copyRepomixOutput.ts:18-59](file://src/commands/copyRepomixOutput.ts#L18-L59)

#### testCompression (ENHANCED)
- Purpose: Test compression on the active TypeScript/JavaScript file with interactive options and comprehensive debugging support.
- Parameters: None (uses active editor context).
- Flow:
  - Validate active editor exists and is TypeScript/JavaScript file.
  - Prompt for function/class name to keep fully (optional).
  - Call compressFile with compression options.
  - Open new text document with compressed content beside original.
  - Display error messages for WASM/parser failures.
  - **Enhanced Features**:
    - VS Code debugger integration for step-by-step debugging
    - Programmatic usage examples for automated testing
    - Command-line verification procedures for CI/CD pipelines
    - Comprehensive error handling with detailed failure messages
- Integration: Uses compression system to demonstrate AST-based extraction capabilities.

**Updated** Enhanced testCompression command with VS Code debugger integration, programmatic usage examples, and command-line verification capabilities.

**Section sources**
- [testCompression.ts:1-39](file://src/commands/testCompression.ts#L1-L39)

#### switchLLMProvider (NEW)
- Purpose: Switch the default LLM provider among available options.
- Parameters: None (uses VS Code configuration and LLM provider manager).
- Flow:
  - Get available text generation providers from LLM provider manager.
  - Validate that providers are configured; show warning if none available.
  - Get current default provider and create quick pick items with provider details.
  - Show quick pick with provider capabilities (text, embeddings, structured output).
  - Update VS Code configuration with selected provider ID.
  - Show information message with reload window option.
- Integration: Uses LLM provider manager to discover available providers and capabilities.
- Error handling: Catches and displays errors during provider switching with detailed messages.

**New Section** The switchLLMProvider command provides a user-friendly interface for changing the default LLM provider, displaying provider capabilities and handling configuration updates seamlessly.

```mermaid
flowchart TD
Start(["switchLLMProvider"]) --> GetProviders["Get available text providers"]
GetProviders --> CheckProviders{"Any providers available?"}
CheckProviders --> |No| ShowWarning["Show warning message"]
CheckProviders --> |Yes| GetCurrent["Get current default provider"]
GetCurrent --> CreateItems["Create quick pick items with capabilities"]
CreateItems --> ShowPick["Show quick pick with provider details"]
ShowPick --> Selected{"Provider selected?"}
Selected --> |No| Return["Return (cancelled)"]
Selected --> |Yes| UpdateConfig["Update VS Code configuration"]
UpdateConfig --> ShowMessage["Show information message with reload option"]
ShowMessage --> End(["Done"])
```

**Diagram sources**
- [switchLLMProvider.ts:8-68](file://src/commands/switchLLMProvider.ts#L8-L68)
- [LLMProviderManager.ts:93-105](file://src/core/llm/LLMProviderManager.ts#L93-L105)

**Section sources**
- [switchLLMProvider.ts:8-68](file://src/commands/switchLLMProvider.ts#L8-L68)

#### openSettings
- Purpose: Open VS Code settings filtered to extension settings.

**Section sources**
- [openSettings.ts:3-9](file://src/commands/openSettings.ts#L3-L9)

#### openOutput
- Purpose: Show the extension output channel.

**Section sources**
- [openOutput.ts:3-5](file://src/commands/openOutput.ts#L3-L5)

#### createBundle
- Purpose: Create a new bundle via interactive form and set as active.

**Section sources**
- [createBundle.ts:7-31](file://src/commands/createBundle.ts#L7-L31)

#### editBundle
- Purpose: Edit active bundle metadata and config association.
- Flow: Optionally select active bundle, then present form with edition mode.

**Section sources**
- [editBundle.ts:6-48](file://src/commands/editBundle.ts#L6-L48)

#### deleteBundle
- Purpose: Delete the selected bundle and notify.

**Section sources**
- [deleteBundle.ts:5-8](file://src/commands/deleteBundle.ts#L5-L8)

#### selectActiveBundle
- Purpose: Present a Quick Pick to choose the active bundle.

**Section sources**
- [selectActiveBundle.ts:6-54](file://src/commands/selectActiveBundle.ts#L6-L54)

#### goToConfigFile
- Purpose: Associate a bundle with a repomix config file or create one.
- Flow: Set active bundle, offer to reuse existing config, or create a new one, then open editor.

**Section sources**
- [goToConfigFile.ts:10-69](file://src/commands/goToConfigFile.ts#L10-L69)

#### mutateActiveBundle
- Purpose: Add or remove files from the active bundle with normalization and directory handling.
- Flow: Normalize paths, deduplicate, expand directories, remove subpaths, persist updates.

**Section sources**
- [mutateActiveBundle.ts:15-112](file://src/commands/mutateActiveBundle.ts#L15-L112)

#### utils
- Purpose: Shared UI helpers for bundle forms and config selection.
- Features: Input validation, Quick Pick with current selection, config file discovery.

**Section sources**
- [utils.ts:5-81](file://src/commands/utils.ts#L5-L81)

### User Interaction Patterns
- Input boxes and Quick Picks for names, descriptions, tags, and config selection.
- Progress dialogs for long-running operations (e.g., copy to clipboard, smart agent, compression processing).
- Notifications for success, warnings for partial results, and error dialogs for failures.
- Modal confirmations for destructive actions (e.g., missing file handling in runBundle).
- Git SCM integration: Direct access to repository changes through VS Code's native Git interface.
- Compression testing: Interactive input for specifying which functions/classes to keep fully.
- **LLM Provider Switching**: Quick pick interface for selecting between configured providers with capability details.
- **Enhanced Debugging**: VS Code debugger integration allows for breakpoints, variable inspection, and step-through debugging of compression operations.

**Updated** Added LLM provider switching interaction patterns with capability-based provider selection and enhanced debugging support.

**Section sources**
- [runBundle.ts:109-121](file://src/commands/runBundle.ts#L109-L121)
- [copySelectedFilesToClipboard.ts:119-133](file://src/commands/copySelectedFilesToClipboard.ts#L119-L133)
- [copySelectedFilesAsCompressed.ts:110-127](file://src/commands/copySelectedFilesAsCompressed.ts#L110-L127)
- [switchLLMProvider.ts:24-38](file://src/commands/switchLLMProvider.ts#L24-L38)
- [testCompression.ts:15-18](file://src/commands/testCompression.ts#L15-L18)
- [utils.ts:17-81](file://src/commands/utils.ts#L17-L81)

### Error Handling Strategies
- AbortSignal propagation: runRepomix and runBundle respect AbortSignal to cancel execution gracefully.
- Validation: Output path validation prevents escaping workspace; relative path checks ensure safety.
- User feedback: Errors are logged and surfaced via showErrorMessage; warnings guide users to correct actions.
- Graceful degradation: Missing files in bundles are filtered; empty output files are handled.
- Git error handling: Safe access to Git extension API with fallbacks and user-friendly error messages.
- Compression error handling: Binary file detection, WASM parser failures, and fallback to full content when compression unsupported.
- **LLM Provider Error Handling**: Provider initialization failures, configuration errors, and runtime errors are caught and displayed with detailed messages.
- **Enhanced Error Reporting**: Comprehensive error messages for WASM parser loading failures, language support issues, and Tree-Sitter library validation problems.

**Updated** Added LLM provider error handling patterns for robust provider switching and enhanced debugging capabilities.

**Section sources**
- [runRepomix.ts:141-154](file://src/commands/runRepomix.ts#L141-L154)
- [runBundle.ts:75-82](file://src/commands/runBundle.ts#L75-L82)
- [runBundle.ts:109-121](file://src/commands/runBundle.ts#L109-L121)
- [gitUtils.ts:32-52](file://src/git/gitUtils.ts#L32-L52)
- [compressedMarkdownGenerator.ts:31-47](file://src/core/files/compressedMarkdownGenerator.ts#L31-L47)
- [compressFile.ts:80-83](file://src/core/compression/compressFile.ts#L80-L83)
- [switchLLMProvider.ts:64-68](file://src/commands/switchLLMProvider.ts#L64-L68)

### Progress Reporting
- withProgress: Used for copySelectedFilesToClipboard, copySelectedFilesAsCompressed, and smartRun to show ongoing work and optional cancellation.
- Notifications: Temporary notifications provide immediate feedback for short operations.
- Git feedback: Console logging with change counts for debugging and user awareness.
- Compression progress: Real-time feedback during AST parsing and chunk extraction.
- **LLM Provider Status**: Information messages for provider switching operations.
- **Debugging Progress**: VS Code debugger provides real-time progress monitoring and variable inspection during compression operations.

**Updated** Added LLM provider status reporting for provider switching operations and enhanced debugging support.

**Section sources**
- [copySelectedFilesToClipboard.ts:119-133](file://src/commands/copySelectedFilesToClipboard.ts#L119-L133)
- [copySelectedFilesAsCompressed.ts:110-127](file://src/commands/copySelectedFilesAsCompressed.ts#L110-L127)
- [extension.ts:562-625](file://src/extension.ts#L562-L625)
- [gitUtils.ts:115-121](file://src/git/gitUtils.ts#L115-L121)
- [switchLLMProvider.ts:55-62](file://src/commands/switchLLMProvider.ts#L55-L62)

### Command Chaining Patterns
- editBundle invokes selectActiveBundle when no bundleId is provided.
- runBundle may call selectActiveBundle indirectly via the command registry if no node is passed.
- copySelectedFilesAsCompressed delegates to compression system for file processing.
- testCompression uses compression system for AST-based parsing and extraction.
- switchLLMProvider delegates to LLM provider manager for provider discovery and configuration.
- Git utilities provide seamless integration between SCM interface and clipboard functionality.
- **Compression Chaining**: testCompression integrates with LanguageParser for WASM initialization and compression pipeline execution.
- **LLM Provider Chaining**: Commands can leverage the unified LLM provider system for consistent provider management across the extension.

**Updated** Added LLM provider system command chaining patterns with enhanced debugging integration.

**Section sources**
- [editBundle.ts:13-17](file://src/commands/editBundle.ts#L13-L17)
- [extension.ts:892-892](file://src/extension.ts#L892-L892)
- [extension.ts:919-920](file://src/extension.ts#L919-L920)
- [copySelectedFilesAsCompressed.ts:117-125](file://src/commands/copySelectedFilesAsCompressed.ts#L117-L125)
- [switchLLMProvider.ts:10-18](file://src/commands/switchLLMProvider.ts#L10-L18)
- [testCompression.ts:21-26](file://src/commands/testCompression.ts#L21-L26)

### Conditional Visibility and Dynamic Generation
- Menus define when clauses to control visibility (e.g., view == repomixBundles, explorerResourceIsFolder || resourceLangId, scmProvider == git).
- Command palette entries can be hidden via when: never to prevent direct invocation.
- Dynamic command generation occurs implicitly through Quick Picks and forms (e.g., bundle creation, config selection).
- Git SCM integration uses when clauses to restrict commands to Git repositories.
- New commands: Copy as Compressed Repomix to Clipboard appears in explorer context menu for all file types.
- **LLM Provider Visibility**: The switchLLMProvider command is available in the command palette and can be accessed through the settings interface.

**Updated** Added conditional visibility patterns for new compression commands and LLM provider management.

**Section sources**
- [package.json:515-591](file://package.json#L515-L591)

### Utility Functions Supporting Commands
- bundleForm: Interactive form for bundle metadata and config association.
- askForConfig: Discover and pick repomix config files in the workspace.
- Path utilities: normalize paths, file extensions, and output filename generation.
- Git utilities: Safe Git API access, repository detection, change aggregation, and change counting.
- Compression utilities: Language detection, AST parsing, chunk extraction, and token counting.
- File expansion: Recursive folder traversal with file limit enforcement.
- **LLM Provider Utilities**: Provider discovery, capability checking, and configuration management.
- **Compression Testing Utilities**: Standalone test scripts for programmatic compression testing and validation.

**Updated** Added LLM provider utility functions for provider management and comprehensive testing support.

**Section sources**
- [utils.ts:5-81](file://src/commands/utils.ts#L5-L81)
- [gitUtils.ts:1-122](file://src/git/gitUtils.ts#L1-L122)
- [compressedMarkdownGenerator.ts:11-70](file://src/core/files/compressedMarkdownGenerator.ts#L11-L70)
- [compressFile.ts:6-25](file://src/core/compression/compressFile.ts#L6-L25)
- [copySelectedFilesAsCompressed.ts:14-56](file://src/commands/copySelectedFilesAsCompressed.ts#L14-L56)
- [LLMProviderManager.ts:93-105](file://src/core/llm/LLMProviderManager.ts#L93-L105)

### Implementing Custom Commands and Integrating External Tools
- Pattern:
  - Define a pure function handler with typed dependencies.
  - Inject dependencies for testability (e.g., defaultRunRepomixDeps).
  - Use withProgress for long-running tasks.
  - Validate inputs and report errors via showErrorMessage.
  - Register the command in extension.ts and contribute it in package.json.
  - Integrate with VS Code APIs (e.g., Git SCM) for enhanced UX.
  - Leverage compression system for AST-based file processing.
  - Integrate with VS Code debugger for comprehensive testing and debugging.
  - **Integrate with LLM Provider System**: Use LLM provider manager for provider discovery, capability checking, and execution.
- Example integrations:
  - External tool execution: runRepomix uses npx to invoke repomix.
  - Clipboard operations: copySelectedFilesToClipboard writes Markdown to clipboard.
  - File operations: goToConfigFile creates and opens config files.
  - Git SCM integration: copyAllGitChanges provides quick access to repository changes.
  - Compression system: AST-based file parsing and intelligent code extraction.
  - Interactive testing: testCompression demonstrates compression capabilities with debugger support.
  - **LLM Provider Integration**: switchLLMProvider demonstrates provider switching through the unified management system.
  - **Programmatic Testing**: Dedicated test scripts enable automated compression validation and CI/CD integration.

**Updated** Added LLM provider system integration patterns for enhanced external tool capabilities and comprehensive debugging support.

**Section sources**
- [runRepomix.ts:48-154](file://src/commands/runRepomix.ts#L48-L154)
- [copySelectedFilesToClipboard.ts:67-147](file://src/commands/copySelectedFilesToClipboard.ts#L67-L147)
- [copySelectedFilesAsCompressed.ts:58-170](file://src/commands/copySelectedFilesAsCompressed.ts#L58-L170)
- [switchLLMProvider.ts:8-68](file://src/commands/switchLLMProvider.ts#L8-L68)
- [testCompression.ts:1-39](file://src/commands/testCompression.ts#L1-L39)
- [goToConfigFile.ts:75-113](file://src/commands/goToConfigFile.ts#L75-L113)
- [extension.ts:79-92](file://src/extension.ts#L79-L92)
- [package.json:309-591](file://package.json#L309-L591)
- [gitUtils.ts:1-122](file://src/git/gitUtils.ts#L1-L122)
- [compressFile.ts:74-133](file://src/core/compression/compressFile.ts#L74-L133)
- [LLMProviderManager.ts:13-52](file://src/core/llm/LLMProviderManager.ts#L13-L52)

## Dependency Analysis
The command system exhibits low coupling and high cohesion:
- Commands depend on pure functions and injected dependencies.
- Configuration is centralized and validated before execution.
- Side effects are isolated in shared utilities (logger, notifications, file operations).
- Git utilities provide clean abstraction over VS Code's Git extension API.
- Compression system provides clean abstraction over AST parsing and language-specific extraction.
- LLM provider system provides clean abstraction over multiple AI providers with unified management.
- Command handlers delegate appropriately to minimize complexity.
- **Debugging Infrastructure**: VS Code debugger integration provides comprehensive development and testing support.

```mermaid
graph LR
EXT["extension.ts"] --> R["runRepomix"]
EXT --> RB["runBundle"]
EXT --> ROF["runRepomixOnOpenFiles"]
EXT --> RSF["runRepomixOnSelectedFiles"]
EXT --> CCF["copySelectedFilesToClipboard"]
EXT --> CCS["copySelectedFilesAsCompressed (NEW)"]
EXT --> CRO["copyRepomixOutput"]
EXT --> TC["testCompression (ENHANCED)"]
EXT --> OS["openSettings"]
EXT --> OO["openOutput"]
EXT --> CB["createBundle"]
EXT --> EB["editBundle"]
EXT --> DB["deleteBundle"]
EXT --> SAB["selectActiveBundle"]
EXT --> GCF["goToConfigFile"]
EXT --> MAB["mutateActiveBundle"]
EXT --> SWITCH["switchLLMProvider (NEW)"]
EB --> U["utils"]
CB --> U
GCF --> U
CCF --> GU["gitUtils"]
CCS --> GU
CCS --> CMG["compressedMarkdownGenerator"]
TC --> CF["compressFile"]
TC --> LP["LanguageParser"]
CF --> LP
LPM["LLMProviderManager"] --> OP["OllamaProvider"]
LPM --> LP["LMStudioProvider"]
LPM --> BP["BaseProvider"]
CS["compatibilityShim"] --> LPM
SWITCH --> LPM
```

**Diagram sources**
- [extension.ts:79-92](file://src/extension.ts#L79-L92)
- [utils.ts:5-81](file://src/commands/utils.ts#L5-L81)
- [gitUtils.ts:1-122](file://src/git/gitUtils.ts#L1-L122)
- [copySelectedFilesAsCompressed.ts:58-170](file://src/commands/copySelectedFilesAsCompressed.ts#L58-L170)
- [compressedMarkdownGenerator.ts:11-70](file://src/core/files/compressedMarkdownGenerator.ts#L11-L70)
- [compressFile.ts:74-133](file://src/core/compression/compressFile.ts#L74-L133)
- [LanguageParser.ts:79-93](file://src/core/compression/LanguageParser.ts#L79-L93)
- [LLMProviderManager.ts:13-52](file://src/core/llm/LLMProviderManager.ts#L13-L52)
- [OllamaProvider.ts:18-57](file://src/core/llm/providers/OllamaProvider.ts#L18-L57)
- [LMStudioProvider.ts:19-44](file://src/core/llm/providers/LMStudioProvider.ts#L19-L44)
- [BaseProvider.ts:16-28](file://src/core/llm/providers/BaseProvider.ts#L16-L28)
- [compatibilityShim.ts:28-72](file://src/core/llm/compatibilityShim.ts#L28-L72)
- [switchLLMProvider.ts:8-68](file://src/commands/switchLLMProvider.ts#L8-L68)

**Section sources**
- [extension.ts:79-92](file://src/extension.ts#L79-L92)

## Performance Considerations
- Concurrency and batching:
  - runRepomixOnSelectedFiles computes include patterns efficiently and delegates to runRepomix.
  - Background indexing uses debounced file watching; consider similar patterns for long-running commands.
  - Git utilities cache repository detection results to avoid repeated API calls.
  - Compression system caches Tree-Sitter parsers and language configurations.
  - **WASM Caching**: LanguageParser implements comprehensive caching for WASM parsers and language instances.
  - **LLM Provider Caching**: LLM provider manager caches initialized providers and rate limit queues.
- Resource limits:
  - copySelectedFilesToClipboard caps file expansion to prevent heavy operations.
  - copySelectedFilesAsCompressed enforces 50-file limit to prevent memory issues.
  - Compression system handles binary files gracefully to avoid parsing overhead.
  - Git change aggregation deduplicates URIs to prevent redundant processing.
  - **Memory Management**: Compression operations implement proper memory cleanup and error recovery.
  - **Provider Resource Management**: LLM providers manage their own resource allocation and cleanup.
- Cancellation:
  - Respect AbortSignal to stop long-running tasks promptly.
  - Compression operations can be cancelled during AST parsing.
  - LLM provider operations respect cancellation through the underlying provider implementations.
- Logging:
  - Verbose logging can expose sensitive info; redact before display.
  - Git operations log change counts for debugging without exposing file contents.
  - Compression system logs parsing errors and fallback scenarios.
  - **LLM Provider Logging**: Provider operations log initialization, usage, and error information.
  - **Debug Logging**: Comprehensive logging for debugging and troubleshooting compression issues.

## Troubleshooting Guide
- Command does not appear in palette:
  - Verify contributes.commands and ensure when clauses are appropriate.
  - Check Git SCM integration requires scmProvider == git when clause.
  - Verify compression commands are properly registered in activationEvents.
  - **LLM Provider Issues**: Check that LLM providers are properly configured in settings.
- Permission or path errors:
  - Check output path validation and relative path handling.
  - Validate workspace boundaries for compressed file operations.
  - **LLM Provider Configuration**: Verify provider URLs, API keys, and model settings.
- External tool failures:
  - Review stderr handling and error surfacing.
  - Check WASM parser availability for compression testing.
  - **LLM Provider Connection**: Verify provider connectivity and authentication.
- Missing configuration:
  - Ensure repomix config is present or create via goToConfigFile.
  - Verify compression system has required language support.
  - **LLM Provider Setup**: Ensure at least one LLM provider is configured in settings.
- Long-running operations:
  - Use withProgress and provide cancellation where supported.
  - Monitor compression progress for large files.
  - **LLM Provider Operations**: Monitor provider usage and rate limits.
- Git integration issues:
  - Verify VS Code Git extension is installed and activated.
  - Check that the active editor belongs to a Git repository.
  - Ensure proper when clauses (scmProvider == git) are met.
- Compression issues:
  - Verify file language support (TypeScript/JavaScript/Dart/Python/C#/Rust).
  - Check WASM parser loading and Tree-Sitter library availability.
  - Ensure sufficient memory for AST parsing of large files.
  - **WASM Parser Issues**: Verify WASM files exist in dist/tree-sitter-wasm directory.
  - **Tree-Sitter Library Validation**: Ensure web-tree-sitter is properly installed and accessible.
  - **Debugger Integration**: Use VS Code debugger to step through compression operations and inspect variables.
  - **Programmatic Testing**: Use test-compression.ts and test-compression.js scripts for automated validation.
  - **Diagnostic Tools**: Run diagnose-compression.js to check system health and identify configuration issues.
  - **LLM Provider Issues**: Check provider initialization logs and configuration settings.
  - **Provider Switching Problems**: Verify that the selected provider is properly configured and available.

**Updated** Added comprehensive LLM provider troubleshooting guidance with configuration validation and provider switching diagnostics.

**Section sources**
- [package.json:20-32](file://package.json#L20-L32)
- [runRepomix.ts:75-80](file://src/commands/runRepomix.ts#L75-L80)
- [goToConfigFile.ts:75-113](file://src/commands/goToConfigFile.ts#L75-L113)
- [gitUtils.ts:32-52](file://src/git/gitUtils.ts#L32-L52)
- [copySelectedFilesAsCompressed.ts:136-140](file://src/commands/copySelectedFilesAsCompressed.ts#L136-L140)
- [testCompression.ts:23-26](file://src/commands/testCompression.ts#L23-L26)
- [compressFile.ts:86-93](file://src/core/compression/compressFile.ts#L86-L93)
- [LanguageParser.ts:200-216](file://src/core/compression/LanguageParser.ts#L200-L216)
- [LLMProviderManager.ts:26-52](file://src/core/llm/LLMProviderManager.ts#L26-L52)
- [diagnose-compression.js:1-116](file://scripts/diagnose-compression.js#L1-L116)

## Conclusion
The command system is designed around pure function handlers, explicit dependency injection, robust validation, and consistent user feedback. Commands are centrally registered, conditionally exposed, and integrated with VS Code UI affordances. The architecture supports extension, testing, and safe execution of external tools while maintaining a clear separation of concerns. Recent additions include Git SCM integration that seamlessly bridges VS Code's native Git interface with the extension's clipboard functionality, advanced compression capabilities that provide intelligent code extraction through AST-based parsing, and a unified LLM provider management system that enables seamless provider switching and consistent behavior across the extension. Enhanced debugging support through VS Code debugger integration, comprehensive diagnostic tools, and programmatic testing capabilities enable developers to effectively test, debug, and validate compression operations. The new LLM provider management system provides centralized control over multiple AI providers, enabling users to easily switch between different providers while maintaining consistent functionality throughout the extension.

## Appendices

### Command Reference Summary
- runRepomix: Run on workspace root with merged config.
- runBundle: Run on active bundle files with bundle-specific overrides.
- runOnOpenFiles: Run on open editors.
- runOnSelectedFiles: Run on selected URIs with include patterns.
- copySelectedFilesToClipboard: Copy selected files as Markdown.
- copySelectedFilesAsCompressed (NEW): Copy selected files as compressed Markdown with AST extraction.
- copyRepomixOutput: Copy the Repomix output file to clipboard.
- testCompression (ENHANCED): Test compression on active TypeScript/JavaScript file with interactive options, VS Code debugger integration, and programmatic usage examples.
- openSettings: Open extension settings.
- openOutput: Show output channel.
- createBundle: Create a new bundle.
- editBundle: Edit active bundle metadata and config.
- deleteBundle: Delete a bundle.
- selectActiveBundle: Choose active bundle.
- goToConfigFile: Associate or create a repomix config for a bundle.
- add/remove files to/from active bundle: Manage bundle contents.
- copyAllGitChanges: Copy all changed Git files to clipboard.
- copyFromScm: Adapter for Git SCM context menu to clipboard.
- **switchLLMProvider (NEW)**: Switch the default LLM provider among available options with capability-based selection.

**Updated** Added new commands: copySelectedFilesAsCompressed, testCompression with comprehensive compression system integration and enhanced debugging support, and switchLLMProvider for LLM provider management.

**Section sources**
- [extension.ts:79-92](file://src/extension.ts#L79-L92)
- [package.json:309-591](file://package.json#L309-L591)

### LLM Provider Management
- **Provider Types**: Supports Ollama, LM Studio, OpenRouter, and Gemini providers.
- **Capability System**: Providers declare support for text generation, embeddings, and structured output.
- **Rate Limiting**: Automatic rate limiting queues for all providers.
- **Usage Tracking**: Statistics tracking for provider usage and costs.
- **Configuration**: Centralized configuration through VS Code settings.
- **Switching Interface**: User-friendly quick pick for provider selection.

**Section sources**
- [LLMProviderManager.ts:13-187](file://src/core/llm/LLMProviderManager.ts#L13-L187)
- [OllamaProvider.ts:18-31](file://src/core/llm/providers/OllamaProvider.ts#L18-L31)
- [LMStudioProvider.ts:19-31](file://src/core/llm/providers/LMStudioProvider.ts#L19-L31)
- [switchLLMProvider.ts:8-68](file://src/commands/switchLLMProvider.ts#L8-L68)

### VS Code Debugger Integration
- **Launch Configuration**: Dedicated launch.json configuration for extension development and testing.
- **Breakpoint Support**: Full breakpoint debugging capabilities for compression operations.
- **Variable Inspection**: Real-time variable inspection and evaluation during compression testing.
- **Step-Through Debugging**: Step-by-step execution through compression pipeline for troubleshooting.
- **LLM Provider Debugging**: Debug support for provider initialization and switching operations.
- **Integration Benefits**: Seamless debugging experience for both command execution and compression system operations.

**Section sources**
- [.vscode/launch.json:1-44](file://.vscode/launch.json#L1-L44)
- [extension.ts:83-91](file://src/extension.ts#L83-L91)

### Programmatic Testing Framework
- **Standalone Scripts**: Dedicated test-compression.ts and test-compression.js for automated compression validation.
- **CI/CD Integration**: Command-line verification procedures suitable for continuous integration pipelines.
- **Language Coverage**: Comprehensive testing across TypeScript, JavaScript, Python, Rust, C#, and Dart.
- **Automated Validation**: Scripted testing eliminates manual verification steps and ensures consistent results.
- **LLM Provider Testing**: Automated testing framework for provider configuration and switching.

**Section sources**
- [test-compression.ts:1-515](file://src/test-compression.ts#L1-L515)
- [test-compression.js:1-190](file://scripts/test-compression.js#L1-L190)