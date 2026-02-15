#!/usr/bin/env node

/**
 * Diagnostic script to check compression system health
 * Run this to verify the compression engine is properly set up
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Compression System Diagnostic\n');
console.log('=====================================\n');

const projectRoot = path.resolve(__dirname, '..');
let issues = [];

// 1. Check WASM files
console.log('1. Checking WASM files...');
const wasmDir = path.join(projectRoot, 'dist', 'tree-sitter-wasm');
if (fs.existsSync(wasmDir)) {
  const wasmFiles = fs.readdirSync(wasmDir).filter(f => f.endsWith('.wasm'));
  console.log(`   ✓ Found ${wasmFiles.length} WASM files:`);
  wasmFiles.forEach(f => console.log(`     - ${f}`));
  
  if (wasmFiles.length < 6) {
    issues.push('Missing some WASM files');
  }
} else {
  console.log('   ✗ WASM directory not found!');
  issues.push('WASM directory missing');
}

// 2. Check web-tree-sitter installation
console.log('\n2. Checking web-tree-sitter...');
try {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const hasWebTreeSitter = pkgJson.dependencies && pkgJson.dependencies['web-tree-sitter'];
  if (hasWebTreeSitter) {
    console.log('   ✓ web-tree-sitter is in package.json');
    const version = pkgJson.dependencies['web-tree-sitter'];
    console.log(`     Version: ${version}`);
  } else {
    console.log('   ✗ web-tree-sitter not found in dependencies');
    issues.push('web-tree-sitter missing from dependencies');
  }
} catch (e) {
  console.log('   ✗ Could not read package.json');
  issues.push('Could not read package.json');
}

// 3. Check compression source files
console.log('\n3. Checking compression source files...');
const compressionDir = path.join(projectRoot, 'src', 'core', 'compression');
if (fs.existsSync(compressionDir)) {
  const files = fs.readdirSync(compressionDir);
  console.log('   ✓ Compression directory exists');
  console.log('   Files found:');
  files.forEach(f => console.log(`     - ${f}`));
} else {
  console.log('   ✗ Compression directory missing');
  issues.push('Compression source directory missing');
}

// 4. Check LanguageParser.ts
console.log('\n4. Checking LanguageParser...');
const languageParserPath = path.join(compressionDir, 'LanguageParser.ts');
if (fs.existsSync(languageParserPath)) {
  const content = fs.readFileSync(languageParserPath, 'utf8');
  if (content.includes('web-tree-sitter')) {
    console.log('   ✓ LanguageParser imports web-tree-sitter');
  } else {
    console.log('   ⚠ LanguageParser may not import web-tree-sitter correctly');
  }
  
  // Check for supported languages
  const langs = ['typescript', 'javascript', 'python', 'rust', 'csharp', 'dart'];
  console.log('   Supported languages:');
  langs.forEach(lang => {
    if (content.includes(lang)) {
      console.log(`     ✓ ${lang}`);
    } else {
      console.log(`     ✗ ${lang} (missing)`);
      issues.push(`${lang} support missing`);
    }
  });
} else {
  console.log('   ✗ LanguageParser.ts not found');
  issues.push('LanguageParser.ts missing');
}

// 5. Summary
console.log('\n=====================================');
if (issues.length === 0) {
  console.log('🎉 All checks passed! The compression system appears to be set up correctly.');
  console.log('\nTo test compression:');
  console.log('1. Open VS Code in this project');
  console.log('2. Press F5 to start debugging the extension');
  console.log('3. Create/open a file (.ts, .js, .py, .rs, .cs, .dart)');
  console.log('4. Run "Repomix: Test Compression" from the command palette');
} else {
  console.log(`⚠️  Found ${issues.length} potential issues:`);
  issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
  
  console.log('\n🔧 Suggested fixes:');
  if (issues.some(i => i.includes('WASM'))) {
    console.log('   - Run: npm run setup:treesitter');
  }
  if (issues.some(i => i.includes('web-tree-sitter'))) {
    console.log('   - Run: npm install web-tree-sitter');
  }
  if (issues.some(i => i.includes('missing'))) {
    console.log('   - Check that all source files are present');
  }
}

console.log('\n💡 For detailed testing, use the VS Code extension debugger.');