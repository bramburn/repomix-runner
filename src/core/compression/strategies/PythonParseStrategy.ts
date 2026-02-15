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

export class PythonParseStrategy extends BaseParseStrategy {
  parseCapture(
    capture: CaptureLike,
    context: ParseContext,
    options?: CompressionOptions
  ): ParsedChunk | null {
    const nodeText = this.getNodeText(capture.node, context.sourceCode);
    // Python captures might map 'decorated' -> function/class or direct function/class
    let captureType = capture.name as string;

    // Resolve 'decorated' capture to actual underlying type
    if (captureType === 'definition.decorated') {
      const underlyingType = this.resolveDecoratedType(capture.node);
      if (underlyingType) {
        captureType = underlyingType;
      } else {
        return null; // Unknown decoration target
      }
    }

    const type = captureType as CaptureType;

    // 1. Selective Compression Check
    if (options?.keepNames && options.keepNames.length > 0) {
      const nodeName = this.extractNodeName(capture.node);
      if (nodeName && options.keepNames.includes(nodeName)) {
        return this.buildChunk(type, capture.node.startIndex, capture.node.endIndex, nodeText);
      }
    }

    // 2. Standard Compression
    switch (type) {
      case CaptureType.Import:
        return this.buildChunk(type, capture.node.startIndex, capture.node.endIndex, nodeText.trim());

      case CaptureType.Function:
      case CaptureType.Method:
      case CaptureType.Class: {
        const signature = this.extractSignature(capture.node, context.sourceCode);
        if (!signature) {
          return null;
        }
        return this.buildChunk(type, capture.node.startIndex, capture.node.endIndex, signature);
      }

      default:
        // Return original text for unrecognized types
        return this.buildChunk(type, capture.node.startIndex, capture.node.endIndex, nodeText.trim());
    }
  }

  getBodyReplacement(
    capture: CaptureLike,
    context: ParseContext,
    options?: CompressionOptions
  ): BodyReplacement | null {
    let captureType = capture.name as string;
    const node = capture.node;
    const nodeText = this.getNodeText(node, context.sourceCode);

    // Resolve 'decorated' capture to actual underlying type
    if (captureType === 'definition.decorated') {
      const underlyingType = this.resolveDecoratedType(node);
      if (underlyingType) {
        captureType = underlyingType;
      } else {
        return null;
      }
    }

    const type = captureType as CaptureType;

    // Handle keepNames option - return null to keep full content
    if (options?.keepNames && options.keepNames.length > 0) {
      const nodeName = this.extractNodeName(node);
      if (nodeName && options.keepNames.includes(nodeName)) {
        return null;
      }
    }

    switch (type) {
      case CaptureType.Import:
        // Imports have no body
        return null;

      case CaptureType.Function:
      case CaptureType.Method: {
        // Find the body (block) node
        const block = this.findBlockNode(node);
        if (!block) {
          return null;
        }
        return {
          bodyStartIndex: block.startIndex,
          bodyEndIndex: block.endIndex,
          replacementText: '...',
        };
      }

      default:
        return null;
    }
  }

  private findBlockNode(node: SyntaxNodeLike): SyntaxNodeLike | null {
    // For decorated definitions, look inside the inner definition
    if (node.type === 'decorated_definition') {
      const inner = node.children.find(c => c.type === 'function_definition' || c.type === 'class_definition');
      if (inner) {
        return this.findBlockNode(inner);
      }
    }

    // Look for block child
    if (node.childForFieldName) {
      const block = node.childForFieldName('body');
      if (block) {
        return block;
      }
    }

    // Fallback: find first block-type child
    for (const child of node.children) {
      if (child.type === 'block') {
        return child;
      }
    }

    return null;
  }

  /**
   * Identifies if a decorated node is wrapping a function or a class.
   */
  private resolveDecoratedType(node: SyntaxNodeLike): CaptureType | null {
    for (const child of node.children) {
      if (child.type === 'function_definition') return CaptureType.Function;
      if (child.type === 'class_definition') return CaptureType.Class;
    }
    return null;
  }

  /**
   * Extracts the name from a node, drilling down if it's decorated.
   */
  private extractNodeName(node: SyntaxNodeLike): string | null {
    // If decorated, find the inner definition first
    let targetNode = node;
    if (node.type === 'decorated_definition') {
      const inner = node.children.find(c => c.type === 'function_definition' || c.type === 'class_definition');
      if (inner) targetNode = inner;
    }

    // Find identifier child
    if (targetNode.childForFieldName) {
      const nameNode = targetNode.childForFieldName('name');
      if (nameNode) return nameNode.text;
    }
    
    // Fallback iteration
    for (const child of targetNode.children) {
      if (child.type === 'identifier') return child.text;
    }

    return null;
  }

  /**
   * Reconstructs the signature by iterating children until the body block is reached.
   * This preserves decorators, async keywords, parameters, and return types.
   */
  private extractSignature(node: SyntaxNodeLike, sourceCode: string): string {
    // 1. Identify the 'block' node (the body)
    // In decorated definitions, the block is inside the inner definition.
    let targetChildren = node.children;
    
    // Flatten children for decorated nodes to process linearly
    if (node.type === 'decorated_definition') {
      const inner = node.children.find(c => c.type === 'function_definition' || c.type === 'class_definition');
      if (inner) {
        // We want the text of the decorators (siblings of inner) + the header of inner
        // Simplest strategy: take everything from start of decorated_node up to start of inner block
        const block = inner.children.find(c => c.type === 'block');
        if (block) {
          const signatureEnd = block.startIndex;
          const signature = sourceCode.slice(node.startIndex, signatureEnd).trim();
          return this.formatSignature(signature);
        }
      }
    }

    // Standard definition
    const block = targetChildren.find(c => c.type === 'block');
    if (block) {
      const signatureEnd = block.startIndex;
      const signature = sourceCode.slice(node.startIndex, signatureEnd).trim();
      return this.formatSignature(signature);
    }

    // If no block found (e.g. abstract or incomplete), return whole text
    return sourceCode.slice(node.startIndex, node.endIndex).trim();
  }

  private formatSignature(signature: string): string {
    // Ensure it ends with a colon
    let cleaned = signature.trim();
    if (!cleaned.endsWith(':')) {
      cleaned += ':';
    }
    return `${cleaned} ...`;
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
