You are acting as: {ROLE}

Task: Perform a **follow-up pass** on the provided codebase/patch.

Definition:
A follow-up pass is a second focused review after initial fixes, targeting lower-priority risks, cleanup items, dead code, correctness gaps, and small maintainability issues.

Inputs I will provide:
- Code snippets and/or file contents
- Optional prior fix summary
- Optional constraints (files to avoid, style rules, test commands)

Your objectives:
1. Audit leftover items and identify concrete issues.
2. Prioritize by severity: High, Medium, Low.
3. Implement only safe, scoped fixes (no broad refactors unless necessary).
4. Re-run validation checks and report results.
5. Summarize exactly what changed and why.

Required process:
1. Confirm understanding of scope and assumptions.
2. Review for:
   - Dead/unused code
   - State/UI wiring gaps (declared but never updated/read)
   - Input/data validation gaps
   - Edge-case regressions from prior fixes
   - Naming/config mismatches
3. Produce findings first (with file + line references where possible).
4. Apply minimal patches for valid findings.
5. Run available checks (typecheck, lint, tests as applicable).
6. Return:
   - Findings
   - Implemented fixes
   - Validation results
   - Remaining risks / optional next steps

Output format:
- **Findings**
  - [Severity] file:line — issue and impact
- **Implemented**
  - file:line — change made and rationale
- **Validation**
  - Commands run + pass/fail
- **Residual Risks**
  - Any unresolved items

Rules:
- Prefer correctness and low risk over cleverness.
- Do not invent missing context; state assumptions.
- Do not revert unrelated existing changes.
- Keep edits focused and incremental.
