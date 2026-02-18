import * as fs from 'fs';
import * as path from 'path';

/**
 * Recursively discovers all .gitignore files in a directory tree and collects their patterns
 * with proper path scoping according to git ignore specification.
 *
 * Pattern scoping rules:
 * - Patterns without slash at the start apply recursively to all subdirectories
 * - Patterns starting with slash are relative to the .gitignore location
 * - Patterns can use double-star-slash for matching anywhere in the tree
 * - A .gitignore file only affects files in its own directory and subdirectories
 *
 * @param rootDir The root directory to search for .gitignore files
 * @returns Array of scoped ignore patterns ready to be used with glob-gitignore
 */
export function collectGitignorePatterns(rootDir: string): string[] {
  const patterns: string[] = [];

  // Find all .gitignore files using recursive walk
  const gitignoreFiles: string[] = [];

  function walkDir(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip .git directory to avoid indexing git internals
          if (entry.name === '.git') {
            continue;
          }
          walkDir(fullPath);
        } else if (entry.isFile() && entry.name === '.gitignore') {
          gitignoreFiles.push(fullPath);
        }
      }
    } catch (error) {
      // Silently skip directories we cannot read (permission issues, etc.)
      console.warn(`[collectGitignorePatterns] Warning: Could not read directory ${dir}:`, error);
    }
  }

  walkDir(rootDir);

  // Sort by depth to ensure root .gitignore is processed first (order matters for precedence)
  gitignoreFiles.sort((a, b) => {
    const depthA = a.split(path.sep).length;
    const depthB = b.split(path.sep).length;
    return depthA - depthB;
  });

  // Process each .gitignore file
  for (const gitignorePath of gitignoreFiles) {
    try {
      const relDir = path.relative(rootDir, path.dirname(gitignorePath));
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const lines = content.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#'));

      // Prefix patterns with relative directory path for proper scoping
      const prefix = relDir ? relDir.split(path.sep).join('/') + '/' : '';

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('/')) {
          // Absolute to gitignore location: /pattern -> dir/pattern
          patterns.push(prefix + trimmedLine.slice(1));
        } else if (trimmedLine.startsWith('**/')) {
          // Already global pattern - keep as-is
          patterns.push(trimmedLine);
        } else if (trimmedLine.endsWith('/')) {
          // Directory pattern: dir/ -> applies to dir and all contents
          // Add both the directory itself and recursive patterns
          patterns.push(prefix + trimmedLine);
          patterns.push(prefix + '**/' + trimmedLine);
        } else {
          // Relative pattern: pattern -> dir/pattern
          // Also add recursive version for matching in subdirectories
          patterns.push(prefix + trimmedLine);

          // For non-root .gitignore files, also allow pattern to match recursively
          // within that subdirectory tree
          if (prefix) {
            patterns.push(prefix + '**/' + trimmedLine);
          }
        }
      }

      console.log(`[collectGitignorePatterns] Loaded ${lines.length} patterns from ${path.relative(rootDir, gitignorePath)}`);
    } catch (error) {
      console.warn(`[collectGitignorePatterns] Warning: Could not read ${gitignorePath}:`, error);
    }
  }

  console.log(`[collectGitignorePatterns] Collected ${patterns.length} total patterns from ${gitignoreFiles.length} .gitignore files`);
  return patterns;
}
