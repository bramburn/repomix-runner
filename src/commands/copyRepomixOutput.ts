import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface RepomixConfig {
    output?: {
        filePath?: string;
        style?: string;
    };
}

/**
 * Command handler to find the Repomix output file and copy it to the clipboard.
 * It prioritizes reading the repomix.config.json file to determine the correct output path.
 */
export async function copyRepomixOutput() {
    // 1. Ensure we have a workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('Repomix Copy: No workspace folder is open.');
        return;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;

    try {
        // 2. Resolve the correct output file path
        const outputFilePath = await resolveRepomixOutput(rootPath);

        // 3. Check if the file actually exists
        if (!fs.existsSync(outputFilePath)) {
            const fileName = path.basename(outputFilePath);
            vscode.window.showErrorMessage(
                `Repomix output file not found: ${fileName}\n` +
                `Expected path: ${outputFilePath}\n` +
                `Please run 'repomix' to generate the file first.`
            );
            return;
        }

        // 4. Read the content
        const content = await fs.promises.readFile(outputFilePath, 'utf-8');

        if (!content) {
            vscode.window.showWarningMessage(`The Repomix output file (${path.basename(outputFilePath)}) is empty.`);
            return;
        }

        // 5. Copy to clipboard
        await vscode.env.clipboard.writeText(content);
        vscode.window.showInformationMessage(`Successfully copied ${path.basename(outputFilePath)} to clipboard!`);

    } catch (error) {
        vscode.window.showErrorMessage(
            `Failed to copy Repomix output: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

/**
 * Determines the expected output file path.
 * Priority:
 * 1. 'output.filePath' from repomix.config.json
 * 2. Common default filenames (fallback)
 */
async function resolveRepomixOutput(rootPath: string): Promise<string> {
    const configPath = path.join(rootPath, 'repomix.config.json');

    // Strategy A: Read from configuration file (Best Practice)
    if (fs.existsSync(configPath)) {
        try {
            const configContent = await fs.promises.readFile(configPath, 'utf-8');
            // Use JSON.parse (Add try-catch or jsonc-parser if your config uses comments)
            const config = JSON.parse(configContent) as RepomixConfig;

            if (config.output && config.output.filePath) {
                // Resolve relative path against workspace root
                return path.resolve(rootPath, config.output.filePath);
            }
        } catch (e) {
            console.warn('Repomix Copy: Failed to parse repomix.config.json. Falling back to defaults.', e);
        }
    }

    // Strategy B: Check for common generated files if config is missing or unreadable
    // We check these in order of likelihood based on Repomix defaults
    const candidates = [
        'repomix-output-all.md', // Common custom name
        'repomix-output.md',     // Default Markdown
        'repomix-output.xml',    // Default XML
        'repomix-output.txt',    // Default Text
        'repomix-output.json'    // Default JSON
    ];

    for (const candidate of candidates) {
        const candidatePath = path.join(rootPath, candidate);
        if (fs.existsSync(candidatePath)) {
            return candidatePath;
        }
    }

    // Default Fallback: If nothing exists, return the path that SHOULD exist based on config
    // or default to .md so the error message guides the user correctly.
    return path.join(rootPath, 'repomix-output.md');
}