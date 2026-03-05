#!/usr/bin/env tsx

/**
 * Standalone test script for code enrichment feature
 * Tests the enrichment generation workflow and database storage
 */

import * as path from 'path';
import { Pool } from 'pg';
import { LanguageParser } from './core/compression/LanguageParser.js';

// Sample test files for enrichment testing
const TEST_FILES = {
  typescript: {
    extension: '.ts',
    content: `import { Component } from '@angular/core';
import { Observable } from 'rxjs';

interface User {
  id: number;
  name: string;
  email: string;
}

@Component({
  selector: 'app-user-list',
  templateUrl: './user-list.component.html'
})
export class UserListComponent {
  users$: Observable<User[]>;
  
  constructor(private userService: UserService) {
    this.users$ = this.userService.getUsers();
  }
  
  ngOnInit(): void {
    console.log('Component initialized');
    this.fetchUserData();
  }
  
  private fetchUserData(): void {
    // Implementation here
    this.users$.subscribe(users => {
      console.log('Users loaded:', users);
    });
  }
  
  public deleteUser(id: number): void {
    this.userService.deleteUser(id).subscribe(() => {
      console.log('User deleted:', id);
    });
  }
  
  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}`,
  },
};

async function main() {
  console.log('Testing Code Enrichment Feature\n');
  console.log('='.repeat(50));

  // Test 1: Database connection and schema
  console.log('\nTest 1: Database Schema Verification');
  console.log('-'.repeat(40));

  try {
    const connectionString = process.env.TEST_DATABASE_URL || 'postgresql://repomix_test:repomix_test_password@localhost:5435/repomix_test';
    const pool = new Pool({ connectionString });

    // Check if code_enrichments table exists
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'code_enrichments'
      ) AS exists
    `);

    if (result.rows[0].exists) {
      console.log('OK: code_enrichments table exists');

      // Show table structure
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'code_enrichments'
        ORDER BY ordinal_position
      `);

      console.log('\nTable columns:');
      columns.rows.forEach((row: any) => {
        console.log('  - ' + row.column_name + ': ' + row.data_type + ' (' + (row.is_nullable === 'YES' ? 'nullable' : 'NOT NULL') + ')');
      });
    } else {
      console.log('FAIL: code_enrichments table does not exist');
      console.log('   Run migration: src/chat/db/migrations/003_code_enrichment.sql');
    }

    await pool.end();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log('FAIL: Database connection - ' + errMsg);
    console.log('   Set TEST_DATABASE_URL or ensure PostgreSQL is running');
  }

  // Test 2: Symbol extraction from sample code
  console.log('\nTest 2: Symbol Extraction');
  console.log('-'.repeat(40));

  try {
    const languageParser = LanguageParser.getInstance();
    languageParser.setWasmDirectory(path.resolve('./dist/tree-sitter-wasm'));

    const testFile = TEST_FILES.typescript;

    const parser = await languageParser.getParserForLang('typescript');
    const query = await languageParser.getQueryForLang('typescript');

    if (!parser || !query) {
      console.log('FAIL: Failed to load parser or query for TypeScript');
      return;
    }

    const tree = parser.parse(testFile.content);
    const captures = query.captures(tree.rootNode);

    console.log('OK: Extracted ' + captures.length + ' symbols from test file');

    const symbols = captures.map((capture: any) => ({
      name: capture.name,
      nodeType: capture.node.type,
      text: capture.node.text.slice(0, 50).replace(/\n/g, '\\n'),
    }));

    console.log('\nExtracted symbols:');
    symbols.forEach((symbol: any, i: number) => {
      console.log('  ' + (i + 1) + '. ' + symbol.name + ' (' + symbol.nodeType + '): ' + symbol.text + '...');
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log('FAIL: Symbol extraction - ' + errMsg);
    console.log('   Ensure Tree-sitter WASM files are in dist/tree-sitter-wasm/');
  }

  // Test 3: LLM summary generation with local endpoint
  console.log('\nTest 3: LLM Summary Generation (Local)');
  console.log('-'.repeat(40));

  try {
    // Use OpenAI SDK with custom base URL for local LLM (no API key required)
    const OpenAI = (await import('openai')).default;

    const client = new OpenAI({
      apiKey: 'not-needed',
      baseURL: 'http://192.168.0.136:8080/v1',
    });

    // Extract actual method implementation from the test file
    const methodCode = `public deleteUser(id: number): void {
    this.userService.deleteUser(id).subscribe(() => {
      console.log('User deleted:', id);
    });
  }`;
    
    const prompt = `Summarize what this method does in 5-10 words:\n\`\`\`ts\n${methodCode}\n\`\`\``;

    console.log('Sending request to local LLM (with full code snippet)...');
    
    const response = await client.chat.completions.create({
      model: 'qwen3.5-9b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 10000,  // Increased for reasoning models
    });

    const message = response.choices[0]?.message;
    // Qwen reasoning models output to reasoning_content
    const rawOutput = (message as any)?.reasoning_content || message?.content || '';
    
    // Extract quoted answer from reasoning
    const quoteMatches = rawOutput.match(/"([^"]+)"/g);
    const result = quoteMatches && quoteMatches.length > 0 
      ? quoteMatches[quoteMatches.length - 1]?.replace(/^"|"$/g, '') || rawOutput
      : rawOutput;

    console.log('OK: Generated summary:');
    console.log('   "' + result.trim() + '"');
    
    if (response.choices[0].finish_reason === 'length') {
      console.log('⚠️  WARNING: Response truncated, consider increasing max_tokens');
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log('FAIL: LLM summary generation - ' + errMsg);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Test complete!\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
