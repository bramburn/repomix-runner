import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ProcessRemoteFilesMessage, RemoteClipboardProcessingResult } from '../webview/types/remoteClipboardMessages.js';

const execPromise = promisify(exec);

export class RemoteClipboardHandler {
    private tempBaseDir: string;

    constructor() {
        // Use OS temp directory
        this.tempBaseDir = path.join(os.tmpdir(), 'repomix-clipboard');
    }

    /**
     * Main entry point: processes files sent from remote extension
     */
    async handleProcessRemoteFiles(message: ProcessRemoteFilesMessage): Promise<RemoteClipboardProcessingResult> {
        const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const sessionTempDir = path.join(this.tempBaseDir, sessionId);

        console.log(`[RemoteClipboard] Starting session ${sessionId}`);
        console.log(`[RemoteClipboard] Processing ${message.files.length} files`);

        try {
            // Step 1: Ensure temp directory exists
            this.ensureDirectory(sessionTempDir);
            console.log(`[RemoteClipboard] Created temp directory: ${sessionTempDir}`);

            // Step 2: Decode and write files
            const decodedCount = await this.decodeAndWriteFiles(message.files, sessionTempDir);
            console.log(`[RemoteClipboard] Decoded and wrote ${decodedCount} files`);

            // Step 3: Find and run the binary
            const binaryPath = this.findRepomixBinary();
            console.log(`[RemoteClipboard] Found binary: ${binaryPath}`);

            const output = await this.runBinary(binaryPath, sessionTempDir);
            console.log(`[RemoteClipboard] Binary executed successfully`);

            return {
                command: 'remoteClipboardProcessingComplete',
                success: true,
                filesProcessed: message.files.length,
                tempDirectory: sessionTempDir,
                binaryOutput: output,
                resolverKey: message.resolverKey,
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[RemoteClipboard] Error: ${errorMsg}`);

            return {
                command: 'remoteClipboardProcessingComplete',
                success: false,
                error: errorMsg,
                failedAt: this.categorizeError(error),
                resolverKey: message.resolverKey,
            };
        } finally {
            // Step 4: Cleanup temp files (async)
            this.cleanupAsync(sessionTempDir);
        }
    }

    /**
     * Decodes base64 files and writes to temp directory
     */
    private async decodeAndWriteFiles(
        files: Array<{ path: string; contentBase64: string; size: number }>,
        baseDir: string
    ): Promise<number> {
        let count = 0;

        for (const file of files) {
            try {
                // Decode base64
                const content = Buffer.from(file.contentBase64, 'base64');

                // Build full path
                const fullPath = path.join(baseDir, file.path);
                const fileDir = path.dirname(fullPath);

                // Create parent directories
                this.ensureDirectory(fileDir);

                // Write file
                fs.writeFileSync(fullPath, content);
                count++;

                console.log(`[RemoteClipboard] Wrote ${file.path} (${content.length} bytes)`);
            } catch (error) {
                console.error(`[RemoteClipboard] Failed to write ${file.path}: ${error}`);
                throw error;
            }
        }

        return count;
    }

    /**
     * Finds the repomix-clipboard binary for the current platform
     */
    private findRepomixBinary(): string {
        const platform = process.platform;
        const arch = process.arch;
        const ext = platform === 'win32' ? '.exe' : '';
        const binaryName = `repomix-clipboard-${platform}-${arch}${ext}`;

        // Possible locations depending on how extension is loaded
        const possiblePaths = [
            // Development
            path.join(__dirname, '..', '..', '..', 'assets', 'bin', binaryName),
            path.join(__dirname, '..', '..', 'assets', 'bin', binaryName),

            // Production (bundled)
            path.join(process.env.REPOMIX_EXTENSION_DIR || '', 'assets', 'bin', binaryName),

            // Relative to process cwd
            path.resolve(process.cwd(), 'assets', 'bin', binaryName),

            // Global installation (if added to PATH)
            binaryName,
        ];

        for (const p of possiblePaths) {
            console.log(`[RemoteClipboard] Checking: ${p}`);
            if (fs.existsSync(p)) {
                console.log(`[RemoteClipboard] Found binary at: ${p}`);
                return p;
            }
        }

        throw new Error(`repomix-clipboard binary not found for ${platform}-${arch}. Searched paths: ${possiblePaths.join(', ')}`);
    }

    /**
     * Runs the binary on the temp files
     */
    private async runBinary(binaryPath: string, tempDir: string): Promise<string> {
        // Build command
        // Binary expects: repomix-clipboard --generate-md --cwd <dir>
        const cmd = `"${binaryPath}" --generate-md --cwd "${tempDir}"`;

        console.log(`[RemoteClipboard] Running: ${cmd}`);

        try {
            const { stdout, stderr } = await execPromise(cmd, {
                timeout: 30000, // 30 second timeout
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });

            console.log(`[RemoteClipboard] Binary output: ${stdout}`);

            if (stderr) {
                console.warn(`[RemoteClipboard] Binary stderr: ${stderr}`);
            }

            // Binary should have updated clipboard at this point
            return stdout;
        } catch (error) {
            throw new Error(`Binary execution failed: ${error}`);
        }
    }

    /**
     * Ensures a directory exists
     */
    private ensureDirectory(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Async cleanup to avoid blocking
     */
    private cleanupAsync(dir: string): void {
        // Don't wait for cleanup, but log errors
        setTimeout(() => {
            try {
                this.rmRf(dir);
                console.log(`[RemoteClipboard] Cleaned up: ${dir}`);
            } catch (error) {
                console.error(`[RemoteClipboard] Cleanup failed: ${error}`);
            }
        }, 1000);
    }

    /**
     * Recursively removes a directory
     */
    private rmRf(dir: string): void {
        if (!fs.existsSync(dir)) return;

        fs.readdirSync(dir).forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                this.rmRf(filePath);
            } else {
                fs.unlinkSync(filePath);
            }
        });

        fs.rmdirSync(dir);
    }

    /**
     * Categorizes error for better debugging
     */
    private categorizeError(error: unknown): 'decode' | 'tempWrite' | 'binaryExecution' | 'cleanup' {
        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes('base64') || errorMsg.includes('decode')) {
            return 'decode';
        }
        if (errorMsg.includes('write') || errorMsg.includes('EACCES') || errorMsg.includes('ENOENT')) {
            return 'tempWrite';
        }
        if (errorMsg.includes('binary') || errorMsg.includes('execution') || errorMsg.includes('not found')) {
            return 'binaryExecution';
        }

        return 'cleanup';
    }
}

// Export singleton
export const remoteClipboardHandler = new RemoteClipboardHandler();
