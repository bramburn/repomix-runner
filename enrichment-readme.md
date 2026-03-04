# Enrichment Feature Testing Guide

This guide explains how to test the code enrichment feature which uses LLM to generate summaries for code symbols (functions, methods, classes) and stores them in a database for later injection during compression.

## Quick Start

### 1. Start Test Database

```bash
docker-compose up -d postgres-test
```

This starts PostgreSQL on port 5435 with:
- **Database**: `repomix_test`
- **User**: `repomix_test`
- **Password**: `repomix_test_password`

### 2. Set Environment Variables

Create a `.env` file or export variables:

```bash
export TEST_DATABASE_URL="postgresql://repomix_test:repomix_test_password@localhost:5435/repomix_test"
```

**Note**: No API key needed for local LLM endpoint (already configured to use `http://192.168.0.136:8080/v1`).

### 3. Run Tests

#### Full Test Suite
```bash
npm run test:enrichment
```

This runs three tests:
1. ✅ Database schema verification
2. ✅ Symbol extraction using Tree-sitter
3. ✅ LLM summary generation with Qwen3.5-9B

#### Individual Tests

**Test Indexing Workflow:**
```bash
npm run test:enrichment:index
```

Tests database CRUD operations and symbol extraction integration.

**Test Retrieval & Injection:**
```bash
npm run test:enrichment:retrieve
```

Tests loading enrichments from database and compression injection.

## Test Scripts Overview

| Script | Purpose | What it Tests |
|--------|---------|---------------|
| `test-enrichment.ts` | Main harness | DB schema, symbol extraction, LLM generation |
| `test-enrichment-indexing.ts` | Indexing workflow | Create table, insert/update/query enrichments |
| `test-enrichment-retrieval.ts` | Retrieval | Load enrichments, inject into compressed output |

## Expected Output

### Successful Test Run

```
Testing Code Enrichment Feature

==================================================

Test 1: Database Schema Verification
----------------------------------------
OK: code_enrichments table exists

Table columns:
  - id: uuid (NOT NULL)
  - file_path: text (NOT NULL)
  - repo_id: text (NOT NULL)
  ...

Test 2: Symbol Extraction
----------------------------------------
OK: Extracted 8 symbols from test file

Extracted symbols:
  1. definition.class (class_declaration): export class UserListComponent...
  2. definition.method (method_definition): public deleteUser(id: number)...
  ...

Test 3: LLM Summary Generation (Local)
----------------------------------------
Sending request to local LLM...
OK: Generated summary:
   "Deletes a user from the system by their unique identifier."

==================================================
Test complete!
```

### Common Issues

#### Database Connection Failed
```
FAIL: Database connection - connect ECONNREFUSED
```
**Solution**: Start the test database:
```bash
docker-compose up -d postgres-test
```

#### Symbol Extraction Failed
```
FAIL: Symbol extraction - WASM file not found
```
**Solution**: Install Tree-sitter assets:
```bash
npm run setup:treesitter
```

#### LLM Connection Failed
```
FAIL: LLM summary generation - Request failed with status code 404
```
**Solutions**:
1. Verify LLM endpoint is accessible: `curl http://192.168.0.136:8080/v1/models`
2. Check model name matches: `Qwen3.5-9B`
3. Ensure network connectivity to 192.168.0.136

## Database Schema

The `code_enrichments` table stores generated summaries:

```sql
CREATE TABLE code_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT NOT NULL,
  repo_id TEXT NOT NULL,
  symbol_name TEXT NOT NULL,
  symbol_type TEXT NOT NULL,  -- function|method|class|interface|type
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

## Configuration

### Local LLM Endpoint

Configured in test files:
```typescript
const client = new OpenAI({
  apiKey: 'not-needed',
  baseURL: 'http://192.168.0.136:8080/v1',
});

const response = await client.chat.completions.create({
  model: 'Qwen3.5-9B',
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.3,
  max_tokens: 100,
});
```

### Changing LLM Settings

To use a different endpoint or model, edit:
- `src/test-enrichment.ts` (line ~160)
- `src/test-enrichment-indexing.ts` (if applicable)
- `src/test-enrichment-retrieval.ts` (if applicable)

## Next Steps

After tests pass successfully:

1. ✅ Implement enrichment injection in `compressFile()`
2. ✅ Create LangGraph workflow for batch generation
3. ✅ Add configuration settings to VS Code UI
4. ✅ Integrate with background indexing service

## Cleanup

Stop test database:
```bash
docker-compose down postgres-test
```

Or remove all data:
```bash
docker-compose down -v postgres-test
```
