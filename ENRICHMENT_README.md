# Code Enrichment Feature

The code enrichment feature enhances compressed code output by injecting AI-generated summaries for functions, methods, classes, and other symbols. This helps users understand what code does without reading the full implementation.

## How It Works

1. **Toggle Enrichment**: Enable it in the Settings UI (General Settings section)
2. **Select Provider**: Choose your LLM provider (Gemini, Ollama, LM Studio, OpenRouter)
3. **Generate Enrichments**: Run the CLI script to generate summaries for your code
4. **Compression Integration**: When compression runs with enrichment enabled, summaries are injected as comments

## Quick Start

### 1. Enable in Settings

Open the Repomix Runner Control Panel and navigate to General Settings:
- Toggle "Enable code enrichment during compression" to ON
- Select your preferred LLM provider
- Click Save

### 2. Generate Enrichments

Run the enrichment script to generate summaries for your codebase:

```bash
# Basic usage - processes src/ directory
npm run enrich:repo -- my-repo

# Custom file pattern
npm run enrich:repo -- my-repo "src/**/*.ts"

# Use a different provider
npm run enrich:repo -- my-repo "src/**/*.ts" --provider ollama --base-url http://localhost:11434

# Dry run - shows what would be enriched without making changes
npm run enrich:repo -- my-repo --dry-run
```

Required environment variable:
```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/repo"
```

### 3. Use in Compression

When you run any Repomix command with compression enabled, the enrichment summaries will be automatically injected into the output.

## Configuration

### VS Code Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `repomix.enrichment.enabled` | Toggle enrichment on/off | `false` |
| `repomix.enrichment.llmProvider` | LLM provider to use | `gemini` |

### Supported Providers

- **Gemini** - Uses Google Gemini API (requires API key)
- **Ollama** - Local LLM (e.g., http://localhost:11434)
- **LM Studio** - Local LLM (e.g., http://localhost:1234/v1)
- **OpenRouter** - Multi-provider API aggregator

## Architecture

### Key Files

- `src/core/indexing/enrichmentRepository.ts` - Database operations
- `src/core/indexing/enrichmentLLMService.ts` - LLM integration
- `src/core/compression/compressFile.ts` - Enrichment injection during compression

### Database Schema

The `code_enrichments` table stores:

```sql
- file_path: Source file path
- repo_id: Repository identifier
- symbol_name: Function/method/class name
- symbol_type: Type (function, method, class, interface, type)
- summary: AI-generated description
- signature: Full function signature
- line_start, line_end: Source line numbers
- git_commit: Commit hash for cache invalidation
```

## Testing

Run the enrichment test scripts:

```bash
# Test indexing workflow
npm run test:enrichment:index

# Test retrieval workflow
npm run test:enrichment:retrieve

# Test full enrichment
npm run test:enrichment
```

## Troubleshooting

### No enrichments appearing in output

1. Ensure `repomix.enrichment.enabled` is set to `true`
2. Run `npm run enrich:repo -- <repo-id>` to generate summaries
3. Verify database connection is working

### Database errors

Make sure PostgreSQL is running and `DATABASE_URL` is set correctly:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/db npm run enrich:repo -- my-repo
```

### LLM provider errors

Check that your provider is properly configured:
- Gemini: Ensure API key is set
- Ollama/LM Studio: Ensure the server is running
- OpenRouter: Ensure API key is set and account has credits
