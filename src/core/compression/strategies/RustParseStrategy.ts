import { BaseParseStrategy } from './BaseParseStrategy.js';
import {
  CaptureType,
  type CaptureLike,
  type CompressionOptions,
  type ParseContext,
  type ParsedChunk,
  type SyntaxNodeLike,
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
        // Handle modules (mod foo { ... })
        if (capture.name === 'definition.module') {
          // If it has a body (braces), skeletonize it. If it's "mod foo;", keep it.
          if (nodeText.includes('{')) {
            const skeleton = this.createClassSkeleton(nodeText);
            return skeleton 
              ? this.buildChunk(CaptureType.Class, capture.node.startIndex, capture.node.endIndex, skeleton)
              : null;
          }
          return this.buildChunk(CaptureType.Import, capture.node.startIndex, capture.node.endIndex, nodeText);
        }
        return null;
    }
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
