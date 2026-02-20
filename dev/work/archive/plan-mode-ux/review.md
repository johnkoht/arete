<!-- Extracted at 2026-02-18T05:25:28.596Z -->

## Review: Plan Mode Ux

**Type**: Plan  
**Audience**: Builder (internal Areté dev tooling)

### Concerns

1. **Acceptance criteria specificity**
   - Concern: Steps are clear, but ACs are still mostly implicit (“prefer compact status”, “keep detailed list available”).
   - Suggestion: Add explicit pass/fail ACs per step (e.g., exact fallback behavior, exact current-task selection order, exact truncation rule).

2. **Dependency clarity**
   - Concern: Step 4 (active persona) may duplicate logic introduced in Step 1 if ownership of role mapping isn’t centralized.
   - Suggestion: State that role derivation is implemented once in a shared helper consumed by footer/widget/status outputs.

3. **Backward compatibility guardrails**
   - Concern: Plan says “keep legacy todoItems path,” but doesn’t explicitly require no behavior change in non-PRD mode.
   - Suggestion: Add explicit regression AC: non-PRD build and plan-phase pipeline outputs remain unchanged.

4. **Test matrix completeness**
   - Concern: Good test intent, but missing explicit edge-case list for status parsing (e.g., `failed`, unknown statuses, empty stories, stale metadata).
   - Suggestion: Add a concrete test matrix with expected outputs for each edge case.

5. **Scope control**
   - Concern: “optionally execution context” in step 4 can invite scope creep.
   - Suggestion: Lock v1 to `activeCommand` only (as pre-mortem recommends), defer richer role telemetry.

### Strengths

- Scope is appropriate for **medium** (5 steps) and implementation-oriented.
- Pre-mortem risks are already aligned to likely failure modes.
- Correctly includes quality gates (`npm run typecheck`, `npm test`).
- Good emphasis on fallback safety and preserving legacy flow.

### Devil’s Advocate

**If this fails, it will be because...**  
the UI reads PRD progress and legacy todo progress from different paths without a single arbitration function, causing inconsistent status across footer, widget, and `/build status`.

**The worst outcome would be...**  
builders lose trust in execution state because the “current task” and completion counts disagree between surfaces, making plan-mode UX feel unreliable during autonomous builds.

### Verdict

- [ ] **Approve**
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise**

---

Plan:
1. Add explicit, testable ACs to each of the 5 plan steps (including deterministic selection and truncation behavior).
2. Define a single shared “progress source arbitration” helper and require all render surfaces to use it.
3. Lock role derivation scope to `activeCommand` for v1; defer execution-context role inference.
4. Expand tests to a concrete edge-case matrix (missing/invalid PRD JSON, unknown statuses, all complete, failed present, empty tasks, non-PRD fallback).
5. Add explicit regression criteria for non-PRD mode and plan-phase pipeline rendering, then proceed to implementation.