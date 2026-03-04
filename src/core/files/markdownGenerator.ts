import * as path from 'path';
import * as fs from 'fs';
import { encode } from 'gpt-tokenizer';
import { ProcessedFile } from '../../agent/state.js';

/**
 * List of binary file extensions to skip
 */
const BINARY_EXTENSIONS = new Set([
    // Executables
    '.exe', '.dll', '.so', '.dylib', '.app', '.bin',
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg', '.webp',
    // Videos
    '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.webm',
    // Audio
    '.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a',
    // Archives
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
    // Documents (binary formats)
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    // Fonts
    '.ttf', '.otf', '.woff', '.woff2', '.eot',
    // Other binary files
    '.sqlite', '.db', '.jar', '.war', '.ear', '.class', '.pyc', '.pyo',
    '.obj', '.lib', '.pdb', '.idb', '.suo', '.sln', '.dmg', '.pkg',
]);

/**
 * Known text basenames (including dotfiles) that often have NO extension.
 */
const TEXT_BASENAMES = new Set([
    // Docs
    'readme', 'license', 'changelog',
    // Build / tooling
    'makefile', 'dockerfile', 'podfile', 'gemfile', 'fastfile', 'appfile', 'brewfile',
    // iOS / CocoaPods
    'podfile.lock',
    // Python
    'pipfile', 'pipfile.lock',
    // Rust
    'cargo.toml', 'cargo.lock',
    // JS
    'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    // Java / Android
    'gradle.properties', 'settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts',
    // Dotfiles
    '.env', '.env.local', '.env.development', '.env.production', '.env.test',
    '.gitignore', '.gitattributes', '.gitmodules',
    '.editorconfig', '.npmrc', '.nvmrc',
    '.prettierrc', '.prettierignore', '.eslintrc', '.eslintignore',
].map((s) => s.toLowerCase()));

/**
 * List of text-based file extensions to process
 */
const TEXT_EXTENSIONS = new Set([
    // Code files
    '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
    '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.kts', '.scala', '.dart',
    '.m', '.mm',
    // Web / markup
    '.html', '.htm', '.css', '.scss', '.sass', '.less', '.styl',
    '.xml',
    // Data / config
    '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.properties', '.env',
    '.plist', '.xcconfig', '.pbxproj',
    '.sql', '.graphql', '.gql', '.proto',
    // Docs / plain text
    '.md', '.mdx', '.txt', '.log',
    // Shell / scripts
    '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat', '.cmd',
]);

/**
 * Check if a file is likely a binary file.
 */
export function isBinaryFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();

    if (BINARY_EXTENSIONS.has(ext)) { return true; }
    if (TEXT_EXTENSIONS.has(ext)) { return false; }
    if (TEXT_BASENAMES.has(basename)) { return false; }
    if (basename === 'readme' || basename === 'license' || basename === 'changelog') { return false; }
    if (!ext) { return true; }
    return true;
}

/**
 * Calculates token count for content using GPT tokenizer
 */
export async function calculateTokenCount(content: string): Promise<number> {
    try {
        const tokens = encode(content);
        return tokens.length;
    } catch (error) {
        throw new Error(`Failed to calculate token count: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Generates markdown by concatenating files.
 */
export async function generateMarkdownContent(
    cwd: string,
    relativeFiles: string[]
): Promise<{ concatenated: string; tokenCount: number }> {
    const entries: string[] = [];

    for (const relativeFile of relativeFiles) {
        const fullPath = path.join(cwd, relativeFile);

        if (!fs.existsSync(fullPath)) {
            entries.push(`## ${relativeFile}\n\n> File not found`);
            continue;
        }

        const stats = await fs.promises.stat(fullPath).catch(() => null);
        if (!stats || !stats.isFile()) {
            entries.push(`## ${relativeFile}\n\n> Not a file`);
            continue;
        }

        if (isBinaryFile(relativeFile)) {
            console.log(`[Repomix] Skipping binary file: ${relativeFile}`);
            continue;
        }

        try {
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            entries.push(`<file path="${relativeFile}">${content}</file>`);
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            entries.push(`## ${relativeFile}\n\n> Error reading file: ${errorMsg}`);
        }
    }

    if (entries.length === 0) {
        throw new Error('No text files could be read (all files may be binary)');
    }

    const concatenated = entries.join('\n\n');
    const tokenCount = await calculateTokenCount(concatenated);

    return { concatenated, tokenCount };
}

/**
 * Generates structured markdown output with tiered context.
 * 
 * Output is organized into sections:
 * 1. Architecture - Blueprint summary
 * 2. Active Context (Full Code) - Tier A files
 * 3. Structure & Interfaces (Skeletons) - Tier B files  
 * 4. Supporting Summaries - Tier C files
 */
export async function generateStructuredOutput(
    processedFiles: ProcessedFile[],
    blueprintSummary: string,
    userQuery: string
): Promise<{ content: string; tokenCount: number }> {
    const sections: string[] = [];

    // Header
    sections.push(`# Context for: ${userQuery}\n`);

    // Section 1: Architecture
    if (blueprintSummary && blueprintSummary.trim()) {
        sections.push(`## 1. Architecture\n\n${blueprintSummary}\n`);
    }

    // Group files by compression level
    const fullFiles = processedFiles.filter(f => f.compressionLevel === 'full');
    const skeletonFiles = processedFiles.filter(f => f.compressionLevel === 'skeleton');
    const summaryFiles = processedFiles.filter(f => f.compressionLevel === 'summary');

    // Section 2: Active Context (Full Code)
    if (fullFiles.length > 0) {
        sections.push(`## 2. Active Context (Full Code)\n`);
        sections.push(`The following ${fullFiles.length} file(s) are critical to your request and are provided in full.\n`);
        
        for (const file of fullFiles) {
            sections.push(`### ${file.path}\n`);
            sections.push(`<file path="${file.path}">\n${file.content}\n</file>\n`);
        }
    }

    // Section 3: Structure & Interfaces (Skeletons)
    if (skeletonFiles.length > 0) {
        sections.push(`## 3. Structure & Interfaces (Skeletons)\n`);
        sections.push(`The following ${skeletonFiles.length} file(s) provide type contracts and signatures referenced by the active context.\n`);
        
        for (const file of skeletonFiles) {
            sections.push(`### ${file.path}\n`);
            sections.push(`<file path="${file.path}" compression="skeleton">\n${file.content}\n</file>\n`);
        }
    }

    // Section 4: Supporting Summaries
    if (summaryFiles.length > 0) {
        sections.push(`## 4. Supporting Summaries\n`);
        sections.push(`High-level descriptions of ${summaryFiles.length} peripheral file(s) for context.\n`);
        
        for (const file of summaryFiles) {
            // Extract summary content (it starts with "// File:" and "// Summary:")
            const summaryLine = file.content.split('\n').find(line => line.startsWith('// Summary:'));
            const summary = summaryLine ? summaryLine.replace('// Summary:', '').trim() : file.content;
            sections.push(`- **${file.path}**: ${summary}`);
        }
        sections.push('');
    }

    const content = sections.join('\n');
    const tokenCount = await calculateTokenCount(content);

    return { content, tokenCount };
}
