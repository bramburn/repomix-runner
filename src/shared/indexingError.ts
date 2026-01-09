// src/shared/indexingError.ts
export class IndexingError extends Error {
  constructor(message: string, public context: { filePath?: string; stage?: string; originalError?: any }) {
    super(message);
    this.name = 'IndexingError';
    Object.setPrototypeOf(this, IndexingError.prototype); // Proper inheritance for custom errors
  }

  toUserString(): string {
    let userMessage = this.message;
    if (this.context.filePath) {
      userMessage += ` (File: ${this.context.filePath})`;
    }
    if (this.context.stage) {
      userMessage += ` (Stage: ${this.context.stage})`;
    }
    if (this.context.originalError && this.context.originalError.message) {
      userMessage += ` - Details: ${this.context.originalError.message}`;
    } else if (this.context.originalError) {
      userMessage += ` - Details: ${String(this.context.originalError)}`;
    }
    return userMessage;
  }
}
