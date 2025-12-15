import * as path from 'path';

/**
 * Validates that the output file path is within the workspace root to prevent path traversal.
 * @param outputFilePath The potential output path (relative or absolute).
 * @param workspaceRoot The root directory of the workspace.
 * @throws Error if the path attempts to traverse outside the workspace root.
 */
export function validateOutputFilePath(outputFilePath: string, workspaceRoot: string): void {
  // 1. Resolve absolute paths for both inputs
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedOutput = path.resolve(resolvedRoot, outputFilePath);

  // 2. Security Check: Ensure resolved output starts with resolved root
  // The 'path.sep' check ensures we don't match partial folder names (e.g. /root/secret vs /root_public)
  // We also allow if the output IS the root itself (edge case)
  if (!resolvedOutput.startsWith(resolvedRoot + path.sep) && resolvedOutput !== resolvedRoot) {
    throw new Error(`Security Error: Output path '${outputFilePath}' attempts to write outside the workspace root.`);
  }
}
