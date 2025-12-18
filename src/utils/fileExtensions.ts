import * as path from 'path';

export function addFileExtension(filePath: string, style: string): string {
  const extensionMap: Record<string, string> = {
    xml: '.xml',
    markdown: '.md',
    plain: '.txt',
    json: '.json',
  };

  const expectedExt = extensionMap[style];
  if (!expectedExt) {
    return filePath;
  }

  if (filePath.endsWith(expectedExt)) {
    return filePath;
  }

  const knownExts = Object.values(extensionMap);
  const currentExt = path.extname(filePath);
  if (currentExt && knownExts.includes(currentExt)) {
    return filePath.slice(0, -currentExt.length) + expectedExt;
  }

  return filePath + expectedExt;
}
