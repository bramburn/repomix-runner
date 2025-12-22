# Repomix Runner - Architecture Documentation

## Overview

Repomix Runner is a VSCode extension that enhances the Repomix CLI tool with advanced features including AI-powered semantic file selection, bundle management, and an interactive web-based UI. The extension follows a modular architecture that integrates multiple technologies and services.

## Project Structure

```
repomix-runner/
├── src/                          # Main source code
│   ├── extension.ts              # Extension entry point
│   ├── agent/                    # AI agent system
│   │   ├── graph.ts              # LangGraph workflow definition
│   │   ├── nodes.ts              # AI workflow nodes
│   │   ├── state.ts              # Agent state management
│   │   └── tools.ts              # Agent tools
│   ├── commands/                 # VSCode command implementations
│   │   ├── runRepomix.ts         # Main repomix execution
│   │   ├── createBundle.ts       # Bundle creation
│   │   ├── editBundle.ts         # Bundle editing
│   │   └── ...                   # Other command handlers
│   ├── config/                   # Configuration system
│   │   ├── configLoader.ts       # Configuration loading
│   │   ├── configSchema.ts       # Configuration validation
│   │   ├── getCwd.ts             # Working directory resolver
│   │   └── getOpenFiles.ts       # Open files detector
│   ├── core/                     # Core business logic
│   │   ├── bundles/              # Bundle management
│   │   │   ├── bundleManager.ts  # Bundle operations
│   │   │   ├── bundleDataProvider.ts # Tree view provider
│   │   │   └── types.ts          # Bundle type definitions
│   │   ├── files/                # File operations
│   │   │   ├── copyToClipboard.ts
│   │   │   ├── tempDirManager.ts
│   │   │   └── ...
│   │   ├── cli/                  # CLI integration
│   │   │   └── cliFlagsBuilder.ts
│   │   ├── indexing/             # Semantic search & indexing
│   │   │   ├── repoIndexer.ts    # Main indexer
│   │   │   ├── embeddingService.ts # Text embeddings
│   │   │   ├── pineconeService.ts # Vector database
│   │   │   ├── textChunker.ts    # Text processing
│   │   │   └── ...
│   │   └── storage/              # Data persistence
│   │       └── databaseService.ts # SQLite database
│   ├── shared/                   # Shared utilities
│   │   ├── logger.ts             # Logging system
│   │   ├── execPromisify.ts      # Process execution
│   │   └── files.ts              # File utilities
│   ├── types/                    # TypeScript type definitions
│   ├── utils/                    # Utility functions
│   │   ├── deepMerge.ts          # Object merging
│   │   ├── pathValidation.ts     # Path utilities
│   │   └── ...
│   └── webview/                  # React-based UI
│       ├── RepomixWebviewProvider.ts
│       ├── index.tsx
│       ├── App.tsx
│       ├── components/           # React components
│       │   ├── BundleTab.tsx
│       │   ├── SearchTab.tsx
│       │   └── ...
│       ├── controllers/          # MVC controllers
│       │   ├── BundleController.ts
│       │   ├── AgentController.ts
│       │   └── ...
│       └── services/             # Webview services
│           ├── ExecutionQueueManager.ts
│           └── ...
├── assets/                       # Static assets
├── bin/                          # Distribution files
├── dist/                         # Compiled output
├── out/                          # TypeScript output
├── rust/                         # Rust components (optional)
└── verification/                 # Verification scripts
```

## Core Modules

### 1. Extension Entry Point (`src/extension.ts`)

The main extension lifecycle manager that:
- Activates the extension on VSCode startup
- Registers all VSCode commands
- Initializes the bundle tree view
- Sets up the database service
- Creates webview providers
- Manages the smart agent integration

### 2. Bundle System (`src/core/bundles/`)

Manages file bundles for the Repomix tool:
- **BundleManager**: Core bundle operations (create, read, update, delete)
- **BundleDataProvider**: VSCode tree view data provider
- **BundleFileDecorationProvider**: Visual indicators for bundled files

### 3. AI Agent System (`src/agent/`)

Implements AI-powered semantic file selection:
- **LangGraph Workflow**: State machine for file selection process
- **Tools**: File system operations, pattern matching, content analysis
- **State Management**: Tracks agent decisions and context

### 4. Semantic Search & Indexing (`src/core/indexing/`)

Provides semantic search capabilities:
- **Vector Embeddings**: Converts code/text to vector representations
- **Pinecone Integration**: Stores and searches vectors in Pinecone
- **Text Chunking**: Splits large files into searchable chunks
- **Repository Indexing**: Processes entire repositories for search

### 5. Webview UI (`src/webview/`)

React-based control panel with tabs for:
- **Bundle Tab**: Manage and execute bundles
- **Agent Tab**: Configure and run AI file selection
- **Config Tab**: View and edit configuration
- **Debug Tab**: View execution logs and debug info
- **Search Tab**: Semantic search interface

### 6. Database Service (`src/core/storage/`)

SQLite database for persistent storage:
- Agent execution history
- Debug run tracking
- Repository file indices
- Bundle metadata

### 7. Configuration System (`src/config/`)

Hierarchical configuration management:
- VSCode settings
- Project-level `repomix.config.json`
- Default configurations
- Schema validation

## Architecture Patterns

### 1. Multi-Layer Architecture

```
┌─────────────────────────────────────┐
│         Presentation Layer          │  ← VSCode UI, Webview
├─────────────────────────────────────┤
│          Command Layer              │  ← VSCode Commands
├─────────────────────────────────────┤
│         Business Logic Layer        │  ← Core Modules
├─────────────────────────────────────┤
│          Data Layer                 │  ← Database, File System
├─────────────────────────────────────┤
│      External Integrations          │  ← Repomix CLI, Pinecone
└─────────────────────────────────────┘
```

### 2. MVC Pattern (Webview)

- **Models**: Data structures and types
- **Views**: React components
- **Controllers**: Handle user actions and coordinate with models

### 3. Observer Pattern

- VSCode events trigger updates across components
- Webview messages use publish-subscribe pattern
- Database changes notify relevant components

### 4. Strategy Pattern

- Different output styles (plain, markdown, XML)
- Various configuration sources
- Multiple indexing strategies

## Data Flow

### 1. Bundle Creation Flow

```
User selects files → BundleManager creates bundle →
Bundle stored in file system → Tree view updated →
File decorations applied
```

### 2. AI Agent Execution Flow

```
User query → LangGraph workflow → Sequential node execution →
Tool calls (file operations) → File selection results →
Bundle creation or Repomix execution
```

### 3. Semantic Search Flow

```
Repository indexing → Text chunking → Embedding generation →
Vector storage in Pinecone → User query → Vector similarity search →
Ranked results returned
```

### 4. Webview Communication

```
Webview UI → PostMessage → Controller → Extension API →
Core Logic → Results → PostMessage → Webview UI update
```

## Key Technologies

- **VSCode Extension API**: Extension platform integration
- **React & Fluent UI**: Webview user interface
- **TypeScript**: Type-safe development
- **SQLite**: Local data persistence
- **LangGraph**: AI workflow orchestration
- **Pinecone**: Vector database for semantic search
- **Node.js**: Runtime environment

## Integration Points

### 1. VSCode API Integration
- Commands registration
- Tree views
- File decorations
- Context menus
- Status bar items

### 2. Repomix CLI Integration
- Command construction
- Execution management
- Output handling
- Clipboard integration

### 3. External Services
- Pinecone: Vector database operations
- Google AI: Embedding generation
- GitHub: Remote repository operations

## Security Considerations

1. **Path Validation**: Prevent directory traversal attacks
2. **Command Injection**: Sanitize CLI arguments
3. **Data Redaction**: Remove sensitive info from configs
4. **API Keys**: Secure storage of external service keys

## Performance Optimizations

1. **Lazy Loading**: Load modules on demand
2. **Caching**: Cache embeddings and search results
3. **Background Processing**: Index large repositories asynchronously
4. **Debouncing**: Prevent excessive API calls

## Testing Strategy

- Unit tests for core modules
- Integration tests for command flows
- E2E tests for webview interactions
- Mock external services for reliable testing

## Future Extensibility

The architecture supports adding:
- New AI providers (OpenAI, Anthropic, etc.)
- Additional vector databases
- Custom output formats
- New UI components and tabs
- Additional search algorithms
- Plugin system for custom tools