import * as path from 'path';
import { normalizeOutputStyle } from './normalizeOutputStyle';

export function addFileExtension(filePath: string, style: string): string {
  const normalized = normalizeOutputStyle(style);
  const extensionMap: Record<string, string> = {
    xml: '.xml',
    markdown: '.md',
    plain: '.txt',
    json: '.json',
  };

  const expectedExt = extensionMap[normalized];
  if (!expectedExt) return filePath;

  // ✅ NEW: if the user already specified ANY extension, respect it.
  // (This is the key behavior change.)
  const currentExt = path.extname(filePath);
  if (currentExt) {
    return filePath;
  }

  // No extension provided -> add one based on style
  return filePath.endsWith(expectedExt) ? filePath : filePath + expectedExt;
}
