import * as path from 'path';

/**
 * Validates that the output file path is secure and contained within the workspace.
 *
 * @param outputFilePath - The absolute path to the output file
 * @param workspaceRoot - The root directory of the workspace
 * @throws Error if the path is invalid or insecure
 */
export function validateOutputFilePath(outputFilePath: string, workspaceRoot: string): void {
  // Ensure workspaceRoot is absolute
  const absoluteWorkspaceRoot = path.resolve(workspaceRoot);

  // Resolve the output file path to be sure it's absolute and normalized
  const resolvedOutputPath = path.resolve(absoluteWorkspaceRoot, outputFilePath);

  // Check if the resolved path starts with the workspace root
  // We use `path.relative` to check containment.
  // If the relative path starts with '..', it's outside.
  // Also on Windows, it handles drive letters.
  const relativePath = path.relative(absoluteWorkspaceRoot, resolvedOutputPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Security Violation: Output path "${outputFilePath}" attempts to traverse outside the workspace root "${absoluteWorkspaceRoot}".`);
  }

  // Additional check: Ensure we are not overwriting critical files (optional, but good practice)
  // For now, we focus on directory traversal.
}
