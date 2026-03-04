# Enrichment Feature Testing Guide

## Quick Start

### Prerequisites
1. PostgreSQL database running
2. Tree-sitter WASM files in `dist/tree-sitter-wasm/` (run `npm run setup:treesitter`)
3. Optional: API key for LLM testing (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)

### Environment Setup

Create a `.env` file or set environment variables:

```bash
export TEST_DATABASE_URL="postgresql://user:password@localhost:5432/repomix_test"
export OPENROUTER_API_KEY="your-api-key-here"  # Optional
```

## Running Tests

### 1. Main Test Harness
Tests database schema, symbol extraction, and LLM summary generation:

```bash
npm run test:enrichment
```

**What it tests:**
- ✅ Database connection and table existence
- ✅ Symbol extraction using Tree-sitter
- ✅ LLM summary generation (if API key provided)

### 2. Indexing Workflow Test
Tests the enrichment storage and LangGraph workflow preparation:

```bash
npm run test:enrichment:index
```

**What it tests:**
- ✅ Database migration and table creation
- ✅ Enrichment CRUD operations (insert, update, query)
- ✅ Symbol extraction integration with compression engine

### 3. Retrieval & Injection Test
Tests loading enrichments and injecting during compression:

```bash
npm run test:enrichment:retrieve
```

**What it tests:**
- ✅ Enrichment retrieval from database
- ✅ Compression without enrichment (baseline)
- ⏭️ Enrichment injection (to be implemented)

## Test Output Examples

### Successful Test Run
```
🧪 Testing Code Enrichment Feature

==================================================

📊 Test 1: Database Schema Verification
----------------------------------------
✅ code_enrichments table exists

Table columns:
  - id: uuid (NOT NULL)
  - file_path: text (NOT NULL)
  - repo_id: text (NOT NULL)
  - symbol_name: text (NOT NULL)
  ...

🔍 Test 2: Symbol Extraction
----------------------------------------
✅ Extracted 8 symbols from test file

Extracted symbols:
  1. definition.class (class_declaration): export class UserListComponent...
  2. definition.method (method_definition): public deleteUser(id: number)...
  ...

🤖 Test 3: LLM Summary Generation
----------------------------------------
✅ Generated summary:
   "Deletes a user from the system by their unique identifier."

==================================================
Test complete!
```

## Troubleshooting

### Database Connection Failed
```
❌ Database connection failed: connect ECONNREFUSED
```
**Solution:** Start PostgreSQL or update `TEST_DATABASE_URL`

### Symbol Extraction Failed
```
❌ Symbol extraction failed: WASM file not found
```
**Solution:** Run `npm run setup:treesitter`

### LLM Test Skipped
```
⚠️  Skipping LLM test - no API key found
```
**Solution:** Set `OPENROUTER_API_KEY` or skip (test still passes)

## Next Steps After Testing

Once tests pass successfully:

1. **Implement enrichment injection** in `src/core/compression/compressFile.ts`
2. **Create LangGraph workflow** in `src/chat/enrichment/graph.ts`
3. **Add configuration settings** to `package.json`
4. **Integrate with background indexing** service

## Database Schema Reference

```sql
CREATE TABLE code_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  symbol_name TEXT NOT NULL,
  symbol_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  signature TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  git_commit TEXT,
  UNIQUE(file_path, symbol_name, repo_id)
);
```

## Customization

### Test Different File Types
Edit test files to include your actual project files:

```typescript
const TEST_FILES = {
  myService: {
    extension: '.ts',
    content: fs.readFileSync('./src/services/MyService.ts', 'utf-8'),
  },
};
```

### Test with Real Repository
```bash
# Point to your actual workspace
export TEST_REPO_PATH="/path/to/your/project"
npm run test:enrichment:index
```
