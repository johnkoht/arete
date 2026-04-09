# Extraction Intelligence Learnings

**Date**: 2026-04-09
**PRD**: `dev/work/plans/extraction-intelligence/prd.md`
**Execution**: `dev/executions/extraction-intelligence/`

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 9/9 (100%) |
| First-attempt success | 9/9 (100%) |
| Total iterations | 1 (+ code review pass) |
| Tests added | ~48 new tests |
| Final test count | 475 passing (core), 45 passing (backend) |
| Commits | 3 (feat + review fixes + backend tests) |
| Files changed | 10 source + test files |

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| MeetingIntelligence type breaks downstream | No | Yes (optional fields) | Yes |
| LLM response format change parse failures | No | Yes (dual-format parser) | Yes |
| Trivial pattern filters too aggressive | Partially | Yes (DECISION_VERBS safety check) | Yes — review expanded patterns |
| Batch LLM review inconsistent JSON | No | Yes (3-layer parse: direct/strip/regex) | Yes |
| Memory file parsing assumptions wrong | No | Yes (verified format from staged-items.ts) | Yes |
| Reconciliation context loading latency/failure | No | Yes (try/catch, empty fallback) | Yes |
| Test mock pattern divergence | No | Yes (separate concerns per test) | Yes |

## What Worked

- **Parallel confidence arrays** — `(number | undefined)[]` with conditional inclusion (`hasDecisionConf && { decisionConfidences }`) is backwards-compatible and honest about undefined values. Code review caught the original `as number` cast bug early.
- **Two-layer dedup architecture** — self-review at extraction (prompt hardening, trivial filters) + batch LLM review post-reconciliation gives defense in depth without adding latency to the extraction call itself.
- **Function injection for `callLLM`** — keeps `batchLLMReview` testable as a pure function. Mock LLM returns are trivial to set up.
- **Code review as a phase gate** — caught 2 critical bugs (undefined cast, word-boundary negation), 2 high-severity edge cases (timezone, redundant I/O), and 1 security concern (prompt injection). Would have shipped bugs without it.

## What Surprised Us

- **`isGarbageItem` 150-char limit applied to decisions/learnings** — the shared garbage filter had action-item-specific constraints (length, multi-sentence) that silently dropped long but valid decisions. Had to create `isGarbageDecisionOrLearning()`.
- **Worktree symlink resolution** — `node_modules/@arete/core` symlinks to the main repo's `packages/core`, not the worktree's. Backend/CLI type-checks against stale dist. Required temporarily copying source to main repo to rebuild dist for testing.
- **`"not"` substring matching** — `"notification".includes("not")` is true. The negation marker check was triggering on any word containing "not" (notification, another, note, annotate). Word-boundary regex `\bnot\b` fixed it.

## Non-Obvious Decisions

- **YYYY-MM-DD string comparison for dates** — `new Date("2026-04-01")` parses as UTC midnight while `new Date()` gives local time. Comparing Date objects crosses timezone boundaries. String comparison of ISO date strings avoids this entirely and is simpler.
- **Sanitize LLM prompt inputs** — `batchLLMReview` truncates item text to 200 chars and strips `{}[]` before interpolating into the prompt. Mitigates prompt injection from user-editable memory files.
- **Cache reconciliation context** — `loadReconciliationContext()` was called twice (once for reconciliation, once for batch review). Caching the first result eliminated redundant file I/O.
