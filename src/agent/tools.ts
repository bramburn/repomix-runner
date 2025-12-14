import * as fs from 'fs/promises';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { execPromisify } from '../shared/execPromisify';
import { logger } from '../shared/logger';

// Initialize XML Parser
// We don't ignore attributes because we need the 'path' attribute from <file path="...">
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

/**
 * Step 1 Tool: Generates the compressed context file.
 * Runs `repomix --compress --style xml` to create a lightweight representation of the repo.
 */
export async function runRepomixCompress(cwd: string): Promise<string> {
  // We use a unique temp name for the context file
  const contextFileName = `repomix-agent-context-${Date.now()}.xml`;

  // --compress: extracts only signatures/interfaces (saves tokens)
  // --style xml: easier to machine-parse than markdown
  // --no-file-summary: we only want the file list and content
  const cmd = `npx repomix --compress --style xml --no-file-summary --output "${contextFileName}"`;

  logger.both.info(`Agent: Generating context with command: ${cmd}`);

  // Execute in the user's workspace root
  await execPromisify(cmd, { cwd });

  return path.join(cwd, contextFileName);
}

/**
 * Step 2 Tool: Extracts the directory structure (list of files).
 * Reads the XML output and returns a flat array of file paths.
 */
export async function parseDirectoryStructure(contextFilePath: string): Promise<string[]> {
  try {
    const xmlContent = await fs.readFile(contextFilePath, 'utf-8');
    const parsed = parser.parse(xmlContent);

    // Repomix XML structure: <files><file path="...">...</file></files>
    const fileNodes = parsed?.files?.file;

    if (!fileNodes) {
        logger.both.warn("Agent: No files found in context XML.");
        return [];
    }

    // fast-xml-parser returns an object if there's only one child, or an array if multiple.
    const filesArray = Array.isArray(fileNodes) ? fileNodes : [fileNodes];

    // Extract the 'path' attribute (prefixed with @_ due to parser config)
    const paths = filesArray
      .map((node: any) => node['@_path'])
      .filter((p: string) => !!p);

    return paths;
  } catch (error) {
    logger.both.error("Agent: Failed to parse directory structure", error);
    return [];
  }
}

/**
 * Step 4 Tool: Content Retrieval.
 * Fetches the compressed content of specific files from the Context XML.
 * This avoids feeding the entire codebase to the LLM.
 */
export async function extractFileContents(contextFilePath: string, targetPaths: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  try {
    const xmlContent = await fs.readFile(contextFilePath, 'utf-8');
    const parsed = parser.parse(xmlContent);

    const fileNodes = parsed?.files?.file;
    if (!fileNodes) return results;

    const filesArray = Array.isArray(fileNodes) ? fileNodes : [fileNodes];

    // Create a lookup set for O(1) access
    const targets = new Set(targetPaths);

    for (const node of filesArray) {
      const path = node['@_path'];
      if (targets.has(path)) {
        // The text content of the node is the file content
        // fast-xml-parser puts text content in '#text' if there are attributes
        const content = node['#text'] || "";
        results.set(path, content);
      }
    }
  } catch (error) {
    logger.both.error("Agent: Failed to extract file contents", error);
  }

  return results;
}