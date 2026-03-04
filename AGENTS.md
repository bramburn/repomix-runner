# Repository Guidelines

## Project Structure & Module Organization
- `src/extension.ts` is the extension entrypoint.
- `src/commands/` contains VS Code command handlers.
- `src/core/` holds core services (bundles, files, indexing, storage, patching, compression).
- `src/chat/` contains the HITL chat workflow (graph, nodes, queue, batch, compression, architecture, db).
- `src/webview/` contains the React-based control panel (`components/`, `controllers/`, `handlers/`).
- `src/agent/` contains the smart repomix graph used by command + webview agent flows.
- `src/test/` contains automated tests; `src/test/test-workspace/` provides fixture files.
- `assets/` stores icons/media and Tree-sitter assets; `scripts/` contains packaging/setup utilities.
- `rust/` contains the optional Rust binary build used by packaging workflows.

## Build, Test, and Development Commands
- `npm run watch`: run esbuild + TypeScript watch mode for local development.
- `npm run compile`: type-check, lint, and build to `dist/`.
- `npm run package`: production build for extension packaging.
- `npm run test`: run VS Code extension tests (`vscode-test`).
- `npm run lint`: run ESLint on `src/`.
- `npm run check-types`: run TypeScript checks without emitting files.
- `npm run package:vsix`: create a `.vsix` in `bin/`.
- `npm run build:rust`: build the Rust helper binary when needed.
- `npm run test:compression`: run compression diagnostic test harness.
- `npm run diagnose:compression`: run parser/wasm compression diagnostics.

## AST Compression Utility
- Core module: `src/core/compression/` (separate from indexing tree-sitter logic).
- API entrypoints: `compressFile(...)`, `compressFileWithTokens(...)`, `isSupportedExtension(...)` from `src/core/compression/index.ts`.
- Supported now: TypeScript/JavaScript (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`), Dart (`.dart`), Python (`.py`), C# (`.cs`), Rust (`.rs`).
- Output: AST-derived code skeleton with body replacement; returns `null` on unsupported language or parser/WASM failure.
- `CompressionOptions.keepNames` preserves full source for selected symbols while compressing everything else.
- WASM lookup order: configured parser path, `dist/tree-sitter-wasm/`, then `assets/tree-sitter-wasm/`.
- Manual verification command: run `Repomix: Test Compression` (`repomixRunner.testCompression`) on the active editor file to open compressed output beside the source.

## AI Chat & HITL Workflow
- Main graph: `createHitlChatGraph(...)` in `src/chat/graph.ts`.
- Flow includes: context gathering, compression, goal review, package approval, batch submission/polling, edit review, apply, optional review loop, summary, memory extraction.
- Queue and lifecycle: `src/chat/queue/*` and webview queue commands (`chatSubmit`, `chatForceSubmit`, `chatStop`, `chatClearQueue`, etc.).
- Persistence: PostgreSQL-backed thread/memory/batch/architecture storage in `src/chat/db/*`.

## Coding Style & Naming Conventions
- Language: TypeScript with React for webview UI.
- Formatting: Prettier (`.prettierrc`) with 2-space indentation, single quotes, semicolons, 100-char line width.
- Linting: ESLint (`eslint.config.mjs`); follow `eqeqeq`, `curly`, and no throw-literal warnings.
- Naming: use `camelCase` for variables/functions, `PascalCase` for classes/components, descriptive file names (for example, `BundleController.ts`, `repoIndexer.ts`).

## Testing Guidelines
- Framework stack: Mocha + `@vscode/test-electron` (`vscode-test` command).
- Keep tests under `src/test/**` and name files `*.test.ts`.
- Prefer focused unit tests near feature areas (chat compression, queue, batch parsing, architecture, message schemas).
- Before opening a PR, run: `npm run check-types && npm run lint && npm run test`.

## Commit & Pull Request Guidelines
- Follow Conventional Commit style seen in history: `feat(scope): ...`, `fix: ...`, `docs(...): ...`, `refactor: ...`.
- Keep commits focused and logically grouped; avoid mixing refactors with behavior changes.
- PRs should include: concise description, linked issue (if applicable), testing notes, and screenshots/GIFs for webview or UX changes.
- If packaging/version changes are included, mention resulting artifact changes explicitly.

## Tools Available

### ast-grep (sg)
A CLI tool for code structural search, lint, and rewrite across many languages.

**Installation:** `brew install ast-grep`

**When to use:**
- Search for code patterns using AST matching (not just text search)
- Find specific code structures like function calls, class definitions, imports
- Refactor code patterns across multiple files
- Lint for specific code patterns

**Common Commands:**
- `sg -p 'console.log($ARGS)'` - Find all console.log calls
- `sg -p 'import $NAME from "lodash"'` - Find lodash imports
- `sg -p 'function $NAME($$$ARGS) { $$$BODY }'` - Match function patterns
- `sg -p '$A && $A()' -l ts` - Find redundant logical AND in TypeScript
- `sg scan --rule rule.yml` - Run a rule file

**Key Flags:**
- `-p` or `--pattern`: Pattern to search
- `-l` or `--lang`: Language filter (ts, js, python, etc.)
- `-r` or `--rewrite`: Rewrite matched code
- `-i` or `--interactive`: Interactive mode
- `--json`: Output as JSON for parsing

**Pattern Syntax:**
- `$VAR` - Meta variable (matches any single node)
- `$$$VAR` - Multi-meta variable (matches multiple nodes)
- Use concrete syntax for the language you're searching

---

## Adding New Settings Configuration

When adding new configuration options that appear in the Settings UI, you **MUST** update these files:

### 1. **package.json** - Register Configuration Schema (REQUIRED)

All settings must be registered in the `contributes.configuration.properties` section of `package.json`. This is the most critical step and is often missed!

**Location:** Lines ~250-320 (Embedding section example)

**Example: Adding OpenRouter Settings**
```json
{
  "contributes": {
    "configuration": [
      {
        "title": "Embedding",
        "order": 7,
        "properties": {
          // Provider enum
          "repomix.embedding.provider": {
            "order": 1,
            "type": "string",
            "enum": ["gemini", "ollama", "lmstudio", "openrouter"],  // ✅ Add new provider here
            "default": "gemini",
            "description": "🤖 \n Embedding provider to use"
          },
          
          // Provider-specific settings
          "repomix.openrouter.baseUrl": {
            "order": 9,
            "type": "string",
            "default": "https://openrouter.ai/api/v1",
            "description": "🌐 \n OpenRouter API base URL"
          },
          "repomix.openrouter.model": {
            "order": 10,
            "type": "string",
            "default": "qwen/qwen3-embedding-8b",
            "description": "📦 \n OpenRouter embedding model name"
          },
          "repomix.openrouter.dimension": {
            "order": 11,
            "type": "number",
            "default": 4096,
            "description": "📏 \n OpenRouter embedding dimension size"
          }
        }
      }
    ]
  }
}
```

**⚠️ Common Mistake:** Skipping this step causes runtime error:
```
Unable to write to User Settings because repomix.openrouter.baseUrl is not a registered configuration.
```

### 2. **src/webview/messageSchemas.ts** - Define Message Schemas

Add Zod schemas for type-safe webview-to-extension communication:

```typescript
// Request schema
export const FetchOpenRouterModelsSchema = z.object({
  command: z.literal('fetchOpenRouterModels'),
});

// Result schema
export const OpenRouterModelsResultSchema = z.object({
  command: z.literal('openrouterModelsResult'),
  models: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    context_length: z.number().optional()
  })),
  error: z.string().optional(),
});

// Add to WebviewMessageSchema union
z.discriminatedUnion('command', [
  FetchOpenRouterModelsSchema,
  OpenRouterModelsResultSchema,
  // ... other schemas
])
```

### 3. **src/webview/controllers/ConfigController.ts** - Implement Handlers

Add message handlers and helper methods:

```typescript
// Add secret key constant if storing API keys
const SECRET_OPENROUTER = 'repomix.embedding.openrouterApiKey';
type SecretKey = 'googleApiKey' | 'pineconeApiKey' | 'qdrantApiKey' | 'anthropicApiKey' | 'openrouterApiKey';

// In handleMessage():
case 'fetchOpenRouterModels':
  await this.handleFetchOpenRouterModels();
  return true;

// Handler implementation
private async handleFetchOpenRouterModels() {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    const data = await response.json();
    
    this.context.postMessage({
      command: 'openrouterModelsResult',
      models: data.data.map((m: any) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        context_length: m.context_length
      }))
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.context.postMessage({
      command: 'openrouterModelsResult',
      models: [],
      error: errorMessage
    });
  }
}
```

### 4. **src/webview/components/SettingsTab.tsx** - Add UI Components

**State Variables:**
```typescript
const [openrouterBaseUrl, setOpenrouterBaseUrl] = useState('https://openrouter.ai/api/v1');
const [openrouterModel, setOpenrouterModel] = useState('qwen/qwen3-embedding-8b');
const [openrouterDimension, setOpenrouterDimension] = useState(4096);
const [openrouterModels, setOpenrouterModels] = useState<Array<{ id: string; name?: string }>>([]);
const [isFetchingOpenRouterModels, setIsFetchingOpenRouterModels] = useState(false);
```

**Message Handlers:**
```typescript
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    const message = event.data;
    switch (message.command) {
      case 'openrouterModelsResult':
        setOpenrouterModels(message.models || []);
        if (message.error) {
          vscode.postMessage({
            command: 'showNotification',
            type: 'error',
            message: `Failed to fetch models: ${message.error}`,
          });
        }
        break;
    }
  };
}, []);
```

**Handler Functions:**
```typescript
const handleFetchOpenRouterModels = () => {
  setIsFetchingOpenRouterModels(true);
  vscode.postMessage({ command: 'fetchOpenRouterModels' });
};

const handleOpenRouterModelSelect = (_e: any, data: any) => {
  const modelName = data.optionValue as string;
  setOpenrouterModel(modelName);
};
```

**UI Component (Accordion):**
```typescript
<Accordion>
  <AccordionHeader>
    OpenRouter Configuration
  </AccordionHeader>
  <AccordionPanel>
    <div>
      <Label size="small">Base URL</Label>
      <Input
        value={openrouterBaseUrl}
        onChange={(_e, data) => setOpenrouterBaseUrl(data.value)}
      />
    </div>
    
    <div>
      <Label size="small">Model</Label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <Dropdown value={openrouterModel} onOptionSelect={handleOpenRouterModelSelect}>
          {openrouterModels.map(model => (
            <Option key={model.id} value={model.id}>{model.name || model.id}</Option>
          ))}
        </Dropdown>
        <Button onClick={handleFetchOpenRouterModels} disabled={isFetchingOpenRouterModels}>
          {isFetchingOpenRouterModels ? 'Fetching...' : 'Fetch Models'}
        </Button>
      </div>
    </div>
  </AccordionPanel>
</Accordion>
```

### 5. **Core Service Implementation** (If Applicable)

For provider-based features (like embeddings), implement the core logic:

**Create Provider Class:**
```typescript
// src/core/indexing/embeddings/OpenRouterProvider.ts
export class OpenRouterProvider implements IEmbeddingProvider {
  private client: OpenRouter;
  private config: OpenRouterProviderConfig;

  constructor(config: OpenRouterProviderConfig) {
    this.client = new OpenRouter({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
  }

  async embedText(text: string): Promise<number[]> {
    const response = await this.client.embeddings.generate({
      model: this.config.model,
      input: text,
      encodingFormat: 'float',
    });
    return response.data[0].embedding;
  }
}
```

**Register in Service:**
```typescript
// src/core/indexing/embeddingService.ts
switchProvider(config.provider) {
  switch (config.provider) {
    case 'openrouter':
      if (!config.openrouter) {
        throw new Error('OpenRouter config missing');
      }
      this.provider = new OpenRouterProvider(config.openrouter);
      break;
  }
}
```

---

## Checklist: Adding New Settings

When adding new configuration options, verify ALL of these are updated:

- [ ] **package.json**: Added configuration properties to `contributes.configuration.properties`
- [ ] **package.json**: Updated enum values if adding to existing dropdown (e.g., provider list)
- [ ] **messageSchemas.ts**: Added request/result Zod schemas
- [ ] **messageSchemas.ts**: Registered schemas in `WebviewMessageSchema` union
- [ ] **ConfigController.ts**: Added message handler cases
- [ ] **ConfigController.ts**: Implemented handler methods
- [ ] **ConfigController.ts**: Added secret storage constants (if storing API keys)
- [ ] **SettingsTab.tsx**: Added state variables
- [ ] **SettingsTab.tsx**: Added message handlers in useEffect
- [ ] **SettingsTab.tsx**: Added handler functions
- [ ] **SettingsTab.tsx**: Added UI components (Accordion, Input, Dropdown, etc.)
- [ ] **Core services**: Implemented business logic (if applicable)
- [ ] **Testing**: Verified connection/test functionality works

**⚠️ Critical:** The package.json registration step is MANDATORY. VS Code will reject any configuration writes for unregistered properties with:
```
Unable to write to User Settings because <property> is not a registered configuration.
```

---
