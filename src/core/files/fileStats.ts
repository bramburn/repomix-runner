import * as fs from 'fs/promises';
import * as path from 'path';

interface FileStats {
  files: number;
  folders: number;
  totalSize: number;
}

// Simple in-memory cache: bundleId -> FileStats
const statsCache = new Map<string, FileStats>();

// Helper to clear cache (e.g., when a bundle is updated)
export function invalidateStatsCache(bundleId?: string) {
  if (bundleId) {
    statsCache.delete(bundleId);
  } else {
    statsCache.clear();
  }
}

export function getCachedBundleStats(bundleId: string): FileStats | undefined {
  return statsCache.get(bundleId);
}

async function getPathStats(filePath: string): Promise<FileStats> {
  const stats: FileStats = { files: 0, folders: 0, totalSize: 0 };

  try {
    const fileStat = await fs.stat(filePath);

    if (fileStat.isDirectory()) {
      stats.folders = 1; // Count the folder itself

      const entries = await fs.readdir(filePath);
      for (const entry of entries) {
        const entryPath = path.join(filePath, entry);
        const childStats = await getPathStats(entryPath);
        stats.files += childStats.files;
        stats.folders += childStats.folders;
        stats.totalSize += childStats.totalSize;
      }
    } else {
      stats.files = 1;
      stats.totalSize = fileStat.size;
    }
  } catch (error) {
    // If file doesn't exist or access denied, ignore it
  }

  return stats;
}

export async function calculateBundleStats(cwd: string, bundleId: string, filePaths: string[]): Promise<FileStats> {
  // Check cache first
  if (statsCache.has(bundleId)) {
    return statsCache.get(bundleId)!;
  }

  const totalStats: FileStats = { files: 0, folders: 0, totalSize: 0 };

  for (const relativePath of filePaths) {
    const absolutePath = path.resolve(cwd, relativePath);
    const itemStats = await getPathStats(absolutePath);

    totalStats.files += itemStats.files;
    totalStats.folders += itemStats.folders;
    totalStats.totalSize += itemStats.totalSize;
  }

  statsCache.set(bundleId, totalStats);
  return totalStats;
}
