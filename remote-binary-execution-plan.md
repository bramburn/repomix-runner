# Plan: Remote File Copying with Local Binary Execution

## Executive Summary

Instead of using `npx repomix` on the remote (which copies text to clipboard), we need a **hybrid approach**:

```
Remote (Linux)               Local Client (Windows)
─────────────────           ──────────────────────

Files in repo                [Nothing happens here]
    ↓
Read file contents
    ↓
Send as base64/binary
    ↓
                            Receive file contents
                                    ↓
                            Create temp file
                                    ↓
                            Run repomix-clipboard.exe
                            on the temp file
                                    ↓
                            Get binary clipboard result
                                    ↓
                            ✓ File in clipboard (binary format)
```

---

## Problem Analysis

### Current Issue
- Remote host runs `npx repomix` → generates markdown → copies text to clipboard
- But we want **file-level clipboard operations** (binary format)
- `repomix-clipboard.exe` only exists on Windows client

### Key Constraint
- **Extension host runs on REMOTE** (where files are)
- **Rust binary exists on LOCAL client** (Windows)
- **Can't run local binary from remote extension**
- **Need to transfer files AND get result back**

### Solution: Webview Mediation
- Extension host reads files on remote
- Sends file contents to **webview** (which runs on local client)
- Webview runs local binary
- Webview sends result back to extension

---

## Architecture Overview

```
┌─────────────────────────────────────┐
│   Remote Host (Extension Host)      │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ SearchTab.tsx Message        │   │
│  │ "copySearchResultsMarkdown"  │   │
│  └──────────────┬───────────────┘   │
│                 │                    │
│                 ▼                    │
│  ┌──────────────────────────────┐   │
│  │ SearchController             │   │
│  │ routes to command             │   │
│  └──────────────┬───────────────┘   │
│                 │                    │
│                 ▼                    │
│  ┌──────────────────────────────┐   │
│  │ Extension Command Handler    │   │
│  │ runRepomixClipboardRemote()  │   │
│  │                              │   │
│  │ 1. Read files from remote    │   │
│  │ 2. Convert to data           │   │
│  │ 3. Detect remote mode        │   │
│  │ 4. If remote:                │   │
│  │    sendToWebview({           │   │
│  │      files: [base64 content] │   │
│  │    })                        │   │
│  │                              │   │
│  └──────────────┬───────────────┘   │
│                 │                    │
└─────────────────┼────────────────────┘
                  │
        [IPC Bridge Message]
                  │
┌─────────────────▼────────────────────┐
│   Local Client (Webview)             │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ Receive message from         │   │
│  │ extension host               │   │
│  │ {files: [base64]}            │   │
│  └──────────────┬───────────────┘   │
│                 │                    │
│                 ▼                    │
│  ┌──────────────────────────────┐   │
│  │ Webview Handler              │   │
│  │ processRemoteFiles()         │   │
│  │                              │   │
│  │ 1. Decode base64 → binary    │   │
│  │ 2. Create temp files in %TMP%│   │
│  │ 3. Run repomix-clipboard.exe │   │
│  │    on temp files             │   │
│  │ 4. Get clipboard result      │   │
│  │ 5. Return to extension       │   │
│  │                              │   │
│  └──────────────┬───────────────┘   │
│                 │                    │
└─────────────────┼────────────────────┘
                  │
        [IPC Bridge Message with Result]
                  │
┌─────────────────▼────────────────────┐
│   Remote Extension (continued)       │
│                                      │
│  Extension receives result           │
│  from webview                        │
│      ↓                               │
│  vscode.env.clipboard.writeText()   │
│  (or binary equivalent)              │
│      ↓                               │
│  ✓ Clipboard populated              │
│                                      │
└─────────────────────────────────────┘
```

---

## Detection: Local vs Remote Mode

### How to Detect Remote

```typescript
import * as vscode from 'vscode';

function isRemoteMode(): boolean {
  // VS Code provides context about the remote
  return vscode.env.remoteName !== undefined;
}

function getRemoteType(): string {
  // 'ssh', 'wsl', 'dev-container', 'codespaces', etc.
  return vscode.env.remoteName || 'local';
}

function isWindows(): boolean {
  return process.platform === 'win32';
}

function isLocalWindowsWithRemote(): boolean {
  // Local machine is Windows, connected to remote
  return isRemoteMode() && vscode.env.remoteName !== 'wsl';
}
```

### Different Scenarios

| Scenario | isRemote | Local OS | Remote OS | Action |
|---|---|---|---|---|
| **Local Windows** | No | Windows | - | Use npx repomix (local) |
| **Local macOS** | No | macOS | - | Use npx repomix (local) |
| **Windows → SSH Linux** | Yes | Windows | Linux | **NEW**: Transfer files to local, run binary |
| **Windows → WSL** | Yes (sometimes) | Windows | Linux | Use npx repomix (WSL) |
| **macOS → SSH Linux** | Yes | macOS | Linux | Use npx repomix (remote) |

---

## Implementation Plan

### Phase 1: Detection & Routing (30 min)

**File:** `src/core/files/runRepomixClipboardRemote.ts` (NEW)

```typescript
import * as vscode from 'vscode';

export interface RemoteMode {
  isRemote: boolean;
  remoteName?: string; // 'ssh', 'wsl', 'dev-container', etc.
  localIsWindows: boolean;
}

export function detectRemoteMode(): RemoteMode {
  return {
    isRemote: vscode.env.remoteName !== undefined,
    remoteName: vscode.env.remoteName,
    localIsWindows: process.platform === 'win32',
  };
}

export function shouldUseLocalBinary(mode: RemoteMode): boolean {
  // Only use local binary if:
  // 1. We're in remote mode
  // 2. Local machine is Windows
  // 3. We have the binary available
  return mode.isRemote && mode.localIsWindows && mode.remoteName !== 'wsl';
}
```

### Phase 2: File Content Reading (30 min)

**File:** `src/core/files/remoteFileReader.ts` (NEW)

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileContent {
  path: string;           // Relative path
  content: Buffer;        // Binary content
  contentBase64: string;  // Base64 encoded for transfer
  size: number;
}

export async function readFilesAsBase64(
  cwd: string,
  relativeFiles: string[]
): Promise<FileContent[]> {
  const results: FileContent[] = [];

  for (const filePath of relativeFiles) {
    try {
      const absolutePath = path.join(cwd, filePath);
      const content = await fs.readFile(absolutePath);
      
      results.push({
        path: filePath,
        content,
        contentBase64: content.toString('base64'),
        size: content.length,
      });
    } catch (error) {
      console.error(`Failed to read ${filePath}:`, error);
      // Continue with other files
    }
  }

  return results;
}
```

### Phase 3: Message Protocol (30 min)

**File:** `src/webview/types/clipboardMessages.ts` (NEW)

```typescript
// Extension → Webview

export interface ProcessRemoteFilesMessage {
  command: 'processRemoteFilesForClipboard';
  files: Array<{
    path: string;
    contentBase64: string;
  }>;
  tempDir?: string;  // Optional: where to save temp files
}

// Webview → Extension

export interface ClipboardProcessingResult {
  success: boolean;
  error?: string;
  message?: string;
  filesProcessed?: number;
}
```

### Phase 4: Extension Command Update (30 min)

**File:** `src/extension.ts` (MODIFY)

```typescript
import { detectRemoteMode, shouldUseLocalBinary } from './core/files/runRepomixClipboardRemote';
import { readFilesAsBase64 } from './core/files/remoteFileReader';

const copySearchResultsToClipboardCommand = vscode.commands.registerCommand(
  'repomixRunner.copySearchResultsMarkdown',
  async (relativeFiles: string[]) => {
    try {
      const cwd = getCwd();
      const remoteMode = detectRemoteMode();

      // LOCAL MODE (no remote) - use existing npx approach
      if (!remoteMode.isRemote) {
        await runRepomixClipboardGenerateMarkdown(context, cwd, relativeFiles);
        vscode.window.showInformationMessage(
          `✓ Copied ${relativeFiles.length} files as Markdown to clipboard`
        );
        return;
      }

      // REMOTE MODE with Windows client - use local binary
      if (shouldUseLocalBinary(remoteMode)) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Preparing files for local clipboard...',
          },
          async () => {
            // 1. Read files on remote as base64
            const fileContents = await readFilesAsBase64(cwd, relativeFiles);

            // 2. Send to webview (which runs on local client)
            vscode.postMessage({
              command: 'processRemoteFilesForClipboard',
              files: fileContents.map(f => ({
                path: f.path,
                contentBase64: f.contentBase64,
              })),
            });
          }
        );
        return;
      }

      // REMOTE MODE (non-Windows) - use npx approach
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Generating markdown from remote...',
        },
        async () => {
          await runRepomixClipboardGenerateMarkdown(context, cwd, relativeFiles);
        }
      );

      vscode.window.showInformationMessage(
        `✓ Copied ${relativeFiles.length} files as Markdown to clipboard`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed: ${msg}`);
    }
  }
);
```

### Phase 5: Webview Handler (60 min)

**File:** `src/webview/handlers/remoteClipboardHandler.ts` (NEW)

```typescript
import type { ProcessRemoteFilesMessage, ClipboardProcessingResult } from '../types/clipboardMessages';

export async function handleProcessRemoteFiles(
  message: ProcessRemoteFilesMessage
): Promise<void> {
  try {
    console.log(`Processing ${message.files.length} files for clipboard`);

    // 1. Decode base64 files
    const files = message.files.map(f => ({
      ...f,
      content: Buffer.from(f.contentBase64, 'base64'),
    }));

    // 2. Create temp directory
    const tempDir = message.tempDir || getTempDirectory();
    ensureTempDirectoryExists(tempDir);

    // 3. Write files to temp directory
    const tempFilePaths: string[] = [];
    for (const file of files) {
      const tempPath = Path.join(tempDir, file.path);
      
      // Create subdirectories if needed
      const dir = Path.dirname(tempPath);
      ensureDirectoryExists(dir);
      
      // Write file
      fs.writeFileSync(tempPath, file.content);
      tempFilePaths.push(tempPath);
    }

    // 4. Run repomix-clipboard.exe
    const result = await runRepomixClipboardBinary(tempFilePaths);

    // 5. Send result back to extension
    sendResultToExtension({
      success: true,
      message: result.message,
      filesProcessed: files.length,
    });

    // 6. Clean up temp files (async, don't wait)
    cleanupTempFiles(tempFilePaths);

  } catch (error) {
    console.error('Failed to process remote files:', error);
    sendResultToExtension({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runRepomixClipboardBinary(filePaths: string[]): Promise<any> {
  // This runs on local Windows machine
  // Find the repomix-clipboard.exe in extension's assets
  
  const binaryPath = findRepomixClipboardBinary();
  
  // Build arguments: --generate-md --cwd <temp> file1 file2 ...
  const cwd = Path.dirname(filePaths[0]);
  const relativeFiles = filePaths.map(f => Path.relative(cwd, f));
  
  const cmd = `"${binaryPath}" --generate-md --cwd "${cwd}" ${relativeFiles.map(f => `"${f}"`).join(' ')}`;
  
  return new Promise((resolve, reject) => {
    // Use Node.js spawn or exec to run the binary
    const { exec } = require('child_process');
    
    exec(cmd, (error: any, stdout: string, stderr: string) => {
      if (error) {
        reject(new Error(`Binary execution failed: ${error.message}`));
        return;
      }
      
      resolve({
        stdout,
        stderr,
        message: 'Binary executed successfully',
      });
    });
  });
}

function getTempDirectory(): string {
  // Return OS-specific temp directory
  const os = require('os');
  return Path.join(os.tmpdir(), 'repomix-clipboard');
}

function findRepomixClipboardBinary(): string {
  // Extension runs in a specific location
  // Binary should be at: <extension>/assets/bin/repomix-clipboard.exe
  
  const extensionPath = __dirname; // or use vscode.extensions API
  const possiblePaths = [
    Path.join(extensionPath, '..', '..', 'assets', 'bin', 'repomix-clipboard.exe'),
    Path.join(extensionPath, 'assets', 'bin', 'repomix-clipboard.exe'),
    Path.resolve(process.cwd(), 'assets', 'bin', 'repomix-clipboard.exe'),
  ];

  for (const path of possiblePaths) {
    if (fs.existsSync(path)) {
      return path;
    }
  }

  throw new Error('repomix-clipboard.exe not found');
}

function sendResultToExtension(result: ClipboardProcessingResult): void {
  // This won't work directly in webview
  // Need to use acquireVsCodeApi pattern
  const vscode = acquireVsCodeApi();
  
  vscode.postMessage({
    command: 'clipboardProcessingComplete',
    result,
  });
}
```

### Phase 6: Result Handler (30 min)

**File:** `src/extension.ts` (ADD)

```typescript
// In extension activate(), add message listener for webview responses

const messageDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
  // Or use RepomixWebviewProvider to listen for messages
});

// In SearchController or wherever handles webview messages:

case 'clipboardProcessingComplete':
  if (message.result.success) {
    vscode.window.showInformationMessage(
      `✓ Processed ${message.result.filesProcessed} files via local binary`
    );
  } else {
    vscode.window.showErrorMessage(
      `Failed to process files: ${message.result.error}`
    );
  }
  return true;
```

---

## Files to Create/Modify

| File | Action | Complexity | Time |
|------|--------|-----------|------|
| `src/core/files/runRepomixClipboardRemote.ts` | CREATE | Low | 15 min |
| `src/core/files/remoteFileReader.ts` | CREATE | Low | 15 min |
| `src/webview/types/clipboardMessages.ts` | CREATE | Low | 10 min |
| `src/webview/handlers/remoteClipboardHandler.ts` | CREATE | High | 45 min |
| `src/extension.ts` | MODIFY | Medium | 30 min |
| `src/webview/controllers/SearchController.ts` | MODIFY | Medium | 20 min |

**Total: ~135 minutes (2-2.5 hours)**

---

## Message Flow Sequence

```
User (Windows local)
    │
    ├─ Click "Copy as Markdown"
    │
    ▼
SearchTab.tsx (runs on Windows local, but shows remote files)
    │
    ├─ vscode.postMessage({command: 'copySearchResultsMarkdown', files: [...]})
    │
    ▼
SearchController (runs on remote Linux)
    │
    ├─ Detect remote mode: isRemote=true, localIsWindows=true
    │
    ├─ Branch to: useLocalBinary path
    │
    ▼
Extension Command Handler
    │
    ├─ Read files on remote → base64 encode
    │
    ├─ Post message to webview with file contents
    │
    │   {
    │     command: 'processRemoteFilesForClipboard',
    │     files: [{path: 'src/app.ts', contentBase64: 'xxx...'}]
    │   }
    │
    ▼
Webview Handler (runs on Windows local!)
    │
    ├─ Decode base64 → binary
    │
    ├─ Create temp files in C:\Users\...\AppData\Local\Temp\repomix-clipboard\
    │
    ├─ Run: repomix-clipboard.exe --generate-md --cwd C:\Temp\... src/app.ts ...
    │
    ├─ Binary copies to local Windows clipboard
    │
    ├─ Post result back to extension
    │
    ▼
Extension (on remote)
    │
    ├─ Receives success message
    │
    ├─ Shows notification to user
    │
    ▼
User's Clipboard (Windows local)
    │
    └─ ✓ Contains binary clipboard data from repomix-clipboard.exe
```

---

## Critical Technical Challenges

### 1. Webview Execution Context
**Problem:** Webview is a restricted JavaScript environment (sandboxed)

**Solution:** Use Node.js `child_process` in a special webview context, or:
- Use `vscode-webview` module that allows limited Node access
- Or communicate with a helper extension that has Node access

### 2. Binary Access from Webview
**Problem:** Webviews can't execute binaries directly

**Solution:** 
- Create a webview message handler in extension that executes the binary
- Or use `acquireVsCodeApi()` to return to extension context for binary execution

### 3. File Paths & Cross-Platform
**Problem:** Windows vs Linux path separators

**Solution:**
- Use `Path.join()` consistently
- Convert all paths to forward slashes for consistency
- Handle both Windows UNC paths and regular paths

### 4. Temp File Cleanup
**Problem:** Temp files left behind if crash occurs

**Solution:**
- Use UUID for temp directory: `repomix-clipboard-<uuid>`
- Add cleanup on extension deactivate
- Add periodic cleanup of old temp directories

---

## Alternative Approach (Simpler)

If webview binary execution is too complex, **use extension helper function**:

```
Extension (Remote)
    ├─ Read files
    ├─ base64 encode
    │
    ▼
Webview (Local)
    ├─ Decode base64
    ├─ Create temp files
    ├─ Post back: "execute binary with these temp paths"
    │
    ▼
Extension (Remote receives callback)
    ├─ Special handler: "executeBinaryLocally" command
    ├─ Sends to webview to execute
    ├─ Webview runs binary (on local machine where it exists!)
    ├─ Returns result
    │
    ▼
Clipboard (Local Windows)
    └─ ✓ Result from binary execution
```

---

## Implementation Checklist

- [ ] **Step 1**: Create remote detection module (15 min)
- [ ] **Step 2**: Create file reading module (15 min)
- [ ] **Step 3**: Create message types (10 min)
- [ ] **Step 4**: Update extension command routing (30 min)
- [ ] **Step 5**: Create webview handler (45 min)
- [ ] **Step 6**: Add result callback handler (20 min)
- [ ] **Step 7**: Test local mode (unchanged behavior) (15 min)
- [ ] **Step 8**: Test remote mode with binary (30 min)
- [ ] **Step 9**: Add error handling & cleanup (20 min)
- [ ] **Step 10**: Code review & merge (20 min)

**Total: ~220 minutes (3.5-4 hours)**

---

## Risk Assessment

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Webview can't run binary | Medium | Use extension command instead |
| Binary not found | Low | Check multiple paths, clear error |
| Temp file cleanup fails | Low | Add scheduled cleanup task |
| Base64 encoding large files | Medium | Add size limits, stream large files |
| Cross-platform path issues | Low | Use Path.join consistently |

---

## Success Criteria

✅ Local Windows (no remote) - works as before
✅ Windows → SSH Linux - uses local binary, copies binary clipboard
✅ macOS → SSH Linux - uses npx approach (unchanged)
✅ WSL - uses npx approach (unchanged)
✅ No temp files left behind
✅ Clear error messages
✅ Performance acceptable (<5s)

---

## Questions to Clarify

1. **Can webview run binaries?** - This is the main blocker
2. **Where should temp files go?** - Windows `%TEMP%`, macOS `/tmp`, etc.?
3. **Should we also support macOS local + SSH?** - Or only Windows scenario?
4. **What about file permissions?** - Temp files readable by binary?
5. **Binary versioning?** - How to distribute updated binaries?

---

## Next Steps

1. Clarify webview binary execution capability
2. Build remote detection module
3. Build file reader module
4. Resolve binary execution method (webview vs extension)
5. Implement full flow
6. Test extensively on Windows → SSH scenario

This plan provides **maximum flexibility** while handling the Windows client + remote server scenario!
