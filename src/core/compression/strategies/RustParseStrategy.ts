import { BaseParseStrategy } from './BaseParseStrategy.js';
import {
  CaptureType,
  type CaptureLike,
  type CompressionOptions,
  type ParseContext,
  type ParsedChunk,
  type SyntaxNodeLike,
  type BodyReplacement,
} from '../types.js';

export class RustParseStrategy extends BaseParseStrategy {
  parseCapture(
    capture: CaptureLike,
    context: ParseContext,
    options?: CompressionOptions
  ): ParsedChunk | null {
    const captureType = capture.name as CaptureType;
    const nodeText = this.getNodeText(capture.node, context.sourceCode).trim();

    if (!nodeText) {
      return null;
    }

    // 1. Selective Compression Check
    if (options?.keepNames && options.keepNames.length > 0) {
      const nodeName = this.extractNodeName(capture.node);
      if (nodeName && options.keepNames.includes(nodeName)) {
        return this.buildChunk(captureType, capture.node.startIndex, capture.node.endIndex, nodeText);
      }
    }

    // 2. Standard Compression
    switch (captureType) {
      case CaptureType.Import:
      case CaptureType.Type:
      case CaptureType.Enum:
      case CaptureType.FunctionVariable: // const/static
        // Usually small enough to keep full, or just return as is
        return this.buildChunk(captureType, capture.node.startIndex, capture.node.endIndex, nodeText);

      case CaptureType.Function: {
        // Rust functions: fn foo() -> Bar { ... }
        const signature = this.cleanFunctionSignature(nodeText);
        if (!signature) return null;
        return this.buildChunk(captureType, capture.node.startIndex, capture.node.endIndex, signature);
      }

      case CaptureType.Class: // struct, impl, union
      case CaptureType.Interface: // trait
      case CaptureType.Method: { 
        // Note: Tree-sitter rust often puts methods inside impl_item which is captured as Class above.
        // If we capture a method directly (rare in this query), treat as function.
        
        // For structs/impls/traits, we want "header { ... }"
        const skeleton = this.createClassSkeleton(nodeText);
        if (!skeleton) return null;
        return this.buildChunk(captureType, capture.node.startIndex, capture.node.endIndex, skeleton);
      }

      default:
        // Return original text for unrecognized types
        return this.buildChunk(captureType, capture.node.startIndex, capture.node.endIndex, nodeText);
    }
  }

  getBodyReplacement(
    capture: CaptureLike,
    context: ParseContext,
    options?: CompressionOptions
  ): BodyReplacement | null {
    const captureType = capture.name as CaptureType;
    const node = capture.node;
    const nodeText = this.getNodeText(node, context.sourceCode);

    // Handle keepNames option - return null to keep full content
    if (options?.keepNames && options.keepNames.length > 0) {
      const nodeName = this.extractNodeName(node);
      if (nodeName && options.keepNames.includes(nodeName)) {
        return null;
      }
    }

    switch (captureType) {
      case CaptureType.Import:
      case CaptureType.Type:
      case CaptureType.Enum:
      case CaptureType.FunctionVariable:
        // These have no body to compress
        return null;

      case CaptureType.Function:
      case CaptureType.Method: {
        const bodyRange = this.findBodyRange(node, nodeText);
        if (!bodyRange) {
          return null;
        }
        return {
          bodyStartIndex: node.startIndex + bodyRange.start,
          bodyEndIndex: node.startIndex + bodyRange.end,
          replacementText: '{ ... }',
        };
      }

      default:
        // Try to find a body for unknown types like modules
        if (nodeText.includes('{')) {
          const bodyRange = this.findBodyRange(node, nodeText);
          if (!bodyRange) {
            return null;
          }
          return {
            bodyStartIndex: node.startIndex + bodyRange.start,
            bodyEndIndex: node.startIndex + bodyRange.end,
            replacementText: '{ ... }',
          };
        }
        return null;
    }
  }

  private findBodyRange(node: SyntaxNodeLike, nodeText: string): { start: number; end: number } | null {
    // Find the first opening brace
    const braceStart = nodeText.indexOf('{');
    if (braceStart < 0) {
      return null;
    }

    // Find the matching closing brace
    let braceCount = 0;
    let braceEnd = -1;
    for (let i = braceStart; i < nodeText.length; i++) {
      if (nodeText[i] === '{') {
        braceCount++;
      } else if (nodeText[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          braceEnd = i + 1;
          break;
        }
      }
    }

    if (braceEnd < 0) {
      return null;
    }

    return { start: braceStart, end: braceEnd };
  }

  private extractNodeName(node: SyntaxNodeLike): string | null {
    if (node.childForFieldName) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) return nameNode.text;
    }
    
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'identifier' || child.type === 'type_identifier') {
          return child.text;
        }
      }
    }
    return null;
  }

  private createClassSkeleton(text: string): string {
    const braceIndex = text.indexOf('{');
    if (braceIndex < 0) {
      return this.ensureTerminal(this.collapseWhitespace(text));
    }

    const header = this.collapseWhitespace(text.slice(0, braceIndex));
    if (!header) return '';

    return `${header} { ... }`;
  }

  private buildChunk(
    type: CaptureType,
    startIndex: number,
    endIndex: number,
    text: string
  ): ParsedChunk {
    return {
      type,
      startIndex,
      endIndex,
      text,
    };
  }
}
