/**
 * Targeted symbol extraction for Level 2 compression.
 * PRD 003: Context Compression Strategy
 *
 * Extracts only specific functions/classes mentioned in the goal text,
 * along with their imports and dependencies.
 */

import { LanguageParser } from '../../core/compression/LanguageParser.js';
import { logger } from '../../shared/logger.js';

/**
 * Common identifier patterns to extract from goal text.
 */
const IDENTIFIER_PATTERNS = [
  // Function/method names: functionName, myFunction, etc.
  /\b([a-z][a-zA-Z0-9]*(?:Function|Handler|Callback|Method|Service|Controller|Manager|Helper|Util)?)\b/g,
  // Class/type names: MyClass, UserService, etc.
  /\b([A-Z][a-zA-Z0-9]*(?:Service|Controller|Manager|Repository|Handler|Factory|Provider|Component|Module)?)\b/g,
  // Quoted identifiers: "functionName" or 'functionName'
  /['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g,
  // Backtick identifiers: `functionName`
  /`([a-zA-Z_][a-zA-Z0-9_]*)`/g,
];

/**
 * Common words to exclude from symbol extraction.
 */
const EXCLUDED_WORDS = new Set([
  // Common programming terms
  'function', 'class', 'const', 'let', 'var', 'import', 'export', 'return',
  'async', 'await', 'public', 'private', 'protected', 'static', 'interface',
  'type', 'enum', 'extends', 'implements', 'constructor', 'super', 'this',
  // Common words in goals
  'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'will', 'can',
  'should', 'would', 'could', 'need', 'want', 'like', 'make', 'create', 'add',
  'remove', 'update', 'delete', 'fix', 'change', 'modify', 'implement', 'use',
  'file', 'code', 'method', 'property', 'value', 'data', 'result', 'error',
  // Common type names
  'string', 'number', 'boolean', 'object', 'array', 'null', 'undefined', 'void',
  'any', 'unknown', 'never', 'true', 'false', 'Promise', 'Error', 'Date',
]);

/**
 * Parse goal text to extract potential symbol names.
 *
 * @param goalText - The goal/query text to parse
 * @returns Array of potential symbol names
 */
export function parseGoalForSymbols(goalText: string): string[] {
  const symbols = new Set<string>();

  for (const pattern of IDENTIFIER_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(goalText)) !== null) {
      const identifier = match[1];
      // Filter out excluded words and very short identifiers
      if (identifier && identifier.length >= 3 && !EXCLUDED_WORDS.has(identifier.toLowerCase())) {
        symbols.add(identifier);
      }
    }
  }

  return Array.from(symbols);
}

/**
 * Detect language from file path.
 */
function detectLanguage(filePath: string): string | null {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? '';
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    dart: 'dart',
    py: 'python',
    cs: 'csharp',
    rs: 'rust',
  };
  return languageMap[extension] ?? null;
}

/**
 * Extract targeted symbols from a file using tree-sitter.
 *
 * @param filePath - Path to the file
 * @param content - File content
 * @param targetSymbols - Symbol names to extract
 * @returns Extracted content with only the targeted symbols
 */
export async function extractTargetedSymbols(
  filePath: string,
  content: string,
  targetSymbols: string[]
): Promise<string> {
  const language = detectLanguage(filePath);
  if (!language) {
    throw new Error(`Unsupported language for file: ${filePath}`);
  }

  const parserService = LanguageParser.getInstance();
  const parser = await parserService.getParserForLang(language);

  if (!parser) {
    throw new Error(`Could not get parser for language: ${language}`);
  }

  const tree = parser.parse(content);
  const rootNode = tree.rootNode;

  // Create a set of target symbols for fast lookup (case-sensitive)
  const targetSet = new Set(targetSymbols);

  // Track extracted ranges to avoid duplicates
  const extractedRanges: Array<{ start: number; end: number; content: string }> = [];

  // Also track imports to include them
  const importRanges: Array<{ start: number; end: number; content: string }> = [];

  // Walk the AST and find matching symbols
  walkNode(rootNode, content, targetSet, extractedRanges, importRanges);

  // Build the output
  const parts: string[] = [];

  // Add all imports first
  for (const range of importRanges) {
    parts.push(range.content);
  }

  if (importRanges.length > 0) {
    parts.push(''); // Empty line after imports
  }

  // Add extracted symbols
  for (const range of extractedRanges) {
    parts.push(range.content);
    parts.push(''); // Empty line between symbols
  }

  if (parts.length === 0) {
    // No matches found, return a placeholder
    return `// No matching symbols found for: ${targetSymbols.join(', ')}`;
  }

  return parts.join('\n').trim();
}

/**
 * Walk the AST node tree and extract matching symbols.
 */
function walkNode(
  node: any,
  sourceCode: string,
  targetSet: Set<string>,
  extractedRanges: Array<{ start: number; end: number; content: string }>,
  importRanges: Array<{ start: number; end: number; content: string }>
): void {
  const nodeType = node.type;

  // Capture imports/exports
  if (
    nodeType === 'import_statement' ||
    nodeType === 'import_declaration' ||
    nodeType === 'export_statement' ||
    nodeType === 'export_declaration'
  ) {
    const content = sourceCode.slice(node.startIndex, node.endIndex);
    // Only add if not already present
    if (!importRanges.some(r => r.start === node.startIndex)) {
      importRanges.push({
        start: node.startIndex,
        end: node.endIndex,
        content,
      });
    }
    return; // Don't recurse into imports
  }

  // Check for function/class/method definitions
  if (isDefinitionNode(nodeType)) {
    const name = getNodeName(node);
    if (name && targetSet.has(name)) {
      const content = sourceCode.slice(node.startIndex, node.endIndex);
      // Only add if not already present
      if (!extractedRanges.some(r => r.start === node.startIndex)) {
        extractedRanges.push({
          start: node.startIndex,
          end: node.endIndex,
          content,
        });
      }
      return; // Don't recurse into matched definitions
    }
  }

  // Recurse into children
  for (let i = 0; i < node.childCount; i++) {
    walkNode(node.child(i), sourceCode, targetSet, extractedRanges, importRanges);
  }
}

/**
 * Check if a node type represents a definition.
 */
function isDefinitionNode(nodeType: string): boolean {
  const definitionTypes = [
    // JavaScript/TypeScript
    'function_declaration',
    'method_definition',
    'class_declaration',
    'interface_declaration',
    'type_alias_declaration',
    'enum_declaration',
    'arrow_function',
    'lexical_declaration',
    'variable_declaration',
    // Python
    'function_definition',
    'class_definition',
    // Rust
    'function_item',
    'struct_item',
    'enum_item',
    'impl_item',
    'trait_item',
    // C#
    'method_declaration',
    'class_declaration',
    'interface_declaration',
    // Dart
    'function_signature',
    'class_definition',
  ];
  return definitionTypes.includes(nodeType);
}

/**
 * Get the name of a definition node.
 */
function getNodeName(node: any): string | null {
  // Try common patterns for getting the name
  const nameNode =
    node.childForFieldName?.('name') ||
    node.namedChildren?.find((c: any) => c.type === 'identifier' || c.type === 'property_identifier');

  if (nameNode) {
    return nameNode.text;
  }

  // For variable declarations, look deeper
  if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
    const declarator = node.namedChildren?.find(
      (c: any) => c.type === 'variable_declarator' || c.type === 'lexical_binding'
    );
    if (declarator) {
      const name = declarator.childForFieldName?.('name') ||
        declarator.namedChildren?.find((c: any) => c.type === 'identifier');
      if (name) {
        return name.text;
      }
    }
  }

  return null;
}
