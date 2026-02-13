import * as crypto from 'crypto';

/**
 * Generates a deterministic vector ID for a chunk.
 * Format: {repoId}:{filePath}:{chunkIndex}:{shortHash}
 *
 * The short hash is derived from the chunk text to enable:
 * - Debugging and verification
 * - Future incremental indexing (detect changed chunks)
 *
 * @param repoId Repository identifier
 * @param filePath File path relative to repo root
 * @param chunkIndex Index of the chunk within the file
 * @param chunkText Optional text of the chunk for hash generation
 * @returns Deterministic vector ID
 */
export function generateVectorId(
  repoId: string,
  branchName: string,
  filePath: string,
  chunkIndex: number,
  chunkText?: string
): string {
  let id = `${repoId}:${branchName}:${filePath}:${chunkIndex}`;

  if (chunkText) {
    const hash = crypto.createHash('sha256').update(chunkText).digest('hex');
    const shortHash = hash.substring(0, 8);
    id += `:${shortHash}`;
  }

  return id;
}

/**
 * Parses a vector ID back into its components.
 * Useful for debugging and filtering.
 */
export function parseVectorId(vectorId: string): {
  repoId: string;
  branchName: string;
  filePath: string;
  chunkIndex: number;
  shortHash?: string;
} {
  const parts = vectorId.split(':');
  if (parts.length < 4) {
    throw new Error(`Invalid vector ID format: ${vectorId}`);
  }

  const repoId = parts[0];
  const branchName = parts[1];
  const chunkIndex = parseInt(parts[parts.length - 2], 10);
  const shortHash = parts.length > 3 ? parts[parts.length - 1] : undefined;

  // Reconstruct filePath from remaining parts.
  const filePathParts = parts.slice(2, parts.length - 2);
  const filePath = filePathParts.join(':');

  return { repoId, branchName, filePath, chunkIndex, shortHash };
}

/**
 * Computes a hash of chunk text for integrity checking.
 */
export function computeTextHash(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}
