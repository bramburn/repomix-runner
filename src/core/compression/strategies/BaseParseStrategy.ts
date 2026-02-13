import type {
  CaptureLike,
  CompressionOptions,
  ParseContext,
  ParseStrategy,
  ParsedChunk,
  SyntaxNodeLike,
} from '../types.js';

export abstract class BaseParseStrategy implements ParseStrategy {
  abstract parseCapture(
    capture: CaptureLike,
    context: ParseContext,
    options?: CompressionOptions
  ): ParsedChunk | null;

  protected getNodeText(node: SyntaxNodeLike, sourceCode: string): string {
    return sourceCode.slice(node.startIndex, node.endIndex);
  }

  protected collapseWhitespace(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  protected findSignatureEnd(text: string): number {
    const braceIndex = text.indexOf('{');
    if (braceIndex >= 0) {
      return braceIndex;
    }

    const arrowIndex = text.indexOf('=>');
    if (arrowIndex >= 0) {
      const afterArrow = text.slice(arrowIndex + 2);
      const firstTerminator = afterArrow.search(/[;\n]/);
      if (firstTerminator >= 0) {
        return arrowIndex + 2 + firstTerminator;
      }
      return text.length;
    }

    return text.length;
  }

  protected ensureTerminal(text: string): string {
    const trimmed = text.trim();
    if (!trimmed) {
      return '';
    }

    if (trimmed.endsWith(';') || trimmed.endsWith('}')) {
      return trimmed;
    }

    return `${trimmed};`;
  }

  protected cleanFunctionSignature(text: string): string {
    const end = this.findSignatureEnd(text);
    const signature = text.slice(0, end).trim();

    if (!signature) {
      return '';
    }

    return this.ensureTerminal(this.collapseWhitespace(signature));
  }
}
