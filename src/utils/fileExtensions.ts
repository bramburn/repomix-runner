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

  const currentExt = path.extname(filePath);

  // If the file has no extension, or has an extension that we manage (xml, md, txt, json)
  // but it doesn't match the expected one for the current style, update it.
  const managedExtensions = Object.values(extensionMap);
  if (!currentExt || managedExtensions.includes(currentExt)) {
    if (filePath.endsWith(expectedExt)) {
      return filePath;
    }
    // Swap extension or add it
    const base = currentExt ? filePath.slice(0, -currentExt.length) : filePath;
    return base + expectedExt;
  }

  // If it's a completely custom extension (like .myext), respect it.
  return filePath;
}
