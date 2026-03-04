
Test lane guidance for LLM/code agents working in this repository.

Dual-lane model:
- Unit lane (`npm run test:unit`): plain Node + Mocha, no VS Code extension host.
- Integration lane (`npm run test:integration`): VS Code extension host (`vscode-test`).

Core rules:
1) Put tests in the unit lane by default.
2) Put a test in integration lane only if it needs real `vscode` APIs or extension activation behavior.
   Also use integration lane if the module under test imports `vscode` transitively.
3) Keep lane entrypoints updated:
   - `src/test/lanes/unit.entry.test.ts`
   - `src/test/lanes/integration.entry.test.ts`
4) Never add placeholder tests that only assert hardcoded strings/truthy values.
5) For bug fixes, write/adjust a failing test first when practical.

Recommended test quality checklist:
- Arrange/Act/Assert is obvious.
- One behavioral expectation per test.
- Deterministic setup/teardown (no shared global mutable state leakage).
- Use sandboxed stubs/mocks (`sinon.createSandbox()` + `restore()`).
- Use temp dirs for filesystem work and clean them up in teardown.

Naming and layout:
- Use `*.test.ts` suffix.
- Keep tests near feature domains under `src/test/**`.
- Use clear suite names matching production modules.

Commands:
- `npm run compile-tests` compiles tests/sources with `tsconfig.test.json` into `out-test/`.
- `npm run test:unit` runs the unit lane entrypoint with a lightweight `vscode` shim.
- `npm run test:integration` runs VS Code-hosted integration lane entrypoint.
/
export const TEST_AGENT_GUIDE_VERSION = '1.0.0';
