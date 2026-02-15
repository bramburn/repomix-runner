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

export class DartParseStrategy extends BaseParseStrategy {
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
      case CaptureType.Export:
      case CaptureType.Type:
      case CaptureType.Enum:
        // For imports/exports/enums, usually keeping the whole line/block is fine or just the header
        // For simple one-liners, return as is.
        return this.buildChunk(captureType, capture.node.startIndex, capture.node.endIndex, nodeText);

      case CaptureType.Function:
      case CaptureType.Method: {
        // Extract signature up to the body
        const signature = this.cleanFunctionSignature(nodeText);
        if (!signature) {
          return null;
        }
        return this.buildChunk(captureType, capture.node.startIndex, capture.node.endIndex, signature);
      }

      case CaptureType.Class: {
        const classSkeleton = this.createClassSkeleton(nodeText);
        if (!classSkeleton) {
          return null;
        }
        return this.buildChunk(captureType, capture.node.startIndex, capture.node.endIndex, classSkeleton);
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
      case CaptureType.Export:
      case CaptureType.Type:
      case CaptureType.Enum:
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
    
    // Fallback search for identifiers
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
