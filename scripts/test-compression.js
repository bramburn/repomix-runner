const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Compression Engine\n');
console.log('==================================================');

// Test files for each language
const testFiles = {
  typescript: {
    extension: '.ts',
    content: `import { Component } from '@angular/core';
interface User { id: number; name: string; }
@Component({ selector: 'app-user' })
export class UserComponent {
  users = [];
  ngOnInit(): void { console.log('init'); }
  private fetchData(): void { /* implementation */ }
}`
  },
  
  javascript: {
    extension: '.js',
    content: `const express = require('express');
class UserController {
  async getAllUsers(req, res) {
    try {
      const users = await this.model.find({});
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}`
  },
  
  python: {
    extension: '.py',
    content: `from typing import List
class UserService:
    def __init__(self):
        self.users = []
        
    def create_user(self, name: str) -> dict:
        user = {'id': len(self.users) + 1, 'name': name}
        self.users.append(user)
        return user
        
    def get_all_users(self) -> List[dict]:
        return self.users`
  },
  
  rust: {
    extension: '.rs',
    content: `use std::collections::HashMap;
struct User { id: u32, name: String }
struct UserService { users: HashMap<u32, User> }
impl UserService {
    fn new() -> Self {
        Self { users: HashMap::new() }
    }
    fn create_user(&mut self, name: String) -> User {
        let user = User { id: 1, name };
        self.users.insert(1, user.clone());
        user
    }
}`
  },
  
  csharp: {
    extension: '.cs',
    content: `using System;
namespace UserService {
    public class UserController {
        public async Task<IActionResult> GetAllUsers() {
            try {
                var users = await _service.GetUsers();
                return Ok(users);
            } catch (Exception ex) {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }
}`
  },
  
  dart: {
    extension: '.dart',
    content: `import 'package:flutter/material.dart';
class UserService {
  List<Map<String, dynamic>> _users = [];
  
  Future<Map<String, dynamic>> createUser(String name) async {
    final user = {'id': 1, 'name': name};
    _users.add(user);
    return user;
  }
  
  Future<List<Map<String, dynamic>>> getAllUsers() async {
    return List.unmodifiable(_users);
  }
}`
  }
};

let passed = 0;
let failed = 0;

// Run the extension test command
try {
  console.log('Starting VS Code extension test...\n');
  
  // This will run the extension and trigger the test compression command
  // We'll simulate what happens when the command is called
  
  const projectRoot = path.resolve(__dirname, '..');
  const distPath = path.join(projectRoot, 'dist', 'tree-sitter-wasm');
  
  console.log('Checking WASM files...');
  if (fs.existsSync(distPath)) {
    const files = fs.readdirSync(distPath).filter(f => f.endsWith('.wasm'));
    console.log('Found WASM files:', files);
  } else {
    console.log('WASM directory not found!');
  }
  
  // Test each language by calling the compression function directly
  // We'll create a simple test that imports and runs the compression
  
  const testScript = `
    const { compressFile } = require('./dist/extension.js');
    const testFiles = ${JSON.stringify(testFiles)};
    
    async function runTest() {
      let results = {};
      for (const [lang, data] of Object.entries(testFiles)) {
        const filename = 'test' + data.extension;
        try {
          const result = await compressFile(filename, data.content);
          results[lang] = result !== null ? 'SUCCESS' : 'FAILED';
        } catch (error) {
          results[lang] = 'ERROR: ' + error.message;
        }
      }
      console.log(JSON.stringify(results));
    }
    
    runTest().catch(console.error);
  `;
  
  fs.writeFileSync(path.join(projectRoot, 'temp-test.js'), testScript);
  
  try {
    const output = execSync('node temp-test.js', { 
      cwd: projectRoot,
      stdio: 'pipe',
      timeout: 30000
    }).toString();
    
    console.log('Test output:', output);
    
    // Clean up
    fs.unlinkSync(path.join(projectRoot, 'temp-test.js'));
    
  } catch (error) {
    console.log('Test execution failed:', error.message);
    // Clean up
    if (fs.existsSync(path.join(projectRoot, 'temp-test.js'))) {
      fs.unlinkSync(path.join(projectRoot, 'temp-test.js'));
    }
  }
  
} catch (error) {
  console.error('Setup failed:', error.message);
}

console.log('\n==================================================');
console.log('Manual Testing Instructions:');
console.log('1. Open VS Code in this project');
console.log('2. Press Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows/Linux)');
console.log('3. Type "Repomix: Test Compression"');
console.log('4. Try it on different file types:');
console.log('   - .ts, .js, .py, .rs, .cs, .dart');
console.log('5. Check the output panel for results');

console.log('\nAlternative: Run the extension in debug mode');
console.log('- Press F5 to start debugging');
console.log('- Open a test file in the editor');
console.log('- Run the "Repomix: Test Compression" command');
