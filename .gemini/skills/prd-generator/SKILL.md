---
name: prd-generator
description: Generates a detailed Product Requirements Document (PRD) for VSCode extension UX/UI improvements. Use when given an idea for a feature or enhancement that requires architectural planning and specific implementation guidance.
---

# PRD Generator for VSCode Extensions

This skill guides the generation of a comprehensive PRD file to facilitate the implementation of UX/UI improvements in VSCode extensions.

## Workflow

### 1. Research phase
Before generating the PRD, you MUST research the current codebase to ensure the plan is grounded and actionable.
- **Identify UX/UI Patterns**: Search for existing Webview providers, TreeView providers, and Command registrations in `src/`.
- **Contextual Awareness**: Analyze `package.json` for extension contributions and dependencies.
- **Style Consistency**: Identify CSS/styling patterns used in existing webviews or Fluent UI configurations.

### 2. Naming the PRD
Generate a filename based on the current date and a concise 3-word summary of the feature:
- Format: `YYYYMMDD-word1-word2-word3.md`
- Example: `20240410-sidebar-performance-tabs.md`
- Location: Always in the root of the repository.

### 3. PRD Structure
The generated PRD MUST include the following sections:

#### **I. Overview**
- A clear, concise description of the feature/enhancement and its impact on the user experience.

#### **II. UX/UI Design & Patterns**
- **Design Patterns**: Specify relevant patterns (e.g., MVVM for webviews, Observer for state updates).
- **VSCode UI Components**: List specific VSCode components to be used (e.g., TreeView, QuickPick, WebviewView).

#### **III. Relevant Codebase Context**
- List the most important files and folders that form the foundation for this change.

#### **IV. File Directory Tree (Implementation Guide)**
Provide a visual representation of the files involved, with a single-line comment for each indicating its role:
- `READ`: For context or dependency.
- `EDIT`: Existing file that needs modification.
- `CREATE`: New file to be implemented.

```markdown
/
├── src/
│   ├── webview/
│   │   └── sidebar.ts // EDIT: Register the new tab in the webview provider.
│   └── commands/
│       └── newCommand.ts // CREATE: Implement the logic for the new feature.
└── package.json // EDIT: Add the new command to the contribution points.
```

#### **V. Atomic Implementation Instructions**
- A numbered, step-by-step list of tasks to complete the implementation. Each task should be "atomic" (self-contained and verifiable).

#### **VI. API & Data Specifications**
- Details on any new interfaces, message passing protocols between webviews and the extension host, or external API integrations.

#### **VII. Style & Example Code**
- Provide code snippets for CSS (preferring VSCode-themed variables) and TypeScript to illustrate the intended implementation style.

## Key Directives
- **Be Surgical**: Focus on the specific change without suggesting unrelated refactors.
- **Verify Consistency**: Ensure the PRD aligns with existing project standards identified during research.
- **Self-Contained**: The PRD should contain enough detail that it can be passed to a new session for implementation without further clarification.
