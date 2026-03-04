# Commitments Service PRD — Learnings

**Date**: 2026-03-03
**Branch**: feature/commitments-service
**PRD**: dev/work/plans/leverage-intelligence/prd.md

---

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 8/8 |
| First-attempt success | 7/8 (Task 5 timed out on first attempt; clean retry) |
| Iterations required | 0 (all reviewer verdicts: APPROVED) |
| Tests added | +83 net new tests (1152 → 1235) |
| Tests passing | 1235/1237 (2 pre-existing skips) |
| Commits | 11 on feature/commitments-service |
| Token estimate | ~72K total (~15K orchestrator + ~57K subagents) |

---

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| 1. Async signature contract (T1→T2) | No | Yes — always-async spec; T1 updated entity.ts placeholder | Yes |
| 2. Tests lag T1+2 changes | No | Yes — T1+2 ran `npm test` before commit; T3 confirmed zero gaps | Yes |
| 3. Hash reimplementation | No | Yes — local `computeCommitmentHash` mirrors `computeActionItemHash` formula; import avoided | Yes |
| 4. Sync ordering violation (T6) | No | Yes — explicit numbered steps 4 before 5; tested with call log ordering | Yes |
| 5. CLI prerequisite (T7 needs T5) | No | Yes — T5 wired factory before T7 dispatched | Yes |
| 6. Pruning uses `date` not `resolvedAt` | No | Yes — `shouldPrune()` guards `null` first; critical distinction in JSDoc and tests | Yes |
| 7. PATTERNS.md ripple to prepare-meeting-agenda | No | Yes — audit confirmed no step-number coupling; fallback in step 6 covers it | Yes |
| 8. `resolvedAt: null` pruning open items | No | Yes — explicit null guard; "commitment from 6 years ago resolved yesterday" test case | Yes |

**0/8 risks materialized.**

---

## What Worked Well

1. **Reviewer pre-work sanity check caught a real gap**: Task 1 reviewer flagged missing `entity.ts` call site in the context list and missing explicit test requirements. Without the sanity check, the developer might have left entity.ts broken at typecheck. The two-pass (reviewer → developer) pattern paid off immediately.

2. **Show-don't-tell prompts with code snippets**: Providing the exact cache pattern code in the Task 2 prompt (`const actionItemCacheKey = ...`) made the implementation a near-mechanical translation. Zero reviewer feedback required.

3. **Pre-mortem risk 6 (pruning date field) prevented a subtle bug**: The `shouldPrune()` function was built correctly from day one because the prompt had a ⚠️ callout and a concrete test case ("commitment from 6 years ago resolved yesterday"). Without the explicit callout, this would likely have been implemented with `date` instead of `resolvedAt`.

4. **Task 3 as audit rather than implementation**: Framing Task 3 as "verify and fill gaps" (rather than "write all tests") was correct. Tasks 1 and 2 already had strong test coverage; Task 3 confirmed completeness and added institutional verification. No wasted test-writing.

5. **First-render guard discovery (Task 6)**: The developer independently identified a deletion-detection edge case — if `fileHashes.size === 0`, deletion detection would falsely resolve all open commitments on the first render. The `fileHashes.size > 0` guard was not in the spec; the developer discovered it during implementation and documented it in LEARNINGS.md. Evidence that the context was sufficient for the developer to reason about correctness.

6. **personName fix caught before CLI**: Reviewing `sync()` after Task 5 (instead of after Task 7) caught `personName: personSlug` before it became a user-visible bug. A small orchestrator check prevented a CLI quality gap.

---

## What Didn't Work

1. **API timeout on Task 5**: The first attempt hit the Claude API timeout mid-execution (the subagent had started `npm run typecheck` and been cut off). The retry started fresh and succeeded. No partial state was left behind. This is a known risk for large tasks (~306 lines + 648 line test file in one session).

2. **Parallel subagent execution failed**: Attempted to run Tasks 1 and 4 in parallel (PARALLEL mode). The call returned `1/2 succeeded` with no error detail. Fell back to sequential. The execute-prd skill's standard sequential pattern is the right default — parallelism adds fragility without consistent speed gains.

---

## Subagent Insights

- **Task 1 developer**: The `extractStancesForPerson` pattern in LEARNINGS.md was the decisive context item — it pointed directly to the model to replicate. The 16 call-site updates needed for `ownerName` positional shift were mechanical but caught cleanly by typecheck.
- **Task 5 developer**: Caught a `createMockStorage` Map-copy bug (test infrastructure issue where `new Map(initial)` creates a copy, so writes to the service's internal map aren't visible through the outer reference). Added to LEARNINGS.md. Also surfaced a `node:test v23 hang` when a test in a named suite throws without resolution — hanging rather than reporting failure makes diagnosis hard.
- **Task 6 developer**: First-render guard discovery and good analysis of the sentinel comment pattern. Threading `CommitmentsService` through `RefreshPersonMemoryOptions` was described as clean thanks to the existing `callLLM` optional pattern.
- **Task 7 developer**: First use of `confirm()` from `@inquirer/prompts` in the codebase — documented the dynamic import pattern. The LEARNINGS.md "check `opts.json` on every exit path" prevented a subtle bug in the workspace guard path.

---

## System Improvements Applied

| File | Change |
|------|--------|
| `packages/core/src/services/LEARNINGS.md` | Added async signature gotcha for `extractActionItemsForPerson` (ownerName shift), LLM DI pattern for action items, Map copy bug in test mocks, node:test v23 hang |
| `.agents/sources/shared/cli-commands.md` | Added `arete commitments list` and `arete commitments resolve` to CLI reference |
| `dist/AGENTS.md` | Rebuilt — commitments CLI commands now discoverable |
| `dev/catalog/capabilities.json` | Added commitments-service capability entry |

---

## Recommendations

**Continue**:
- Reviewer sanity check before developer dispatch — caught a real gap on Task 1
- Show-don't-tell prompts with code snippets for cache patterns and ordering-sensitive flows
- Explicit ⚠️ callouts + concrete test cases for subtle invariants (pruning, null guards)
- Framing "verify tasks" as audit rather than "write tests from scratch"
- Orchestrator review of intermediate outputs (caught personName/slug issue before CLI)

**Stop**:
- PARALLEL mode for independent tasks — failed silently (`1/2 succeeded`, no detail). Sequential is more reliable for this skill.

**Start**:
- Add first-render edge cases to pre-mortem for any bidirectional sync feature (new file + detection logic = false positives on first run)
- For tasks with new `sync()` or `refresh()` patterns, ask: "what does this do on first run with an empty file?"
- Document `confirm()` usage pattern in CLI LEARNINGS.md for future commands that need destructive-action confirmation

---

## Documentation Updates Applied

- ✅ AGENTS.md rebuilt with `arete commitments` commands
- ✅ `dev/catalog/capabilities.json` updated
- ✅ LEARNINGS.md files updated in core/services and cli/commands
- ✅ Planning skills updated (daily-plan, week-plan, week-review, meeting-prep, process-meetings, PATTERNS.md)
