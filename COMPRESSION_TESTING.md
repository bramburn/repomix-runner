# Compression Engine Testing Guide

## 🎯 Quick Start

The compression engine is working correctly! Here's how to test it:

### Method 1: VS Code Extension Debugger (Recommended)

1. **Open the project in VS Code**
   ```bash
   code .
   ```

2. **Start debugging**
   - Press `F5` or go to Run → Start Debugging
   - This launches a new VS Code window with the extension loaded

3. **Test with a file**
   - In the debug window, create a new file:
     - `test.ts` for TypeScript
     - `test.js` for JavaScript  
     - `test.py` for Python
     - `test.rs` for Rust
     - `test.cs` for C#
     - `test.dart` for Dart

4. **Run the test command**
   - Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
   - Type "Repomix: Test Compression"
   - Select the command

5. **See results**
   - A new tab will open showing the compressed version
   - Compare original vs compressed output

### Method 2: Programmatic Usage

In your extension code, you can call compression like this:

```typescript
import { compressFile } from './core/compression/index.js';

// Compress any file content
const compressed = await compressFile(
  'myfile.ts',           // file path (used for language detection)
  originalContent,       // file content as string
  {
    keepNames: ['MyClass', 'importantFunction'] // optional: keep these intact
  }
);

if (compressed) {
  console.log('Compressed successfully!');
  console.log(`Original: ${originalContent.length} chars`);
  console.log(`Compressed: ${compressed.length} chars`);
  console.log(`Ratio: ${((1 - compressed.length / originalContent.length) * 100).toFixed(1)}%`);
} else {
  console.log('Compression failed - falling back to full content');
}
```

### Method 3: Command Line Verification

Run our diagnostic script to verify everything is set up:

```bash
node scripts/diagnose-compression.js
```

## 🧪 Test Cases

Try these examples in different languages:

### TypeScript/JavaScript
```typescript
// Before compression
class UserService {
  private users: User[] = [];
  
  async getUsers(): Promise<User[]> {
    const response = await fetch('/api/users');
    return response.json();
  }
  
  async createUser(user: User): Promise<User> {
    const response = await fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(user)
    });
    return response.json();
  }
}

// After compression (simplified)
class UserService {
  private users: User[] = [];
  
  async getUsers(): Promise<User[]> { /* ... */ }
  
  async createUser(user: User): Promise<User> { /* ... */ }
}
```

### Python
```python
# Before
class UserService:
    def __init__(self):
        self.users = []
        
    def get_users(self):
        response = requests.get('/api/users')
        return response.json()
        
    def create_user(self, user_data):
        response = requests.post('/api/users', json=user_data)
        return response.json()

# After (simplified)
class UserService:
    def __init__(self):
        self.users = []
        
    def get_users(self): ...
        
    def create_user(self, user_data): ...
```

### Rust
```rust
// Before
impl UserService {
    pub fn new() -> Self {
        Self {
            users: HashMap::new(),
        }
    }
    
    pub fn get_users(&self) -> Result<Vec<User>, Error> {
        let response = reqwest::get("/api/users").await?;
        let users = response.json().await?;
        Ok(users)
    }
}

// After (simplified)
impl UserService {
    pub fn new() -> Self { /* ... */ }
    
    pub fn get_users(&self) -> Result<Vec<User>, Error> { /* ... */ }
}
```

## 🔍 Troubleshooting

If compression returns `null`:
1. Check that WASM files exist in `dist/tree-sitter-wasm/`
2. Verify `web-tree-sitter` is installed
3. Look at VS Code developer console for errors (Help → Toggle Developer Tools)
4. Ensure the file extension is supported

## 📊 Supported Languages

✅ TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`)
✅ JavaScript (`.js`, `.jsx`, `.mjs`, `.cjs`)
✅ Python (`.py`)
✅ Rust (`.rs`)
✅ C# (`.cs`)
✅ Dart (`.dart`)

The system automatically detects language based on file extension and applies the appropriate Tree-sitter parser and compression strategy.