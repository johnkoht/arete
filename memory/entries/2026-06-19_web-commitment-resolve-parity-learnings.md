# web-commitment-resolve-parity — execution learnings (2026-06-19)

Overnight autonomous /ship run (orchestrator + subagents). Branch `feature/web-commitment-resolve-parity`. Stopped at merge gate for builder review.

## Metrics
- Tasks: 3/3 (PATCH→resolve() parity, debounced reindex, tests+build).
- Tests: `intelligence.test.ts` 36/36 (5 new + 2 review-driven + extended existing). Full backend suite 369/371 — the 2 remaining fails are pre-existing in `agent.test.ts` (verified against base, unrelated).
- Subagents: 2 reviews (plan + pre-mortem) pre-build; 2 build agents (both stalled — see below); 1 adversarial post-build review.
- Commits (feature branch): artifacts `80349f65`, impl `29a534ca`, review follow-ups `ec64f0cd`.

## Pre-mortem effectiveness
- Pre-mortem: 0 CRITICAL, 3 HIGH, 4 MEDIUM. All 3 HIGH materialized as real implementation hazards and were mitigated:
  - HIGH-1 (mutex poison/leak): settled-promise queue. Did NOT materialize (verified + sibling-isolation test).
  - HIGH-2 (async double-construct): promise-memo set pre-await. Did NOT materialize.
  - HIGH-3 (vacuous concurrency test): proven RED (1/60) without mutex, GREEN (60/60) with. High value — without HIGH-3 the test could have passed for the wrong reason.
- The /review caught the core blocker the prior architectural review missed (memoized shared instance reopens the `holdsLock` lost-write window). Layered review (architectural → plan /review → pre-mortem → post-build review) each caught something the previous missed.

## What worked / what didn't
- + Layered adversarial review found the load-modify-save race (`resolve()` load()s outside the lock) — the real reason the mutex (not just the cross-process lock) is required.
- + RED/GREEN proof on the concurrency test is the single most valuable artifact: it proves the guard, not just the fix.
- − **Subagents self-censor on source edits when the session is in plan mode** — both build subagents refused to write code (the doc-writing review/pre-mortem agents were willing to write markdown). Orchestrator's own writes were unaffected. Net: orchestrator executed the build directly from the approved implementation plan.
- − **git worktrees don't copy `node_modules`** — symlinked the worktree's root node_modules to main's (core unchanged; tsx runs the worktree's backend source). Build/test then clean.
- − Backend tests do NOT inherit `ARETE_SEARCH_FALLBACK=1` (root test script sets it for core/cli globs only) — set it in the test file; added a `{refreshQmd, debounceMs}` DI seam for deterministic debounce testing.

## Recommendations
- Continue: layered review + RED/GREEN proof for any concurrency/data-integrity change.
- Start: for overnight /ship, exit plan mode (or never enter it) BEFORE dispatching build subagents, so they can edit source.
- Consider: a shared test helper for "build a temp workspace + commitments.json + week.md" — three describe blocks re-seed it.

## Follow-ups
- PR note: routing through `createServices()` newly activates prune-safety + back-prop AND changes the single-item PATCH from exact-id to prefix matching (benign; UI sends full ids). 409 now reachable.
- Optional later: server-side `bulkResolve` batching if the serialized path proves slow at scale (deferred in plan).
