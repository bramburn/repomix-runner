#!/usr/bin/env ts-node

/**
 * Test script for enrichment indexing workflow
 * Tests the LangGraph workflow for generating and storing enrichments
 */

import { Pool } from 'pg';
import * as path from 'path';
import { LanguageParser } from './core/compression/LanguageParser';
import type OpenAI from 'openai';
async function main() {
  console.log('🧪 Testing Enrichment Indexing Workflow\n');
  console.log('='.repeat(50));

  // Test 1: Database setup and migration
  console.log('\n📊 Test 1: Database Migration Check');
  console.log('-'.repeat(40));

  try {
    const connectionString = process.env.TEST_DATABASE_URL || 'postgresql://repomix_test:repomix_test_password@localhost:5435/repomix_test';
    const pool = new Pool({ connectionString });

    // Verify code_enrichments table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'code_enrichments'
      ) AS exists
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ code_enrichments table missing');
      console.log('   Creating table...');

      // Create the table
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

      // Create indexes
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_enrichments_file ON code_enrichments(file_path, repo_id);
        CREATE INDEX IF NOT EXISTS idx_enrichments_symbol ON code_enrichments(symbol_name, repo_id);
      `);

      console.log('✅ Table and indexes created successfully');
    } else {
      console.log('✅ code_enrichments table exists');
    }

    await pool.end();
  } catch (error) {
    console.log('❌ Database setup failed:', error instanceof Error ? error.message : String(error));
    return;
  }

  // Test 2: Sample data insertion
  console.log('\n💾 Test 2: Enrichment Storage');
  console.log('-'.repeat(40));

  try {
    const connectionString = process.env.TEST_DATABASE_URL || 'postgresql://repomix_test:repomix_test_password@localhost:5435/repomix_test';
    const pool = new Pool({ connectionString });

    const testData = [
      {
        filePath: '/test/UserService.ts',
        repoId: 'test-repo-1',
        symbolName: 'getUserById',
        symbolType: 'method',
        summary: 'Retrieves a user from the database by their unique identifier, returning null if not found.',
        signature: 'public async getUserById(id: string): Promise<User | null>',
        lineStart: 45,
        lineEnd: 52,
      },
      {
        filePath: '/test/UserService.ts',
        repoId: 'test-repo-1',
        symbolName: 'deleteUser',
        symbolType: 'method',
        summary: 'Permanently removes a user account and associated data from the system.',
        signature: 'public async deleteUser(id: string): Promise<void>',
        lineStart: 78,
        lineEnd: 85,
      },
    ];

    // Insert test data using upsert
    for (const data of testData) {
      await pool.query(
        `INSERT INTO code_enrichments (file_path, repo_id, symbol_name, symbol_type, summary, signature, line_start, line_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (file_path, symbol_name, repo_id) 
         DO UPDATE SET 
           summary = EXCLUDED.summary,
           signature = EXCLUDED.signature,
           line_start = EXCLUDED.line_start,
           line_end = EXCLUDED.line_end,
           updated_at = NOW()`,
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

      console.log(`✅ Stored enrichment for ${data.symbolName}`);
    }

    // Verify data was stored
    const result = await pool.query(
      'SELECT symbol_name, summary, symbol_type FROM code_enrichments WHERE repo_id = $1',
      [testData[0].repoId]
    );

    console.log(`\n📊 Retrieved ${result.rows.length} enrichments:`);
    result.rows.forEach((row: any) => {
      console.log(`  - ${row.symbol_name} (${row.symbol_type}): ${row.summary}`);
    });

    // Cleanup test data
    await pool.query('DELETE FROM code_enrichments WHERE repo_id = $1', [testData[0].repoId]);
    console.log('\n🗑️  Test data cleaned up');

    await pool.end();
  } catch (error) {
    console.log('❌ Storage test failed:', error instanceof Error ? error.message : String(error));
  }

  // Test 3: Symbol extraction integration
  console.log('\n🔍 Test 3: Symbol Extraction Integration');
  console.log('-'.repeat(40));

  try {
    
    const languageParser = LanguageParser.getInstance();
    languageParser.setWasmDirectory(path.resolve('./dist/tree-sitter-wasm'));

    const testCode = `
export class UserService {
  constructor(private db: Database) {}
  
  async getUserById(id: string): Promise<User | null> {
    return this.db.findOne('users', { id });
  }
  
  async deleteUser(id: string): Promise<void> {
    await this.db.delete('users', { id });
  }
  
  private validateEmail(email: string): boolean {
    return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
  }
}
`;

    const parser = await languageParser.getParserForLang('typescript');
    const query = await languageParser.getQueryForLang('typescript');

    if (!parser || !query) {
      console.log('❌ Failed to load TypeScript parser');
      return;
    }

    const tree = parser.parse(testCode);
    const captures = query.captures(tree.rootNode);

    const symbols = captures.map((capture: any) => ({
      name: capture.name,
      type: capture.node.type,
      text: capture.node.text.split('\n')[0].slice(0, 60),
    }));

    console.log(`✅ Extracted ${symbols.length} symbols:`);
    symbols.forEach((s: any) => {
      console.log(`  - ${s.name} (${s.type})`);
    });
  } catch (error) {
    console.log('❌ Symbol extraction failed:', error instanceof Error ? error.message : String(error));
  }

  // Test 4: LLM Summary Generation (REST API - Non-streaming)
  console.log('\n🤖 Test 4: LLM Summary Generation (REST Non-streaming)');
  console.log('-'.repeat(40));

  try {
    // Use actual method implementation instead of just signature
    const methodCode = `async getUserById(id: string): Promise<User | null> {
    return this.db.findOne('users', { id });
  }`;
    
    const prompt = `Summarize what this method does in 5-10 words:\n\`\`\`typescript\n${methodCode}\n\`\`\``;

    console.log('Sending non-streaming request (with full code snippet)...');
    
    const response = await fetch('http://192.168.0.136:8080/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer not-needed',
      },
      body: JSON.stringify({
        model: 'qwen3.5-9b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    
    // Qwen reasoning models put everything in reasoning_content
    const rawOutput = message?.reasoning_content || message?.content || '';
    
    if (rawOutput && rawOutput.trim()) {
      console.log('\n📝 Raw model output (reasoning_content):');
      console.log('---');
      console.log(rawOutput);
      console.log('---\n');
      
      // Extract the final answer from reasoning
      // Look for quoted text near the end (the model's conclusion)
      const quoteMatches = rawOutput.match(/"([^"]+)"/g);
      let extractedSummary = '';
      
      if (quoteMatches && quoteMatches.length > 0) {
        // Take the last quoted string (usually the final answer)
        const lastQuote = quoteMatches[quoteMatches.length - 1];
        extractedSummary = lastQuote ? lastQuote.replace(/^"|"$/g, '') : '';
        
        console.log('✅ Extracted final answer:');
        console.log('   "' + extractedSummary + '"');
      } else {
        console.log('⚠️  Could not extract summary from reasoning');
        console.log('   Using full reasoning as fallback');
        extractedSummary = rawOutput;
      }
      
      // Check finish reason
      if (data.choices[0].finish_reason === 'length') {
        console.log('⚠️  WARNING: Response was truncated');
      }
    } else {
      console.log('⚠️  Empty response from model');
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log('❌ LLM request failed:', errMsg);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Indexing tests complete!\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
