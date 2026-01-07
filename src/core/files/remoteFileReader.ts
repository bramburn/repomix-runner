import * as fs from 'fs/promises';
import * as path from 'path';

export interface FileContentTransfer {
    path: string;           // Relative path from workspace root
    contentBase64: string;  // Base64 encoded content
    size: number;           // Original file size
    mtime?: number;         // Modification time
}

export interface Logger {
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

/**
 * Reads files from remote filesystem and encodes as base64
 * for safe transfer through IPC channels
 */
export async function readFilesAsBase64(
    cwd: string,
    relativeFiles: string[],
    logger?: Logger
): Promise<FileContentTransfer[]> {
    const results: FileContentTransfer[] = [];
    let totalSize = 0;

    for (const filePath of relativeFiles) {
        try {
            const absolutePath = path.join(cwd, filePath);

            // Security check: ensure path is within workspace
            const normalized = path.normalize(absolutePath);
            const normalizedCwd = path.normalize(cwd);
            if (!normalized.startsWith(normalizedCwd)) {
                logger?.warn(`Path traversal attempt blocked: ${filePath}`);
                continue;
            }

            const content = await fs.readFile(absolutePath);
            const contentBase64 = content.toString('base64');

            // Warn if single file is very large
            if (content.length > 10 * 1024 * 1024) { // 10MB
                logger?.warn(`Large file detected: ${filePath} (${(content.length / 1024 / 1024).toFixed(2)}MB)`);
            }

            totalSize += content.length;

            results.push({
                path: filePath,
                contentBase64,
                size: content.length,
            });

            logger?.debug(`Read ${filePath} (${content.length} bytes)`);
        } catch (error) {
            logger?.error(`Failed to read ${filePath}: ${error}`);
            // Continue with other files
        }
    }

    logger?.info(`Read ${results.length}/${relativeFiles.length} files (${(totalSize / 1024).toFixed(2)}KB total)`);

    // Warn if total transfer size is large
    if (totalSize > 50 * 1024 * 1024) { // 50MB
        logger?.warn(`Large total transfer size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
    }

    return results;
}

/**
 * Validates file list before reading
 */
export function validateFileList(files: string[]): { valid: boolean; error?: string } {
    if (!Array.isArray(files)) {
        return { valid: false, error: 'Files must be an array' };
    }

    if (files.length === 0) {
        return { valid: false, error: 'No files selected' };
    }

    if (files.some(f => typeof f !== 'string')) {
        return { valid: false, error: 'All files must be strings' };
    }

    // Check for path traversal attempts
    if (files.some(f => f.includes('..') || path.isAbsolute(f))) {
        return { valid: false, error: 'Invalid file paths detected' };
    }

    return { valid: true };
}
