#!/usr/bin/env npx ts-node

/**
 * Compression test script - compresses a file from the repository
 * Usage: npx ts-node src/test-compression-file.ts [file-path]
 * Example: npx ts-node src/test-compression-file.ts src/extension.ts
 */

import { compressFile } from './core/compression/compressFile';
import { LanguageParser } from './core/compression/LanguageParser';
import * as fs from 'fs';
import * as path from 'path';

// Default to src/extension.ts if no file specified
const DEFAULT_FILE = 'src/extension.ts';

async function main() {
  const filePath = process.argv[2] || DEFAULT_FILE;

  console.log('🧪 Compression Test');
  console.log('='.repeat(50));
  console.log(`📄 File: ${filePath}`);
  console.log('');

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Read file content
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  console.log(`📏 Original size: ${fileContent.length} characters (${Math.ceil(fileContent.length / 4)} tokens est.)`);

  // Set up LanguageParser with WASM directory
  const languageParser = LanguageParser.getInstance();
  const wasmDir = path.resolve('./dist/tree-sitter-wasm');

  if (!fs.existsSync(wasmDir)) {
    console.warn(`⚠️ WASM directory not found: ${wasmDir}`);
    console.warn('   Trying alternative paths...');
  }

  languageParser.setWasmDirectory(wasmDir);

  // Try to compress
  console.log('\n🔄 Compressing...\n');

  try {
    const startTime = Date.now();
    const compressed = await compressFile(filePath, fileContent);
    const elapsed = Date.now() - startTime;

    if (compressed === null) {
      console.log('❌ Compression returned null');
      console.log('\nPossible reasons:');
      console.log('  - File extension not supported');
      console.log('  - WASM parser failed to load');
      console.log('  - Parsing error occurred');
      console.log('\nTroubleshooting:');
      console.log('  1. Ensure WASM files exist in ./dist/tree-sitter-wasm/');
      console.log('  2. Run: npm run build');
      console.log('  3. Supported extensions: ts, tsx, js, jsx, py, rs, cs, dart');
      process.exit(1);
    }

    const ratio = ((1 - compressed.length / fileContent.length) * 100).toFixed(1);
    console.log(`✅ Compression successful!`);
    console.log(`   Result size: ${compressed.length} characters (${Math.ceil(compressed.length / 4)} tokens est.)`);
    console.log(`   Reduction: ${ratio}% (${Math.ceil((fileContent.length - compressed.length) / 4)} tokens saved est.)`);
    console.log(`   Reduction: ${ratio}%`);
    console.log(`   Time: ${elapsed}ms`);

    console.log('\n' + '-'.repeat(50));
    console.log('📝 Compressed output preview:');
    console.log('-'.repeat(50));
    console.log(compressed);
    console.log('-'.repeat(50));

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error during compression: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch(console.error);
