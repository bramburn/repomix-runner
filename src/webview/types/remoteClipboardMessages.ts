/**
 * Message from extension (remote) to webview (local)
 * Sends file contents that need to be written to temp and processed locally
 */
export interface ProcessRemoteFilesMessage {
    command: 'processRemoteFilesForClipboard';

    files: Array<{
        path: string;           // Relative path (e.g., 'src/app.ts')
        contentBase64: string;  // Base64 encoded content
        size: number;           // Original size in bytes
    }>;

    workspaceName?: string;   // For uniqueness in temp dirs
    timeout?: number;         // Timeout in ms (default 30000)
    resolverKey?: string;     // Key to resolve promise in extension
}

/**
 * Message from webview (local) back to extension (remote)
 * Reports results of local binary execution
 */
export interface RemoteClipboardProcessingResult {
    command: 'remoteClipboardProcessingComplete';

    success: boolean;

    // On success
    filesProcessed?: number;
    tempDirectory?: string;
    binaryOutput?: string;

    // On error
    error?: string;
    failedAt?: 'decode' | 'tempWrite' | 'binaryExecution' | 'cleanup';

    // Resolver key to match with promise
    resolverKey?: string;
}

/**
 * Message from webview during processing
 * For status updates and user feedback
 */
export interface ProcessingStatusMessage {
    command: 'processingStatus';
    status: 'started' | 'decoded' | 'tempFilesCreated' | 'binaryRunning' | 'cleaning';
    progress?: number; // 0-100
    message?: string;
}
