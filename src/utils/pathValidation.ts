import * as path from 'path';

/**
 * Validates that the output file path is safe and contained within the workspace root.
 * Throws an error if the path is invalid or attempts traversal outside the root.
 *
 * @param filePath The path to the output file (relative or absolute)
 * @param rootDir The root directory of the workspace
 */
export function validateOutputFilePath(filePath: string, rootDir: string): void {
  // Normalize the root directory path
  const normalizedRoot = path.resolve(rootDir);

  // Resolve the full path of the output file
  const resolvedPath = path.resolve(normalizedRoot, filePath);

  // Calculate the relative path from the root to the resolved path
  const relative = path.relative(normalizedRoot, resolvedPath);

  // Check if the path attempts to go outside the root
  // We check for:
  // 1. Starts with '..' (traversal up)
  // 2. Is absolute (on Windows, relative path across drives returns absolute path)
  // We also ensure that we don't accidentally flag '..foo' as invalid traversal,
  // so we check if it is exactly '..' or starts with '..' + separator.
  const isTraversal = relative === '..' || relative.startsWith('..' + path.sep);

  if (isTraversal || path.isAbsolute(relative)) {
    throw new Error(`Invalid output path: ${filePath}. Output file must be within the workspace root.`);
  }
}
