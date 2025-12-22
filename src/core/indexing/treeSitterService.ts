/**
 * Tree-sitter service for semantic code parsing and analysis.
 * 
 * This service provides language-aware code parsing capabilities using tree-sitter.
 * It enables semantic chunking by understanding code structure (functions, classes, etc).
 * 
 * Supported languages: JavaScript, TypeScript, Python, Rust, C#, Dart
 */

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
 * Tree-sitter service for code analysis
 * 
 * Currently provides infrastructure for future semantic chunking.
 * For now, we use line-based chunking which is fast and non-blocking.
 */
export class TreeSitterService {
  private config: TreeSitterConfig;
  private initialized: boolean = false;

  constructor(config: TreeSitterConfig = {}) {
    this.config = {
      wasmDir: config.wasmDir || './tree-sitter-wasm',
      languages: config.languages || ['javascript', 'typescript', 'python', 'rust', 'csharp', 'dart'],
    };
  }

  /**
   * Initialize the tree-sitter service
   * This will be called when semantic chunking is needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    // TODO: Load WASM parsers from config.wasmDir
    // This will be implemented when semantic chunking is enabled
    
    this.initialized = true;
  }

  /**
   * Extract code symbols from source code
   * 
   * @param code Source code to analyze
   * @param language Programming language
   * @returns Array of code symbols (functions, classes, etc)
   */
  async extractSymbols(code: string, language: string): Promise<CodeSymbol[]> {
    // TODO: Implement semantic parsing using tree-sitter
    // For now, return empty array as we use line-based chunking
    return [];
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
}

// Export singleton instance
export const treeSitterService = new TreeSitterService();

