export interface Patch {
  /** The raw file path or pattern extracted from the XML (e.g., "lib/main.dart") */
  filePath: string;
  /** The content to look for (from <<<<<<< SEARCH) */
  searchContent: string;
  /** The content to replace with (from =======) */
  replaceContent: string;
}

export interface MatchResult {
  /** The 0-based line number where the match starts */
  startLine: number;
  /** The 0-based line number where the match ends */
  endLine: number;
  /** The indentation string detected on the first line of the match (e.g., "  ") */
  indentation: string;
  /** The similarity score (0 to 1, where 1 is exact match) */
  score: number;
}

export interface PatchError {
  /** The file path associated with the error */
  filePath: string;
  /** A user-friendly reason for failure */
  reason: string;
  /** Optional: The actual context found in the file (useful for fuzzy match failure feedback) */
  actualContext?: string;
}

export interface FileResolutionResult {
  /** The resolved VS Code URI */
  uri: import('vscode').Uri;
  /** Whether the resolution was exact or fuzzy/AI-based */
  method: 'exact' | 'fuzzy' | 'ai';
}