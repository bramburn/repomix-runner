#!/usr/bin/env ts-node

/**
 * Test script for enrichment retrieval and injection during compression
 * Tests loading enrichments from DB and injecting them into compressed output
 */

import { Pool } from 'pg';
import * as path from 'path';

async function main() {
  console.log('🧪 Testing Enrichment Retrieval & Injection\n');
  console.log('='.repeat(50));

  // Test 1: Setup test data
  console.log('\n📊 Test 1: Setting up test enrichments');
  console.log('-'.repeat(40));

  try {
    const connectionString = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/repomix_test';
    const pool = new Pool({ connectionString });

    // Ensure table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS code_enrichments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        file_path TEXT NOT NULL,
        repo_id TEXT NOT NULL,
        symbol_name TEXT NOT NULL,
        symbol_type TEXT NOT NULL CHECK (symbol_type IN ('function', 'method', 'class', 'interface', 'type')),
        summary TEXT NOT NULL,
        signature TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        git_commit TEXT,
        UNIQUE(file_path, symbol_name, repo_id)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_enrichments_file ON code_enrichments(file_path, repo_id);
    `);

    // Insert test enrichments
    const testData = [
      {
        filePath: '/workspace/src/services/UserService.ts',
        repoId: 'test-repo',
        symbolName: 'getUserById',
        symbolType: 'method',
        summary: 'Fetches a user by ID with automatic caching and null handling',
        signature: 'public async getUserById(id: string): Promise<User | null>',
        lineStart: 25,
        lineEnd: 32,
      },
      {
        filePath: '/workspace/src/services/UserService.ts',
        repoId: 'test-repo',
        symbolName: 'deleteUser',
        symbolType: 'method',
        summary: 'Permanently deletes user and cascades to related entities',
        signature: 'public async deleteUser(id: string): Promise<void>',
        lineStart: 45,
        lineEnd: 52,
      },
      {
        filePath: '/workspace/src/services/UserService.ts',
        repoId: 'test-repo',
        symbolName: 'validateEmail',
        symbolType: 'method',
        summary: 'Validates email format using RFC 5322 compliant regex',
        signature: 'private validateEmail(email: string): boolean',
        lineStart: 67,
        lineEnd: 70,
      },
    ];

    for (const data of testData) {
      await pool.query(
        `INSERT INTO code_enrichments (file_path, repo_id, symbol_name, symbol_type, summary, signature, line_start, line_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (file_path, symbol_name, repo_id) 
         DO UPDATE SET summary = EXCLUDED.summary`,
        [
          data.filePath,
          data.repoId,
          data.symbolName,
          data.symbolType,
          data.summary,
          data.signature,
          data.lineStart,
          data.lineEnd,
        ]
      );
    }

    console.log(`✅ Inserted ${testData.length} test enrichments`);
    await pool.end();
  } catch (error) {
    console.log('❌ Setup failed:', error instanceof Error ? error.message : String(error));
    return;
  }

  // Test 2: Retrieve enrichments for a file
  console.log('\n🔍 Test 2: Retrieving enrichments from database');
  console.log('-'.repeat(40));

  try {
    const connectionString = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/repomix_test';
    const pool = new Pool({ connectionString });

    const result = await pool.query(
      `SELECT symbol_name, symbol_type, summary, signature, line_start, line_end
       FROM code_enrichments
       WHERE file_path = $1 AND repo_id = $2
       ORDER BY line_start`,
      ['/workspace/src/services/UserService.ts', 'test-repo']
    );

    console.log(`✅ Retrieved ${result.rows.length} enrichments:`);
    result.rows.forEach((row: any, i: number) => {
      console.log(`\n  ${i + 1}. ${row.symbol_name} (${row.symbol_type})`);
      console.log(`     Signature: ${row.signature}`);
      console.log(`     Summary: ${row.summary}`);
      console.log(`     Lines: ${row.line_start}-${row.line_end}`);
    });

    await pool.end();
  } catch (error) {
    console.log('❌ Retrieval failed:', error instanceof Error ? error.message : String(error));
  }

  // Test 3: Compression with enrichment injection
  console.log('\n💉 Test 3: Enrichment injection during compression');
  console.log('-'.repeat(40));

  try {
    const testCode = `import { Database } from '../db/Database';

interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  constructor(private db: Database) {}
  
  public async getUserById(id: string): Promise<User | null> {
    const user = await this.db.findOne('users', { id });
    if (!user) {
      return null;
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  }
  
  public async deleteUser(id: string): Promise<void> {
    await this.db.delete('users', { id });
    await this.db.delete('user_preferences', { userId: id });
  }
  
  private validateEmail(email: string): boolean {
    const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return regex.test(email);
  }
}`;

    const { compressFile } = await import('./core/compression/compressFile.js');
    const { LanguageParser } = await import('./core/compression/LanguageParser.js');

    // Setup parser
    const languageParser = LanguageParser.getInstance();
    languageParser.setWasmDirectory(path.resolve('./dist/tree-sitter-wasm'));

    // Test without enrichment
    console.log('\n📝 Compressing WITHOUT enrichment:');
    const compressedWithout = await compressFile('/workspace/src/services/UserService.ts', testCode);

    if (compressedWithout) {
      console.log('Compressed output:');
      console.log('-'.repeat(40));
      console.log(compressedWithout);
      console.log('-'.repeat(40));
    } else {
      console.log('❌ Compression returned null');
    }

    // TODO: Test with enrichment once injection is implemented
    console.log('\n⏭️  Enrichment injection not yet implemented in compressFile()');
    console.log('   This will be added in the integration phase');

  } catch (error) {
    console.log('❌ Compression test failed:', error instanceof Error ? error.message : String(error));
  }

  // Test 4: Cleanup
  console.log('\n🗑️  Test 4: Cleaning up test data');
  console.log('-'.repeat(40));

  try {
    const connectionString = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/repomix_test';
    const pool = new Pool({ connectionString });

    await pool.query('DELETE FROM code_enrichments WHERE repo_id = $1', ['test-repo']);
    console.log('✅ Test data cleaned up');

    await pool.end();
  } catch (error) {
    console.log('❌ Cleanup failed:', error instanceof Error ? error.message : String(error));
  }

  console.log('\n' + '='.repeat(50));
  console.log('Retrieval tests complete!\n');
  console.log('Next steps:');
  console.log('1. Implement enrichment injection in compressFile()');
  console.log('2. Add enableEnrichment option to CompressionOptions');
  console.log('3. Create LangGraph workflow for batch enrichment generation\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
