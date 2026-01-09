# Repomix Runner Plus - Architecture

## Overview

VSCode extension that wraps the [Repomix CLI](https://github.com/yamadashy/repomix) with bundle management, AI-powered file selection, and a React webview UI.

## Tech Stack

- **TypeScript** - Extension source
- **Rust** - Cross-platform clipboard operations (`repomix-clip`)
- **React + Fluent UI** - Webview UI
- **SQLite (sql.js)** - Local persistence
- **LangGraph** - AI workflow orchestration

## Project Structure

```
repomix-runner/
├── src/
│   ├── extension.ts           # Entry point - registers commands & providers
│   ├── agent/                 # AI agent (LangGraph workflow for smart file selection)
│   ├── commands/              # VSCode command handlers (run*, create*, edit*, etc.)
│   ├── config/                # Configuration loading (VSCode settings + .repomix.config.json)
│   ├── core/
│   │   ├── bundles/           # Bundle CRUD + tree view provider
│   │   ├── cli/               # Repomix CLI flag builder
│   │   ├── files/             # File operations (clipboard, temp dir)
│   │   ├── indexing/          # Semantic search (embeddings, Qdrant/Pinecone)
│   │   ├── patching/          # Smart code patching with fuzzy matching
│   │   └── storage/           # SQLite database service
│   ├── shared/                # Shared utilities (logger, exec)
│   ├── types/                 # TypeScript definitions
│   ├── utils/                 # Helper functions
│   └── webview/               # React UI
│       ├── RepomixWebviewProvider.ts
│       ├── App.tsx
│       ├── components/        # React components (BundleTab, SearchTab, etc.)
│       ├── controllers/       # MVC pattern - handle user actions
│       └── services/          # Webview services (execution queue)
├── rust/                      # Rust binary for cross-platform clipboard
│   └── src/main.rs            # Copies files to clipboard (file drop mode)
├── dist/                      # Compiled output (esbuild)
└── scripts/                   # Build scripts
```

## Key Patterns

| Pattern | Usage |
|---------|-------|
| **Command Handlers** | `src/commands/` - Pure functions handling VSCode commands |
| **MVC (Webview)** | `components/` (views) + `controllers/` (logic) + `types/` (models) |
| **Provider Pattern** | `BundleDataProvider`, `RepomixWebviewProvider` |
| **Service Layer** | `core/*/` modules encapsulate business logic |
| **Observer** | VSCode events trigger updates across components |

## Rust Component (`repomix-clip`)

Binary at `rust/src/main.rs` providing cross-platform clipboard operations:

- **Modes:**
  - `repomix-clip <file>` - Copy single file to clipboard
  - `repomix-clip --generate-md --cwd <root> <files...>` - Bundle files as markdown
- **Features:** Directory expansion, .gitignore respect, deduplication
- **Build:** `npm run build:rust` → outputs to `bin/repomix-clip.exe`

### Remote Clipboard Architecture

When working with a remote repository via SSH, the extension uses a hybrid approach:

| Component | File | Purpose |
|-----------|------|---------|
| Remote Detection | `src/core/files/remoteDetection.ts` | Detects SSH remote and determines local OS/arch |
| Clipboard Handler | `src/core/files/remoteClipboardHandler.ts` | Handles base64 decoding and local binary execution |
| Message Types | `src/webview/types/remoteClipboardMessages.ts` | IPC message schemas for remote clipboard |

**Remote Workflow:**

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Remote Detection                                          │
│    - Checks vscode.env.remoteName                          │
│    - Determines local OS/arch                              │
│    - Searches for platform-specific binary                 │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. File Transfer (Remote → Local)                           │
│    - Files read from remote server                         │
│    - Contents encoded as base64                             │
│    - Sent via VSCode IPC to webview                         │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Local Processing (Windows Client)                        │
│    - Webview decodes base64                                │
│    - Writes to temp directory (%TEMP%\repomix-clipboard\)   │
│    - Executes repomix-clipboard-win32-x64.exe               │
│    - Returns success/failure to extension                   │
└─────────────────────────────────────────────────────────────┘
```

**Detection Logic:**

```typescript
// Returns true if SSH remote + binary available
shouldUseLocalBinaryExecution(env: RemoteEnvironment): boolean
  = env.isRemote && env.remoteName === 'ssh' && hasBinaryForPlatform(env.localOs, env.localArch)
```

**Platform-Specific Binaries:**

| Platform | Binary Name | Location |
|----------|-------------|----------|
| Windows | `repomix-clipboard-win32-x64.exe` | `assets/bin/` |
| macOS ARM | `repomix-clipboard-darwin-arm64` | `assets/bin/` |
| Linux x64 | `repomix-clipboard-linux-x64` | `assets/bin/` |

## Webview Architecture

React-based UI (`src/webview/`) with bidirectional VSCode message passing:

- **Tabs:** Bundle, Search, Config, Debug
- **Communication:** `postMessage` ↔ `RepomixWebviewProvider`
- **Styling:** Fluent UI components
- **State Management:** Controller pattern per tab

### Adding New Webview Messages

To add a new message from the webview to the extension host:

1.  **Define Schema:** Add a Zod schema in `src/webview/messageSchemas.ts` (e.g., `export const MyNewCommandSchema = z.object({ command: z.literal('myNewCommand'), ... });`).
2.  **Update Union:** Add the new schema to the `WebviewMessageSchema` discriminated union at the bottom of the file.
3.  **Handle Message:** Update `RepomixWebviewProvider.ts` (or the relevant controller) to handle the new command.

> [!IMPORTANT]
> Failure to update `messageSchemas.ts` will result in TypeScript errors when comparing `message.command` in `RepomixWebviewProvider.ts`, as the type is inferred from the union.

## Core Commands

| Command | Description |
|---------|-------------|
| `repomixRunner.run` | Run repomix on workspace root |
| `repomixRunner.runOnOpenFiles` | Run on currently open files |
| `repomixRunner.runBundle` | Run on specific bundle |
| `repomixRunner.createBundle` | Create new file bundle |
| `repomixRunner.editBundle` | Edit bundle contents |
| `repomixRunner.smartRun` | AI-powered file selection |
| `repomixRunner.copySelectedFilesToClipboard` | Copy files as markdown |

## Build Scripts

- `npm run compile` - Type check + lint + esbuild
- `npm run watch` - Watch mode for development
- `npm run package` - Production build
- `npm run build:rust` - Compile Rust binary
- `npm run package:vsix` - Build .vsix extension

## Data Flow

1. **User Action** → VSCode command triggered
2. **Command Handler** → Core logic in `core/`
3. **Core** → Executes Repomix CLI or calls Rust binary
4. **Result** → Clipboard / File output / Webview update
5. **Webview** → Renders state via `postMessage`
