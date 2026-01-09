import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export type OperatingSystem = NodeJS.Platform | 'unknown';

export interface RemoteEnvironment {
    isRemote: boolean;
    remoteName?: string; // 'ssh', 'wsl', 'dev-container', 'codespaces'
    localOs: OperatingSystem; // 'win32', 'darwin', 'linux'
    localArch: string; // 'x64', 'arm64'
}

// Module-level cache for client OS info
let cachedClientOs: OperatingSystem | null = null;
let cachedClientArch: string | null = null;

/**
 * Sets the client OS information (called from webview IPC handler)
 */
export function setClientInfo(os: OperatingSystem, arch: string): void {
    cachedClientOs = os;
    cachedClientArch = arch;
}

/**
 * Detects whether VS Code is running in remote mode
 * and what the client OS is
 */
export function getRemoteEnvironment(): RemoteEnvironment {
    const isRemote = vscode.env.remoteName !== undefined;

    // Use cached client info if available (from webview), otherwise fall back to process (local only)
    const clientOs = cachedClientOs || process.platform;
    const clientArch = cachedClientArch || process.arch;

    return {
        isRemote,
        remoteName: vscode.env.remoteName,
        localOs: clientOs,
        localArch: clientArch,
    };
}

/**
 * Determines if we should use local binary execution
 * Only for: SSH remote with binary available for local platform
 */
export function shouldUseLocalBinaryExecution(env: RemoteEnvironment): boolean {
    // Use local binary if:
    // 1. We're in remote mode (SSH, not WSL or Dev Container)
    // 2. The local client platform is supported (Windows, macOS, Linux)

    // Note: For SSH remotes, the binary exists on the CLIENT's machine (where the webview runs),
    // not on the remote server. The hasBinaryForPlatform check runs on the remote server,
    // so we skip it for SSH remotes and assume the client has the binary (it's bundled with the extension).
    const isSshRemote = env.isRemote && env.remoteName?.startsWith('ssh') === true;

    if (isSshRemote) {
        // For SSH remotes, use local binary if the client OS is supported
        // The actual binary check happens on the client side in the webview
        return env.localOs === 'win32' || env.localOs === 'darwin' || env.localOs === 'linux';
    }

    // For non-SSH (local development), check if binary exists
    return hasBinaryForPlatform(env.localOs, env.localArch);
}

/**
 * Determines if we should use remote npx approach
 * For everything else
 */
export function shouldUseRemoteNpx(env: RemoteEnvironment): boolean {
    return !shouldUseLocalBinaryExecution(env);
}

/**
 * Gets platform-specific binary name
 */
export function getBinaryName(platform: OperatingSystem, arch: string): string {
    const ext = platform === 'win32' ? '.exe' : '';
    return `repomix-clipboard-${platform}-${arch}${ext}`;
}

/**
 * Checks if binary exists for the given platform and architecture
 */
export function hasBinaryForPlatform(platform: OperatingSystem, arch: string): boolean {
    const binaryName = getBinaryName(platform, arch);

    // Check multiple possible locations
    const possiblePaths = [
        // Development
        path.join(__dirname, '..', '..', '..', 'assets', 'bin', binaryName),
        path.join(__dirname, '..', '..', 'assets', 'bin', binaryName),

        // Production (bundled)
        path.join(process.env.REPOMIX_EXTENSION_DIR || '', 'assets', 'bin', binaryName),

        // Relative to process cwd
        path.resolve(process.cwd(), 'assets', 'bin', binaryName),
    ];

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            return true;
        }
    }

    return false;
}

/**
 * Gets the remote name (ssh, wsl, etc.)
 */
export function getRemoteName(): string | undefined {
    return vscode.env.remoteName;
}

/**
 * Checks if the local client is Windows
 */
export function isWindowsClient(): boolean {
    return process.platform === 'win32';
}

/**
 * Checks if the local client is macOS
 */
export function isMacOSClient(): boolean {
    return process.platform === 'darwin';
}

/**
 * Checks if the local client is Linux
 */
export function isLinuxClient(): boolean {
    return process.platform === 'linux';
}
