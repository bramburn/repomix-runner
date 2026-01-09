import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { ProcessRemoteFilesMessage, RemoteClipboardProcessingResult } from '../types/remoteClipboardMessages.js';

const execPromise = promisify(exec);

export class RemoteClipboardHandler {
    private tempBaseDir: string;

    constructor() {
        // Use OS temp directory
        this.tempBaseDir = path.join(os.tmpdir(), 'repomix-clipboard');
        console.log('[RemoteClipboard] Initialized with temp dir:', this.tempBaseDir);
    }

    /**
     * Main entry point: processes files sent from remote extension
     */
    async handleProcessRemoteFiles(message: ProcessRemoteFilesMessage): Promise<RemoteClipboardProcessingResult> {
        const sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const sessionTempDir = path.join(this.tempBaseDir, sessionId);

        console.log(`[RemoteClipboard] Starting session ${sessionId}`);
        console.log(`[RemoteClipboard] Processing ${message.files.length} files with copyMode: ${message.copyMode}`);

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

            await this.runBinary(binaryPath, sessionTempDir, message.copyMode);
            console.log(`[RemoteClipboard] Binary executed successfully`);

            return {
                command: 'remoteClipboardProcessingComplete',
                success: true,
                filesProcessed: message.files.length,
                tempDirectory: sessionTempDir,
                resolverKey: message.resolverKey
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[RemoteClipboard] Error: ${errorMsg}`);

            return {
                command: 'remoteClipboardProcessingComplete',
                success: false,
                error: errorMsg,
                failedAt: 'unknown',
                resolverKey: message.resolverKey
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

                // console.log(`[RemoteClipboard] Wrote ${file.path} (${content.length} bytes)`);
            } catch (error) {
                console.error(`[RemoteClipboard] Failed to write ${file.path}: ${error}`);
                throw error;
            }
        }

        return count;
    }

    /**
     * Finds the repomix-clipboard.exe binary
     */
    private findRepomixBinary(): string {
        // Possible locations depending on how extension is loaded
        // In webview, __dirname is the location of webview.js in dist/
        const possiblePaths = [
            // Relative to bundled webview in dist/
            path.join(__dirname, '..', 'assets', 'bin', 'repomix-clipboard.exe'),
            path.join(__dirname, 'assets', 'bin', 'repomix-clipboard.exe'),

            // Fallback relative to current working directory
            path.join(process.cwd(), 'assets', 'bin', 'repomix-clipboard.exe'),
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }

        // Try finding via extension path if available in env
        if (process.env.REPOMIX_EXTENSION_DIR) {
            const p = path.join(process.env.REPOMIX_EXTENSION_DIR, 'assets', 'bin', 'repomix-clipboard.exe');
            if (fs.existsSync(p)) return p;
        }

        throw new Error('repomix-clipboard.exe not found in expected locations');
    }

    /**
     * Runs the binary on the temp files
     */
    private async runBinary(binaryPath: string, tempDir: string, copyMode?: 'content' | 'file'): Promise<void> {
        // Build command
        // If mode is 'content', binary expects: --generate-md --cwd <dir>
        // If mode is 'file', binary expects: --cwd <dir>
        const modeFlag = copyMode === 'file' ? '' : '--generate-md ';
        const cmd = `"${binaryPath}" ${modeFlag}--cwd "${tempDir}"`;

        console.log(`[RemoteClipboard] Running: ${cmd}`);

        try {
            const { stdout, stderr } = await execPromise(cmd, {
                timeout: 30000, // 30 second timeout
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });

            if (stdout) console.log(`[RemoteClipboard] Binary output: ${stdout}`);
            if (stderr) console.warn(`[RemoteClipboard] Binary stderr: ${stderr}`);

            // Binary should have updated Windows clipboard at this point
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
                if (fs.existsSync(dir)) {
                    fs.rmSync(dir, { recursive: true, force: true });
                    // console.log(`[RemoteClipboard] Cleaned up: ${dir}`);
                }
            } catch (error) {
                console.error(`[RemoteClipboard] Cleanup failed: ${error}`);
            }
        }, 5000); // 5 second delay to ensure binary is fully done
    }
}

// Export singleton
export const remoteClipboardHandler = new RemoteClipboardHandler();
