import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface RemoteEnvironment {
    isRemote: boolean;
    remoteName?: string; // 'ssh', 'wsl', 'dev-container', 'codespaces'
    localOs: NodeJS.Platform; // 'win32', 'darwin', 'linux'
    localArch: string; // 'x64', 'arm64'
}

/**
 * Detects whether VS Code is running in remote mode
 * and what the client OS is
 */
export function getRemoteEnvironment(): RemoteEnvironment {
    const isRemote = vscode.env.remoteName !== undefined;

    return {
        isRemote,
        remoteName: vscode.env.remoteName,
        localOs: process.platform,
        localArch: process.arch,
    };
}

/**
 * Determines if we should use local binary execution
 * Only for: SSH remote with binary available for local platform
 */
export function shouldUseLocalBinaryExecution(env: RemoteEnvironment): boolean {
    // Use local binary if:
    // 1. We're in remote mode (SSH, not WSL or Dev Container)
    // 2. We have a binary for the local platform
    return (
        env.isRemote &&
        env.remoteName === 'ssh' &&
        hasBinaryForPlatform(env.localOs, env.localArch)
    );
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
export function getBinaryName(platform: NodeJS.Platform, arch: string): string {
    const ext = platform === 'win32' ? '.exe' : '';
    return `repomix-clipboard-${platform}-${arch}${ext}`;
}

/**
 * Checks if binary exists for the given platform and architecture
 */
export function hasBinaryForPlatform(platform: NodeJS.Platform, arch: string): boolean {
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
