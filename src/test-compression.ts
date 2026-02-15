#!/usr/bin/env ts-node

/**
 * Standalone compression test script
 * Tests the compression engine with sample files for all supported languages
 */

import { compressFile } from './core/compression/compressFile.js';
import { LanguageParser } from './core/compression/LanguageParser.js';
import * as fs from 'fs';
import * as path from 'path';

// Sample test files for each supported language
const TEST_FILES: Record<string, { extension: string; content: string }> = {
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
      console.log(\`User \${id} deleted\`);
    });
  }
}`
  },

  javascript: {
    extension: '.js',
    content: `const express = require('express');
const mongoose = require('mongoose');

class UserController {
  constructor() {
    this.model = mongoose.model('User');
  }
  
  async getAllUsers(req, res) {
    try {
      const users = await this.model.find({});
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  async createUser(req, res) {
    const userData = req.body;
    try {
      const user = new this.model(userData);
      await user.save();
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
  
  async getUserById(req, res) {
    const { id } = req.params;
    try {
      const user = await this.model.findById(id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

const router = express.Router();
const controller = new UserController();

router.get('/', controller.getAllUsers.bind(controller));
router.post('/', controller.createUser.bind(controller));
router.get('/:id', controller.getUserById.bind(controller));

module.exports = router;`
  },

  python: {
    extension: '.py',
    content: `from typing import List, Optional
from dataclasses import dataclass
import json

@dataclass
class User:
    id: int
    name: str
    email: str
    active: bool = True
    
    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'active': self.active
        }

class UserService:
    def __init__(self):
        self.users: List[User] = []
        
    def create_user(self, name: str, email: str) -> User:
        user_id = len(self.users) + 1
        user = User(id=user_id, name=name, email=email)
        self.users.append(user)
        return user
        
    def get_user(self, user_id: int) -> Optional[User]:
        for user in self.users:
            if user.id == user_id:
                return user
        return None
        
    def get_all_users(self) -> List[User]:
        return self.users
        
    def update_user(self, user_id: int, **kwargs) -> Optional[User]:
        user = self.get_user(user_id)
        if user:
            for key, value in kwargs.items():
                if hasattr(user, key):
                    setattr(user, key, value)
        return user
        
    def delete_user(self, user_id: int) -> bool:
        user = self.get_user(user_id)
        if user:
            self.users.remove(user)
            return True
        return False

def serialize_users(users: List[User]) -> str:
    return json.dumps([user.to_dict() for user in users], indent=2)`
  },

  rust: {
    extension: '.rs',
    content: `use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: u32,
    pub name: String,
    pub email: String,
    pub active: bool,
}

pub struct UserService {
    users: HashMap<u32, User>,
    next_id: u32,
}

impl UserService {
    pub fn new() -> Self {
        Self {
            users: HashMap::new(),
            next_id: 1,
        }
    }
    
    pub fn create_user(&mut self, name: String, email: String) -> User {
        let user = User {
            id: self.next_id,
            name,
            email,
            active: true,
        };
        self.users.insert(self.next_id, user.clone());
        self.next_id += 1;
        user
    }
    
    pub fn get_user(&self, id: u32) -> Option<&User> {
        self.users.get(&id)
    }
    
    pub fn get_all_users(&self) -> Vec<&User> {
        self.users.values().collect()
    }
    
    pub fn update_user<F>(&mut self, id: u32, update_fn: F) -> Option<&User>
    where
        F: FnOnce(&mut User),
    {
        if let Some(user) = self.users.get_mut(&id) {
            update_fn(user);
            Some(user)
        } else {
            None
        }
    }
    
    pub fn delete_user(&mut self, id: u32) -> bool {
        self.users.remove(&id).is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_user() {
        let mut service = UserService::new();
        let user = service.create_user("Alice".to_string(), "alice@example.com".to_string());
        assert_eq!(user.name, "Alice");
        assert_eq!(user.id, 1);
    }
}`
  },

  csharp: {
    extension: '.cs',
    content: `using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace UserService.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UsersController : ControllerBase
    {
        private readonly IUserService _userService;
        
        public UsersController(IUserService userService)
        {
            _userService = userService;
        }
        
        [HttpGet]
        public async Task<ActionResult<IEnumerable<User>>> GetAllUsers()
        {
            try
            {
                var users = await _userService.GetAllUsersAsync();
                return Ok(users);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
        
        [HttpGet("{id}")]
        public async Task<ActionResult<User>> GetUserById(int id)
        {
            try
            {
                var user = await _userService.GetUserByIdAsync(id);
                if (user == null)
                {
                    return NotFound(new { error = "User not found" });
                }
                return Ok(user);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
        
        [HttpPost]
        public async Task<ActionResult<User>> CreateUser([FromBody] CreateUserRequest request)
        {
            try
            {
                var user = await _userService.CreateUserAsync(request.Name, request.Email);
                return CreatedAtAction(nameof(GetUserById), new { id = user.Id }, user);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
        
        [HttpDelete("{id}")]
        public async Task<ActionResult> DeleteUser(int id)
        {
            try
            {
                var result = await _userService.DeleteUserAsync(id);
                if (!result)
                {
                    return NotFound(new { error = "User not found" });
                }
                return NoContent();
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }
    
    public class CreateUserRequest
    {
        public string Name { get; set; }
        public string Email { get; set; }
    }
}`
  },

  dart: {
    extension: '.dart',
    content: `import 'dart:async';
import 'package:flutter/material.dart';

class UserService {
  final List<User> _users = [];
  int _nextId = 1;
  
  StreamController<List<User>> _usersController = StreamController<List<User>>.broadcast();
  
  Stream<List<User>> get usersStream => _usersController.stream;
  
  Future<User> createUser(String name, String email) async {
    final user = User(
      id: _nextId++,
      name: name,
      email: email,
      createdAt: DateTime.now(),
    );
    
    _users.add(user);
    _usersController.add(List.unmodifiable(_users));
    
    return user;
  }
  
  Future<User?> getUser(int id) async {
    try {
      await Future.delayed(Duration(milliseconds: 100));
      return _users.firstWhere((user) => user.id == id);
    } catch (e) {
      return null;
    }
  }
  
  Future<List<User>> getAllUsers() async {
    await Future.delayed(Duration(milliseconds: 50));
    return List.unmodifiable(_users);
  }
  
  Future<bool> updateUser(int id, {String? name, String? email}) async {
    final index = _users.indexWhere((user) => user.id == id);
    if (index == -1) return false;
    
    final user = _users[index];
    _users[index] = user.copyWith(
      name: name ?? user.name,
      email: email ?? user.email,
    );
    
    _usersController.add(List.unmodifiable(_users));
    return true;
  }
  
  Future<bool> deleteUser(int id) async {
    final removed = _users.removeWhere((user) => user.id == id) > 0;
    if (removed) {
      _usersController.add(List.unmodifiable(_users));
    }
    return removed;
  }
  
  void dispose() {
    _usersController.close();
  }
}

class User {
  final int id;
  final String name;
  final String email;
  final DateTime createdAt;
  
  User({
    required this.id,
    required this.name,
    required this.email,
    required this.createdAt,
  });
  
  User copyWith({
    int? id,
    String? name,
    String? email,
    DateTime? createdAt,
  }) {
    return User(
      id: id ?? this.id,
      name: name ?? this.name,
      email: email ?? this.email,
      createdAt: createdAt ?? this.createdAt,
    );
  }
  
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'createdAt': createdAt.toIso8601String(),
    };
  }
}`
  }
};

async function runTests() {
  console.log('🧪 Testing Compression Engine\n');
  console.log('=' .repeat(50));
  
  // Set WASM directory for the LanguageParser
  const languageParser = LanguageParser.getInstance();
  languageParser.setWasmDirectory(path.resolve('./dist/tree-sitter-wasm'));
  
  let passed = 0;
  let failed = 0;
  
  for (const [language, testData] of Object.entries(TEST_FILES)) {
    console.log(`\n🔍 Testing ${language.toUpperCase()} compression...`);
    console.log('-'.repeat(40));
    
    const fileName = `test-file${testData.extension}`;
    
    try {
      const result = await compressFile(fileName, testData.content);
      
      if (result === null) {
        console.log(`❌ FAILED: Returned null`);
        console.log(`   This usually means:`);
        console.log(`   - WASM parser failed to load`);
        console.log(`   - Language not supported`);
        console.log(`   - Parsing error occurred`);
        failed++;
      } else {
        console.log(`✅ SUCCESS: Compressed ${testData.content.length} → ${result.length} chars`);
        console.log(`   Compression ratio: ${((1 - result.length / testData.content.length) * 100).toFixed(1)}%`);
        console.log(`\n📝 Original:`);
        console.log('---');
        console.log(testData.content.substring(0, 200) + (testData.content.length > 200 ? '...' : ''));
        console.log('---');
        console.log(`\n📝 Compressed:`);
        console.log('---');
        console.log(result.substring(0, 200) + (result.length > 200 ? '...' : ''));
        console.log('---');
        passed++;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.log(`💥 ERROR: ${errorMessage}`);
      if (errorStack) console.log(errorStack);
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${(passed / (passed + failed) * 100).toFixed(1)}%`);
  
  if (failed > 0) {
    console.log(`\n💡 Troubleshooting Tips:`);
    console.log(`   1. Ensure WASM files exist in ./dist/tree-sitter-wasm/`);
    console.log(`   2. Run: npm run build to compile the project`);
    console.log(`   3. Check that web-tree-sitter is installed: npm list web-tree-sitter`);
    console.log(`   4. Verify file permissions on WASM files`);
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
runTests().catch(console.error);
