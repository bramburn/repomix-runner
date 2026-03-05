export enum CaptureType {
  Import = 'definition.import',
  Export = 'definition.export',
  Function = 'definition.function',
  FunctionVariable = 'definition.function_variable',
  Class = 'definition.class',
  Method = 'definition.method',
  Interface = 'definition.interface',
  Type = 'definition.type',
  Enum = 'definition.enum',
}

export interface SyntaxNodeLike {
  type: string;
  text: string;
  startIndex: number;
  endIndex: number;
  childForFieldName?(name: string): SyntaxNodeLike | null;
  children: SyntaxNodeLike[];
}

export interface CaptureLike {
  name: string;
  node: SyntaxNodeLike;
}

export interface ParsedChunk {
  type: CaptureType;
  startIndex: number;
  endIndex: number;
  text: string;
}

export interface BodyReplacement {
  bodyStartIndex: number;
  bodyEndIndex: number;
  replacementText: string;
}

export interface CompressionOptions {
  keepNames?: string[];
  enableEnrichment?: boolean;
  repoId?: string;
}

export interface ParseContext {
  sourceCode: string;
}

export interface ParseStrategy {
  parseCapture(
    capture: CaptureLike,
    context: ParseContext,
    options?: CompressionOptions
  ): ParsedChunk | null;
  getBodyReplacement(
    capture: CaptureLike,
    context: ParseContext,
    options?: CompressionOptions
  ): BodyReplacement | null;
}

export interface LanguageConfig {
  wasmFile: string;
  query: string;
  strategy: ParseStrategy;
}
