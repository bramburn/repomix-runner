# Compression Testing Framework

<cite>
**Referenced Files in This Document**
- [COMPRESSION_TESTING.md](file://COMPRESSION_TESTING.md)
- [src/test-compression.ts](file://src/test-compression.ts)
- [scripts/test-compression.js](file://scripts/test-compression.js)
- [scripts/diagnose-compression.js](file://scripts/diagnose-compression.js)
- [src/core/compression/index.ts](file://src/core/compression/index.ts)
- [src/core/compression/compressFile.ts](file://src/core/compression/compressFile.ts)
- [src/core/compression/LanguageParser.ts](file://src/core/compression/LanguageParser.ts)
- [src/core/compression/types.ts](file://src/core/compression/types.ts)
- [src/core/compression/strategies/BaseParseStrategy.ts](file://src/core/compression/strategies/BaseParseStrategy.ts)
- [src/core/compression/strategies/TypeScriptParseStrategy.ts](file://src/core/compression/strategies/TypeScriptParseStrategy.ts)
- [src/core/compression/queries/queryTypescript.ts](file://src/core/compression/queries/queryTypescript.ts)
- [src/commands/testCompression.ts](file://src/commands/testCompression.ts)
</cite>

## Update Summary
**Changes Made**
- Updated introduction to reflect that COMPRESSION_TESTING.md exists but is maintained elsewhere
- Modified testing framework section to clarify current testing procedures are maintained in separate locations
- Updated troubleshooting guidance to reference current diagnostic procedures
- Removed references to COMPRESSION_TESTING.md as the primary testing documentation source

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Testing Framework](#testing-framework)
7. [Dependency Analysis](#dependency-analysis)
8. [Performance Considerations](#performance-considerations)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Conclusion](#conclusion)

## Introduction

The Compression Testing Framework is a comprehensive system designed to test and validate the code compression capabilities of the Repomix extension. This framework provides multiple testing methodologies including VS Code extension debugging, programmatic usage, and command-line verification. The system leverages Tree-sitter parsers to analyze and compress code while maintaining semantic meaning and structure.

**Updated** The testing procedures and documentation for this framework are maintained in separate locations within the repository, with the primary testing documentation located in COMPRESSION_TESTING.md, though it is currently excluded from active development workspace due to .vscodeignore configuration.

The framework supports six programming languages: TypeScript, JavaScript, Python, Rust, C#, and Dart. It employs advanced parsing techniques using Web Tree-Sitter technology to identify code constructs and apply intelligent compression strategies that preserve functionality while significantly reducing file sizes.

## Project Structure

The compression testing framework is organized into several key directories and components:

```mermaid
graph TB
subgraph "Core Compression System"
A[src/core/compression/] --> B[LanguageParser.ts]
A --> C[compressFile.ts]
A --> D[strategies/]
A --> E[queries/]
A --> F[types.ts]
end
subgraph "Testing Infrastructure"
G[src/test-compression.ts] --> H[Standalone Test Script]
I[scripts/] --> J[diagnose-compression.js]
I --> K[test-compression.js]
end
subgraph "VS Code Integration"
L[src/commands/] --> M[testCompression.ts]
N[COMPRESSION_TESTING.md] --> O[Documentation]
end
subgraph "Language Support"
D --> P[TypeScriptParseStrategy.ts]
D --> Q[BaseParseStrategy.ts]
E --> R[queryTypescript.ts]
end
```

**Diagram sources**
- [src/core/compression/index.ts](file://src/core/compression/index.ts#L1-L3)
- [src/test-compression.ts](file://src/test-compression.ts#L1-L515)
- [scripts/diagnose-compression.js](file://scripts/diagnose-compression.js#L1-L116)

The framework follows a modular architecture with clear separation of concerns between parsing, compression strategies, and testing infrastructure.

**Section sources**
- [src/core/compression/index.ts](file://src/core/compression/index.ts#L1-L3)
- [src/test-compression.ts](file://src/test-compression.ts#L1-L515)
- [scripts/diagnose-compression.js](file://scripts/diagnose-compression.js#L1-L116)

## Core Components

The compression testing framework consists of several interconnected components that work together to provide comprehensive testing capabilities:

### LanguageParser System
The LanguageParser serves as the central coordinator for all compression operations. It manages Tree-sitter parser instances, caches language configurations, and handles WASM file resolution for different programming languages.

### Compression Strategies
Each programming language has a specialized compression strategy that understands the syntax and semantics of that language. The strategies handle different code constructs like classes, functions, imports, and exports.

### Test Infrastructure
The framework provides multiple testing approaches including standalone scripts, VS Code extension debugging, and automated diagnostics to ensure the compression system works correctly across all supported languages.

**Section sources**
- [src/core/compression/LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L1-L218)
- [src/core/compression/compressFile.ts](file://src/core/compression/compressFile.ts#L1-L85)
- [src/core/compression/types.ts](file://src/core/compression/types.ts#L1-L66)

## Architecture Overview

The compression testing framework implements a sophisticated multi-layered architecture that combines language-specific parsing with intelligent compression strategies:

```mermaid
sequenceDiagram
participant VSCode as VS Code Extension
participant Command as testCompression Command
participant Compressor as compressFile Function
participant Parser as LanguageParser
participant Strategy as ParseStrategy
participant TreeSitter as Tree-sitter Parser
VSCode->>Command : User triggers "Repomix : Test Compression"
Command->>Compressor : compressFile(filePath, content, options)
Compressor->>Parser : getParserForLang(language)
Parser->>TreeSitter : Initialize and load WASM
TreeSitter-->>Parser : Parser instance ready
Parser-->>Compressor : Parser, Query, Strategy
Compressor->>TreeSitter : Parse source code
TreeSitter-->>Compressor : AST representation
Compressor->>Strategy : Process captures
Strategy-->>Compressor : Replacement instructions
Compressor-->>Command : Compressed content
Command-->>VSCode : Display results in new tab
```

**Diagram sources**
- [src/commands/testCompression.ts](file://src/commands/testCompression.ts#L1-L39)
- [src/core/compression/compressFile.ts](file://src/core/compression/compressFile.ts#L25-L84)
- [src/core/compression/LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L95-L129)

The architecture ensures thread-safe initialization of Tree-sitter parsers and efficient caching mechanisms to minimize overhead during repeated compression operations.

## Detailed Component Analysis

### LanguageParser Implementation

The LanguageParser implements a singleton pattern with comprehensive caching mechanisms to optimize performance and resource usage:

```mermaid
classDiagram
class LanguageParser {
-static instance : LanguageParser
-initialized : boolean
-parserClass : any
-wasmDirectory : string
-parserCache : Map~string, ParserInstance~
-languageCache : Map~string, LanguageInstance~
-queryCache : Map~string, QueryInstance~
-configs : Record~string, LanguageConfig~
+getInstance() : LanguageParser
+setWasmDirectory(wasmDirectory : string) : void
+init() : Promise~void~
+getParserForLang(language : string) : Promise~ParserInstance|null~
+getQueryForLang(language : string) : Promise~QueryInstance|null~
+getStrategyForLang(language : string) : ParseStrategy|null
-normalizeLanguage(language : string) : string|null
-loadLanguage(language : string, wasmPath : string) : Promise~LanguageInstance|null~
-resolveWasmPath(wasmFile : string) : string|null
}
class LanguageConfig {
+wasmFile : string
+query : string
+strategy : ParseStrategy
}
LanguageParser --> LanguageConfig : "manages"
```

**Diagram sources**
- [src/core/compression/LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L26-L77)
- [src/core/compression/types.ts](file://src/core/compression/types.ts#L61-L65)

The parser supports lazy initialization and maintains separate caches for parsers, languages, and queries to ensure optimal performance during concurrent operations.

**Section sources**
- [src/core/compression/LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L1-L218)
- [src/core/compression/types.ts](file://src/core/compression/types.ts#L1-L66)

### Compression Strategy System

The compression strategy system provides language-specific implementations that handle different code constructs appropriately:

```mermaid
classDiagram
class BaseParseStrategy {
<<abstract>>
+parseCapture(capture, context, options) : ParsedChunk|null
+getBodyReplacement(capture, context, options) : BodyReplacement|null
#getNodeText(node, sourceCode) : string
#collapseWhitespace(text) : string
#findSignatureEnd(text) : number
#ensureTerminal(text) : string
#cleanFunctionSignature(text) : string
}
class TypeScriptParseStrategy {
+parseCapture(capture, context, options) : ParsedChunk|null
+getBodyReplacement(capture, context, options) : BodyReplacement|null
-findBodyRange(node, nodeText) : {start, end}|null
-extractNodeName(node) : string|null
-parseExport(text, startIndex, endIndex) : ParsedChunk|null
-createClassSkeleton(text) : string
-buildChunk(type, startIndex, endIndex, text) : ParsedChunk
}
BaseParseStrategy <|-- TypeScriptParseStrategy
```

**Diagram sources**
- [src/core/compression/strategies/BaseParseStrategy.ts](file://src/core/compression/strategies/BaseParseStrategy.ts#L11-L74)
- [src/core/compression/strategies/TypeScriptParseStrategy.ts](file://src/core/compression/strategies/TypeScriptParseStrategy.ts#L12-L207)

The strategy system implements intelligent compression that preserves function signatures, class skeletons, and essential declarations while removing implementation details.

**Section sources**
- [src/core/compression/strategies/BaseParseStrategy.ts](file://src/core/compression/strategies/BaseParseStrategy.ts#L1-L75)
- [src/core/compression/strategies/TypeScriptParseStrategy.ts](file://src/core/compression/strategies/TypeScriptParseStrategy.ts#L1-L208)

### Test Framework Components

The testing framework provides multiple approaches for validating compression functionality:

```mermaid
flowchart TD
A[Test Compression] --> B{Test Method}
B --> |VS Code Debugger| C[Extension Debug Mode]
B --> |Programmatic| D[Direct Function Call]
B --> |CLI| E[Diagnostic Script]
C --> F[User Input: File Selection]
F --> G[Command Palette Trigger]
G --> H[compressFile Function]
D --> I[Import compressFile]
I --> J[Call with test data]
E --> K[Check WASM Files]
K --> L[Verify Dependencies]
L --> M[Validate Source Files]
H --> N[Display Results]
J --> N
M --> N
```

**Diagram sources**
- [src/commands/testCompression.ts](file://src/commands/testCompression.ts#L5-L38)
- [src/test-compression.ts](file://src/test-compression.ts#L447-L514)
- [scripts/diagnose-compression.js](file://scripts/diagnose-compression.js#L17-L91)

**Section sources**
- [src/commands/testCompression.ts](file://src/commands/testCompression.ts#L1-L39)
- [src/test-compression.ts](file://src/test-compression.ts#L1-L515)
- [scripts/test-compression.js](file://scripts/test-compression.js#L1-L190)

## Testing Framework

The compression testing framework offers three distinct testing methodologies to ensure comprehensive validation:

### Method 1: VS Code Extension Debugger
The recommended approach involves launching the extension in debug mode and using the built-in "Repomix: Test Compression" command. This method provides real-time feedback and integrates seamlessly with the development environment.

### Method 2: Programmatic Usage
For automated testing and integration scenarios, the framework supports direct function calls with customizable options including selective preservation of specific functions or classes.

### Method 3: Command Line Verification
The diagnostic script provides comprehensive system health checks, verifying WASM file availability, dependency installations, and source file integrity.

**Updated** While COMPRESSION_TESTING.md contains comprehensive testing procedures, the current testing documentation and procedures are maintained in separate locations within the repository. The primary testing documentation can be found in COMPRESSION_TESTING.md, though it is currently excluded from active development workspace due to .vscodeignore configuration.

**Section sources**
- [COMPRESSION_TESTING.md](file://COMPRESSION_TESTING.md#L7-L68)
- [src/test-compression.ts](file://src/test-compression.ts#L36-L60)

## Dependency Analysis

The compression testing framework maintains minimal external dependencies while leveraging powerful parsing capabilities:

```mermaid
graph LR
subgraph "Internal Dependencies"
A[compressFile] --> B[LanguageParser]
B --> C[ParseStrategy]
C --> D[Tree-sitter Queries]
end
subgraph "External Dependencies"
E[web-tree-sitter] --> F[WASM Parsers]
G[TypeScript] --> H[Runtime Environment]
end
subgraph "Testing Dependencies"
I[VS Code API] --> J[Extension Host]
K[Node.js FS] --> L[File System Access]
end
B --> E
A --> I
A --> K
```

**Diagram sources**
- [src/core/compression/compressFile.ts](file://src/core/compression/compressFile.ts#L1-L3)
- [src/core/compression/LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L88-L93)
- [src/commands/testCompression.ts](file://src/commands/testCompression.ts#L1-L3)

The framework demonstrates excellent modularity with clear dependency boundaries and minimal coupling between components.

**Section sources**
- [src/core/compression/compressFile.ts](file://src/core/compression/compressFile.ts#L1-L85)
- [src/core/compression/LanguageParser.ts](file://src/core/compression/LanguageParser.ts#L1-L218)

## Performance Considerations

The compression testing framework implements several optimization strategies to ensure efficient operation:

### Caching Mechanisms
- Parser instances are cached to avoid repeated initialization costs
- Language configurations and query objects are stored in memory for quick access
- WASM file paths are resolved once and reused across operations

### Memory Management
- Tree-sitter parsers are designed to be lightweight and efficient
- AST traversal operations are optimized for minimal memory footprint
- String manipulation operations use efficient slice operations

### Concurrency Handling
- Asynchronous operations prevent blocking the main thread
- Promise-based APIs enable non-blocking compression operations
- Error handling prevents cascading failures during concurrent operations

## Troubleshooting Guide

Common issues and their solutions when working with the compression testing framework:

### WASM Parser Issues
- **Problem**: Compression returns null due to WASM loading failures
- **Solution**: Verify WASM files exist in the `dist/tree-sitter-wasm/` directory and run the diagnostic script to check system health

### Language Support Problems
- **Problem**: Unsupported file extensions return null compression results
- **Solution**: Ensure file extensions match supported languages (`.ts`, `.js`, `.py`, `.rs`, `.cs`, `.dart`)

### Tree-sitter Integration Issues
- **Problem**: Parser initialization failures or missing web-tree-sitter dependency
- **Solution**: Install web-tree-sitter using npm and verify proper installation with `npm list web-tree-sitter`

### Memory and Performance Issues
- **Problem**: Large files cause memory pressure or slow compression
- **Solution**: Consider implementing chunk-based processing for very large files or adjust compression options

**Updated** For comprehensive troubleshooting procedures, refer to the testing documentation maintained in COMPRESSION_TESTING.md, which contains detailed guidance on diagnosing compression issues and resolving common problems.

**Section sources**
- [COMPRESSION_TESTING.md](file://COMPRESSION_TESTING.md#L154-L171)
- [scripts/diagnose-compression.js](file://scripts/diagnose-compression.js#L17-L114)

## Conclusion

The Compression Testing Framework provides a robust, multi-faceted approach to validating code compression functionality. Its modular architecture, comprehensive language support, and flexible testing methodologies make it an essential tool for ensuring the reliability and effectiveness of the compression system.

The framework successfully balances performance optimization with comprehensive testing capabilities, providing developers with multiple pathways to validate compression behavior across different scenarios and use cases. The integration with VS Code, combined with standalone testing scripts and diagnostic tools, ensures thorough validation in various development environments.

**Updated** While the primary testing procedures and documentation are maintained in COMPRESSION_TESTING.md, the current testing framework continues to operate effectively with the existing infrastructure. The testing documentation is maintained in a separate location within the repository, though it is currently excluded from active development workspace due to .vscodeignore configuration.

Future enhancements could include expanded language support, performance benchmarking capabilities, and integration with continuous integration pipelines for automated quality assurance.