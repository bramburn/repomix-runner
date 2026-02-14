import { BaseParseStrategy } from './BaseParseStrategy.js';
import {
  CaptureType,
  type CaptureLike,
  type CompressionOptions,
  type ParseContext,
  type ParsedChunk,
  type SyntaxNodeLike,
} from '../types.js';

export class CsharpParseStrategy extends BaseParseStrategy {
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
      case CaptureType.Interface:
      case CaptureType.Type:
      case CaptureType.Enum:
        // Keep definition headers or simple one-liners
        return this.buildChunk(captureType, capture.node.startIndex, capture.node.endIndex, nodeText);

      case CaptureType.Function:
      case CaptureType.Method: {
        // C# properties are captured as methods but often look better with { ... } if they have bodies
        if (capture.node.type === 'property_declaration') {
          const skeleton = this.createClassSkeleton(nodeText);
          if (!skeleton) return null;
          return this.buildChunk(captureType, capture.node.startIndex, capture.node.endIndex, skeleton);
        }

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
        // Fallback for namespaces or other containers -> attempt class-like skeleton
        if (capture.name === 'definition.module') {
           const skeleton = this.createClassSkeleton(nodeText);
           return skeleton 
             ? this.buildChunk(CaptureType.Class, capture.node.startIndex, capture.node.endIndex, skeleton)
             : null;
        }
        return null;
    }
  }

  private extractNodeName(node: SyntaxNodeLike): string | null {
    if (node.childForFieldName) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) return nameNode.text;
    }
    
    // Fallback: iterate children
    if (node.children) {
      for (const child of node.children) {
        if (child.type === 'identifier') return child.text;
      }
    }
    return null;
  }

  private createClassSkeleton(text: string): string {
    const braceIndex = text.indexOf('{');
    if (braceIndex < 0) {
      // If no brace, it might be a file-scoped namespace or abstract definition
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
