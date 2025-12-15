import * as path from 'path';

/**
 * Validates that the output file path is within the workspace root to prevent path traversal.
 * @param outputFilePath The potential output path (relative or absolute).
 * @param workspaceRoot The root directory of the workspace.
 * @throws Error if the path attempts to traverse outside the workspace root.
 */
export function validateOutputFilePath(outputFilePath: string, workspaceRoot: string): void {
  // 1. Resolve the full, absolute path of the output file
  const resolvedPath = path.resolve(workspaceRoot, outputFilePath);

  // 2. Determine the path from the workspace root to the resolved path.
  // path.relative is the most reliable way to check for path containment.
  const relative = path.relative(workspaceRoot, resolvedPath);

  // 3. Security Check: Check for path traversal or paths on a different Windows drive.
  // - A relative path starting with '..' means it has traversed out of the root.
  // - path.isAbsolute(relative) is true on Windows if the path is on a different drive (e.g., C:\ to D:\).
  const isOutside = relative.startsWith('..') || path.isAbsolute(relative);

  if (isOutside) {
    throw new Error(`Security Violation: Output path '${outputFilePath}' resolves to '${resolvedPath}', which is outside the workspace root.`);
  }
}