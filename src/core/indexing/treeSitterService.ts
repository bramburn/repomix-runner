/**
 * Tree-sitter service for semantic code parsing and analysis.
 * 
 * This service provides language-aware code parsing capabilities using tree-sitter.
 * It enables semantic chunking and code skeleton generation by understanding code structure.
 * 
 * Supported languages: JavaScript, TypeScript, Python, Rust, C#, Dart
 */

import * as path from 'path';

export interface TreeSitterConfig {
  wasmDir?: string;
  languages?: string[];
}

export interface CodeSymbol {
  type: 'function' | 'class' | 'method' | 'interface' | 'module' | 'other';
  name: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
}

/**
 * Node types that contain function/method bodies that should be folded
 */
const FOLDABLE_NODE_TYPES: Record<string, string[]> = {
  typescript: [
    'function_declaration',
    'method_definition', 
    'arrow_function',
    'function_expression',
    'generator_function_declaration',
  ],
  javascript: [
    'function_declaration',
    'method_definition',
    'arrow_function', 
    'function_expression',
    'generator_function_declaration',
  ],
  python: [
    'function_definition',
    'async_function_definition',
  ],
  rust: [
    'function_item',
  ],
  csharp: [
    'method_declaration',
    'constructor_declaration',
  ],
  dart: [
    'function_body',
    'method_signature',
  ],
};

/**
 * Node types that represent body blocks to be replaced
 */
const BODY_NODE_TYPES: Record<string, string[]> = {
  typescript: ['statement_block', 'function_body'],
  javascript: ['statement_block', 'function_body'],
  python: ['block'],
  rust: ['block'],
  csharp: ['block'],
  dart: ['block', 'function_body'],
};

/**
 * Tree-sitter service for code analysis and skeleton generation
 */
export class TreeSitterService {
  private config: TreeSitterConfig;
  private initialized: boolean = false;
  private parserCache: Map<string, any> = new Map();
  private languageCache: Map<string, any> = new Map();
  private wasmDirectory: string;
  private ParserClass: any = null;

  constructor(config: TreeSitterConfig = {}) {
    this.config = {
      wasmDir: config.wasmDir || './tree-sitter-wasm',
      languages: config.languages || ['javascript', 'typescript', 'python', 'rust', 'csharp', 'dart'],
    };
    this.wasmDirectory = this.config.wasmDir!;
  }

  /**
   * Set the WASM directory path (useful for runtime configuration)
   */
  setWasmDirectory(wasmDir: string): void {
    this.wasmDirectory = wasmDir;
  }

  /**
   * Initialize the tree-sitter service
   * Must be called before using parsing methods
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // Dynamic import for web-tree-sitter (CommonJS module)
      const TreeSitter = require('web-tree-sitter');
      await TreeSitter.init();
      this.ParserClass = TreeSitter;
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize tree-sitter:', error);
      throw error;
    }
  }

  /**
   * Load and cache a language parser
   */
  private async loadLanguage(language: string): Promise<any | null> {
    // Check cache first
    if (this.languageCache.has(language)) {
      return this.languageCache.get(language)!;
    }

    if (!this.ParserClass) {
      console.warn('TreeSitterService not initialized');
      return null;
    }

    // Map language to WASM file name
    const wasmFileName = this.getWasmFileName(language);
    if (!wasmFileName) {
      console.warn(`Unsupported language for tree-sitter: ${language}`);
      return null;
    }

    try {
      const wasmPath = path.join(this.wasmDirectory, wasmFileName);
      const lang = await this.ParserClass.Language.load(wasmPath);
      this.languageCache.set(language, lang);
      return lang;
    } catch (error) {
      console.warn(`Failed to load tree-sitter language ${language}:`, error);
      return null;
    }
  }

  /**
   * Get or create a parser for a specific language
   */
  private async getParser(language: string): Promise<any | null> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.ParserClass) {
      return null;
    }

    // Check cache
    if (this.parserCache.has(language)) {
      return this.parserCache.get(language)!;
    }

    // Load language
    const lang = await this.loadLanguage(language);
    if (!lang) {
      return null;
    }

    // Create and cache parser
    const parser = new this.ParserClass.Parser();
    parser.setLanguage(lang);
    this.parserCache.set(language, parser);
    return parser;
  }

  /**
   * Get WASM file name for a language
   */
  private getWasmFileName(language: string): string | null {
    const mapping: Record<string, string> = {
      javascript: 'javascript.wasm',
      typescript: 'typescript.wasm',
      python: 'python.wasm',
      rust: 'rust.wasm',
      csharp: 'csharp.wasm',
      dart: 'dart.wasm',
    };
    return mapping[language.toLowerCase()] || null;
  }

  /**
   * Parse source code into an AST
   */
  async parseCode(code: string, language: string): Promise<any | null> {
    const parser = await this.getParser(language);
    if (!parser) {
      return null;
    }

    try {
      return parser.parse(code);
    } catch (error) {
      console.warn(`Failed to parse code as ${language}:`, error);
      return null;
    }
  }

  /**
   * Generate a code skeleton by folding function/method bodies
   * 
   * Preserves:
   * - Function/method signatures
   * - Return types
   * - Decorators/attributes
   * - JSDoc/docstring comments
   * - Class/interface declarations
   * 
   * Replaces:
   * - Function/method body content with placeholder comment
   * 
   * @param code Source code to process
   * @param language Programming language
   * @returns Folded code skeleton, or original code if parsing fails
   */
  async generateSkeleton(code: string, language: string): Promise<string> {
    const normalizedLang = language.toLowerCase();
    const tree = await this.parseCode(code, normalizedLang);
    
    if (!tree) {
      // Fall back to original code if parsing fails
      return code;
    }

    try {
      // Find all body nodes that should be folded
      const bodyRanges = this.findBodyRanges(tree.rootNode, normalizedLang);
      
      if (bodyRanges.length === 0) {
        return code;
      }

      // Sort ranges in reverse order (end to start) to avoid offset issues
      bodyRanges.sort((a, b) => b.startIndex - a.startIndex);

      // Replace body content with placeholder
      let result = code;
      for (const range of bodyRanges) {
        const placeholder = this.getPlaceholder(normalizedLang);
        result = result.slice(0, range.startIndex) + placeholder + result.slice(range.endIndex);
      }

      return result;
    } catch (error) {
      console.warn('Error generating skeleton:', error);
      return code;
    }
  }

  /**
   * Find all body ranges that should be folded
   */
  private findBodyRanges(
    node: any, 
    language: string
  ): Array<{ startIndex: number; endIndex: number }> {
    const ranges: Array<{ startIndex: number; endIndex: number }> = [];
    const foldableTypes = FOLDABLE_NODE_TYPES[language] || [];
    const bodyTypes = BODY_NODE_TYPES[language] || [];

    const traverse = (currentNode: any) => {
      // Check if this is a foldable node (function/method)
      if (foldableTypes.includes(currentNode.type)) {
        // Find the body child
        for (const child of currentNode.children) {
          if (bodyTypes.includes(child.type)) {
            // For block types, we want to replace the content inside { }
            // Keep the braces/block markers
            if (child.type === 'statement_block' || child.type === 'block') {
              // Find opening and closing braces/indentation
              const bodyStart = child.startIndex;
              const bodyEnd = child.endIndex;
              
              // Check if it's a brace-based block
              const bodyText = child.text;
              if (bodyText.startsWith('{') && bodyText.endsWith('}')) {
                // Replace content between braces
                ranges.push({
                  startIndex: bodyStart + 1,
                  endIndex: bodyEnd - 1,
                });
              } else {
                // Python-style indented block - replace whole block content
                ranges.push({
                  startIndex: bodyStart,
                  endIndex: bodyEnd,
                });
              }
            } else {
              ranges.push({
                startIndex: child.startIndex,
                endIndex: child.endIndex,
              });
            }
            break;
          }
        }
      }

      // Recurse into children
      for (const child of currentNode.children) {
        traverse(child);
      }
    };

    traverse(node);
    return ranges;
  }

  /**
   * Get the placeholder comment for a language
   */
  private getPlaceholder(language: string): string {
    if (language === 'python') {
      return '\n    # ... implementation hidden ...\n    pass';
    }
    return ' /* ... implementation hidden ... */ ';
  }

  /**
   * Extract code symbols from source code
   * 
   * @param code Source code to analyze
   * @param language Programming language
   * @returns Array of code symbols (functions, classes, etc)
   */
  async extractSymbols(code: string, language: string): Promise<CodeSymbol[]> {
    const normalizedLang = language.toLowerCase();
    const tree = await this.parseCode(code, normalizedLang);
    
    if (!tree) {
      return [];
    }

    const symbols: CodeSymbol[] = [];
    const symbolNodeTypes = this.getSymbolNodeTypes(normalizedLang);

    const traverse = (node: any) => {
      const symbolType = symbolNodeTypes[node.type];
      if (symbolType) {
        const name = this.extractNodeName(node, normalizedLang);
        if (name) {
          symbols.push({
            type: symbolType,
            name,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            startColumn: node.startPosition.column,
            endColumn: node.endPosition.column,
          });
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(tree.rootNode);
    return symbols;
  }

  /**
   * Get node types that represent symbols for a language
   */
  private getSymbolNodeTypes(language: string): Record<string, CodeSymbol['type']> {
    const mappings: Record<string, Record<string, CodeSymbol['type']>> = {
      typescript: {
        function_declaration: 'function',
        method_definition: 'method',
        class_declaration: 'class',
        interface_declaration: 'interface',
        type_alias_declaration: 'interface',
      },
      javascript: {
        function_declaration: 'function',
        method_definition: 'method',
        class_declaration: 'class',
      },
      python: {
        function_definition: 'function',
        async_function_definition: 'function',
        class_definition: 'class',
      },
      rust: {
        function_item: 'function',
        impl_item: 'class',
        trait_item: 'interface',
        struct_item: 'class',
      },
      csharp: {
        method_declaration: 'method',
        class_declaration: 'class',
        interface_declaration: 'interface',
      },
      dart: {
        function_signature: 'function',
        method_signature: 'method',
        class_definition: 'class',
      },
    };
    return mappings[language] || {};
  }

  /**
   * Extract the name from a symbol node
   */
  private extractNodeName(node: any, language: string): string | null {
    // Look for name/identifier child
    for (const child of node.children) {
      if (
        child.type === 'identifier' ||
        child.type === 'name' ||
        child.type === 'property_identifier' ||
        child.type === 'type_identifier'
      ) {
        return child.text;
      }
    }
    return null;
  }

  /**
   * Get the file extension for a language
   */
  static getExtensionForLanguage(language: string): string {
    const extensions: Record<string, string> = {
      javascript: '.js',
      typescript: '.ts',
      python: '.py',
      rust: '.rs',
      csharp: '.cs',
      dart: '.dart',
    };
    return extensions[language.toLowerCase()] || '';
  }

  /**
   * Detect language from file extension
   */
  static detectLanguage(filePath: string): string | null {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      js: 'javascript',
      jsx: 'javascript',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      rs: 'rust',
      cs: 'csharp',
      dart: 'dart',
    };
    return languageMap[ext || ''] || null;
  }

  /**
   * Check if a language is supported for AST parsing
   */
  static isLanguageSupported(language: string): boolean {
    const supportedLanguages = [
      'javascript',
      'typescript',
      'python',
      'rust',
      'csharp',
      'dart'
    ];
    return supportedLanguages.includes(language.toLowerCase());
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.parserCache.clear();
    this.languageCache.clear();
    this.initialized = false;
    this.ParserClass = null;
  }
}

// Export singleton instance
export const treeSitterService = new TreeSitterService();
