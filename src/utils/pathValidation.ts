import * as path from 'path';

export function validateOutputFilePath(filePath: string, cwd: string): void {
  const resolvedPath = path.resolve(cwd, filePath);
  const relativePath = path.relative(cwd, resolvedPath);

  // Check if the path traverses outside the workspace (starts with '..')
  // or is an absolute path on a different drive/root (path.isAbsolute(relativePath))
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
     throw new Error(`Security validation failed: Output path must be within the workspace directory. Path: ${resolvedPath}`);
  }
}
