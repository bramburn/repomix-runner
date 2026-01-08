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

## Webview Architecture

React-based UI (`src/webview/`) with bidirectional VSCode message passing:

- **Tabs:** Bundle, Search, Config, Debug
- **Communication:** `postMessage` ↔ `RepomixWebviewProvider`
- **Styling:** Fluent UI components
- **State Management:** Controller pattern per tab

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
