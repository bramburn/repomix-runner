import * as fs from 'fs';
import * as path from 'path';
import { queryTypescript } from './queries/queryTypescript.js';
import { TypeScriptParseStrategy } from './strategies/TypeScriptParseStrategy.js';
import type { LanguageConfig, ParseStrategy } from './types.js';

type ParserInstance = any;
type QueryInstance = any;
type LanguageInstance = any;
type TreeSitterModule = any;

const TYPE_SCRIPT_STRATEGY = new TypeScriptParseStrategy();

export class LanguageParser {
  private static instance: LanguageParser | null = null;

  private initialized = false;
  private parserClass: TreeSitterModule | null = null;
  private wasmDirectory: string | null = null;

  private readonly parserCache = new Map<string, ParserInstance>();
  private readonly languageCache = new Map<string, LanguageInstance>();
  private readonly queryCache = new Map<string, QueryInstance>();

  private readonly configs: Record<string, LanguageConfig> = {
    typescript: {
      wasmFile: 'typescript.wasm',
      query: queryTypescript,
      strategy: TYPE_SCRIPT_STRATEGY,
    },
    javascript: {
      // Use the TypeScript grammar/query for both TS and JS so we can share one capture strategy.
      wasmFile: 'typescript.wasm',
      query: queryTypescript,
      strategy: TYPE_SCRIPT_STRATEGY,
    },
  };

  static getInstance(): LanguageParser {
    if (!LanguageParser.instance) {
      LanguageParser.instance = new LanguageParser();
    }

    return LanguageParser.instance;
  }

  setWasmDirectory(wasmDirectory: string): void {
    this.wasmDirectory = wasmDirectory;
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const TreeSitter = require('web-tree-sitter');
    await TreeSitter.init();

    this.parserClass = TreeSitter;
    this.initialized = true;
  }

  async getParserForLang(language: string): Promise<ParserInstance | null> {
    const normalized = this.normalizeLanguage(language);
    if (!normalized) {
      return null;
    }

    await this.init();
    if (!this.parserClass) {
      return null;
    }

    if (this.parserCache.has(normalized)) {
      return this.parserCache.get(normalized)!;
    }

    const config = this.configs[normalized];
    const wasmPath = this.resolveWasmPath(config.wasmFile);
    if (!wasmPath) {
      return null;
    }

    const parserLanguage = await this.loadLanguage(normalized, wasmPath);
    if (!parserLanguage) {
      return null;
    }

    const parser = new this.parserClass();
    parser.setLanguage(parserLanguage);

    this.parserCache.set(normalized, parser);

    return parser;
  }

  async getQueryForLang(language: string): Promise<QueryInstance | null> {
    const normalized = this.normalizeLanguage(language);
    if (!normalized) {
      return null;
    }

    await this.init();

    if (!this.parserClass) {
      return null;
    }

    if (this.queryCache.has(normalized)) {
      return this.queryCache.get(normalized)!;
    }

    const config = this.configs[normalized];
    const wasmPath = this.resolveWasmPath(config.wasmFile);
    if (!wasmPath) {
      return null;
    }

    const parserLanguage = await this.loadLanguage(normalized, wasmPath);
    if (!parserLanguage) {
      return null;
    }

    const query = new this.parserClass.Query(parserLanguage, config.query);
    this.queryCache.set(normalized, query);

    return query;
  }

  getStrategyForLang(language: string): ParseStrategy | null {
    const normalized = this.normalizeLanguage(language);
    if (!normalized) {
      return null;
    }

    return this.configs[normalized].strategy;
  }

  private normalizeLanguage(language: string): string | null {
    const normalized = language.toLowerCase();

    if (!this.configs[normalized]) {
      return null;
    }

    return normalized;
  }

  private async loadLanguage(language: string, wasmPath: string): Promise<LanguageInstance | null> {
    if (this.languageCache.has(language)) {
      return this.languageCache.get(language)!;
    }

    if (!this.parserClass) {
      return null;
    }

    const parserLanguage = await this.parserClass.Language.load(wasmPath);
    this.languageCache.set(language, parserLanguage);

    return parserLanguage;
  }

  private resolveWasmPath(wasmFile: string): string | null {
    const candidateDirectories = [
      this.wasmDirectory,
      path.join(__dirname, 'tree-sitter-wasm'),
      path.resolve(process.cwd(), 'dist', 'tree-sitter-wasm'),
      path.resolve(process.cwd(), 'assets', 'tree-sitter-wasm'),
    ].filter((value): value is string => Boolean(value));

    for (const directory of candidateDirectories) {
      const candidatePath = path.join(directory, wasmFile);
      if (fs.existsSync(candidatePath)) {
        return candidatePath;
      }
    }

    return null;
  }
}
