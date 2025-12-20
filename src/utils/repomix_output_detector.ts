import * as fs from 'fs';
import * as path from 'path';

/**
 * Interface representing the structure of repomix.config.json
 */
interface RepomixConfig {
  output?: {
    filePath?: string;
    style?: 'xml' | 'markdown' | 'plain' | 'json';
  };
}

/**
 * Detects the output file path for Repomix based on configuration or defaults.
 * * Logic Priority:
 * 1. checks repomix.config.json for specific `output.filePath`
 * 2. checks repomix.config.json for `output.style` and derives extension
 * 3. Fallbacks to checking file existence on disk (md -> txt -> json -> xml)
 * 4. Defaults to 'repomix-output.xml'
 * * @param workspaceRoot The root directory of the workspace/project
 * @returns The absolute path to the generated bundle file
 */
export function getRepomixOutputPath(workspaceRoot: string): string {
  const configPath = path.join(workspaceRoot, 'repomix.config.json');
  
  // 1. Try to read the configuration file
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, 'utf-8');
      const config: RepomixConfig = JSON.parse(configContent);

      // Case A: User explicitly defined a custom file path (e.g., "my-bundle.md")
      if (config.output?.filePath) {
        return path.resolve(workspaceRoot, config.output.filePath);
      }

      // Case B: User defined a style, so we infer the extension
      if (config.output?.style) {
        const style = config.output.style;
        switch (style) {
          case 'markdown':
            return path.join(workspaceRoot, 'repomix-output.md');
          case 'plain':
            return path.join(workspaceRoot, 'repomix-output.txt');
          case 'json':
            return path.join(workspaceRoot, 'repomix-output.json');
          case 'xml':
          default:
            return path.join(workspaceRoot, 'repomix-output.xml');
        }
      }
    } catch (error) {
      console.warn('Failed to parse repomix.config.json, falling back to file existence check.', error);
    }
  }

  // 2. Fallback: If no config (or parse error), check which file actually exists
  // We check Markdown first as it's a common alternative preference
  const possibleFiles = [
    'repomix-output.md',
    'repomix-output.txt',
    'repomix-output.json',
    'repomix-output.xml' 
  ];

  for (const fileName of possibleFiles) {
    const fullPath = path.join(workspaceRoot, fileName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  // 3. Absolute Default (Standard Repomix behavior)
  return path.join(workspaceRoot, 'repomix-output.xml');
}

/**
 * Example Usage inside your Webview or Command Handler
 */
/*
// Inside your extension's "Copy" command handler:
const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
if (workspaceFolder) {
  const bundlePath = getRepomixOutputPath(workspaceFolder);
  
  if (fs.existsSync(bundlePath)) {
    const content = fs.readFileSync(bundlePath, 'utf-8');
    // ... execute your copy logic here ...
    console.log(`Successfully copied content from: ${path.basename(bundlePath)}`);
  } else {
    console.error(`Could not find Repomix output at: ${bundlePath}`);
  }
}
*/