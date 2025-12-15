import * as path from 'path';
import { Bundle } from '../core/bundles/types.js';

export function generateOutputFilename(
  bundle: Bundle,
  configFilePath: string,
  useBundleNameAsOutputName: boolean
): string {
  // If bundle has specific output defined, use it directly
  if (bundle.output) {
    return bundle.output;
  }

  // If we shouldn't use bundle name, return the original config path
  if (!useBundleNameAsOutputName) {
    return configFilePath;
  }

  // Sanitize bundle name to prevent directory traversal and ensure safe filename
  // Remove any character that is not alphanumeric, space, underscore, or dash
  // Then replace spaces with dashes and convert to lowercase
  const sanitizedBundleName = bundle.name
    .replace(/[^a-z0-9 \-_]/gi, '-') // Replace unsafe chars with dashes
    .trim()
    .replace(/[\s\-_]+/g, '-') // Collapse multiple separators
    .replace(/^-|-$/g, '') // Trim leading/trailing dashes
    .toLowerCase();

  // Parse the config file path to preserve directory structure
  const parsedPath = path.parse(configFilePath);

  // Construct new name: name + . + bundleName + ext
  // Example: repomix-output.xml -> repomix-output.bundle-name.xml
  const newName = `${parsedPath.name}.${sanitizedBundleName}${parsedPath.ext}`;

  // Recombine with the directory
  return path.join(parsedPath.dir, newName);
}
