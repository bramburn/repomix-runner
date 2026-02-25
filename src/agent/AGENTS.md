# Agent Development Guide

This guide explains the Smart Agent architecture in `src/agent/` and how to extend it safely.

## Architecture Overview

Primary files:
- `graph.ts`: LangGraph wiring for the smart repomix workflow.
- `nodes.ts`: node implementations for analysis, retrieval, relevance checks, context optimization, summary, command generation, execution.
- `state.ts`: `AgentState` schema and reducers.
- `prompts.ts`: prompt templates only (no orchestration logic).
- `llmClient.ts`: Gemini wrapper with serial queue, rate limiting, retries, and structured parsing.
- `tools.ts`: filesystem/tool helpers used by nodes.
- `summaryGenerator.ts`: markdown summary output generation.

Current graph flow in `createSmartRepomixGraph(...)`:
1. `analyzeObjective`
2. `retrieval`
3. `relevanceCheck` (conditional skip when `confirmedFiles` is already populated)
4. `fetchBlueprint`
5. `optimizeContext`
6. `generateSummary`
7. `commandGeneration`
8. `execution`

## Registration & Entry Points

The graph is invoked from:
- `repomixRunner.smartRun` registration in `src/extension.ts`.
- `src/webview/controllers/AgentController.ts` for webview-driven runs and history actions.

Always keep command/webview entry points aligned when changing graph inputs/outputs.

## Working with AgentState

`AgentState` includes:
- Core flow data: `userQuery`, `workspaceRoot`, `allFilePaths`, `candidateFiles`, `confirmedFiles`.
- Execution outputs: `finalCommand`, `outputPath`, `summaryPath`, `generateFile`.
- Metrics: `totalTokens`.
- Context optimization fields: `tokenBudget`, `blueprintSummary`, `processedFiles`, `fileRelevanceScores`.

Rules:
- Nodes must return partial state updates; do not mutate existing state objects.
- For counters/accumulators, use reducers in `state.ts` instead of ad-hoc mutation.
- If you add a state field used by UI/history, update controller message payloads and webview types.

## Node Implementation Rules

- Keep each node focused on one transformation.
- Handle failures inside nodes and return safe fallbacks where possible.
- Prefer structured outputs (Zod schema) for non-trivial model responses.
- Log node-level progress/errors with `logger` for troubleshooting.

## Prompts and LLM Calls

- Keep prompts in `prompts.ts` and call them from nodes.
- Use `llmClient.generateText(...)` for text and `llmClient.generateStructured(...)` for schema-validated outputs.
- Do not bypass `llmClient.ts`; it enforces queueing and retry behavior needed for stability.

## Context Optimization Notes

- `fetchBlueprint` and `optimizeContext` implement semantic-folding style context shaping.
- `processedFiles` should retain compression metadata (`full | skeleton | summary`) and token counts.
- Changes here must remain consistent with the compression engine in `src/core/compression/`.

## Validation Checklist

Before merging agent changes:
- `npm run check-types`
- `npm run lint`
- `npm run test`
- Manual smart-run from command and webview paths (including rerun/history flows).
