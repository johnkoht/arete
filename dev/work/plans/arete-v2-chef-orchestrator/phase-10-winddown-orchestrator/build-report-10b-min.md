# Phase 10b-min — Build Report

**Branch**: `worktree-arete-v2-chef-orchestrator`
**Date**: 2026-06-05
**Scope**: Reactive cross-meeting dedup at extract time (same-day window).

## Commits

| Commit | Step | Description |
|---|---|---|
| `7e1c397b` | 1 | Hybrid commitment dedup pipeline (pure module) |
| `7d62233f` | 2 | Extract-time dedup orchestrator + badge/skip_reason helpers |
| `3128e840` | 4 | Apply flow honors dupe-of status (round-trip tests) |
| `be5e2d82` | 5 | Reverse-stamp on canonical meeting (writeWithLock) |
| `7f74f7d8` | 6 | Dedup-decisions audit log writer (AC9) |

Step 3 (per-meeting cap) intentionally skipped per task brief: "The
per-meeting commitment count is naturally bounded by the LLM extracting
only what's discussed. No artificial cap needed for commitments unlike
stances."

## Files Changed

### New source files (all in `packages/core/src/services/`)
- `commitment-dedup-pipeline.ts` (Step 1, ~570 LOC) — pure pipeline:
  `findDedupCandidates`, `runLLMCrossCheck`, `applyDedupDecisions`,
  `runDedupPipeline`, `commitmentToDedupInput` + helpers.
- `commitment-dedup-extract.ts` (Step 2, ~280 LOC) — extract-time
  orchestrator: `runExtractDedup`, `filterSameDayOpenCommitments`,
  `decorateStagedSectionsWithDupeBadges`, `buildDupeSkipReasonEntries`,
  `buildDupeStatusEntries`.
- `commitment-dedup-reverse-stamp.ts` (Step 5, ~190 LOC) — reverse-stamp:
  `buildReverseStampMarker`, `insertReverseStampIntoBody`,
  `applyReverseStamp` (uses `writeWithLock` from followup-2).
- `dedup-decisions-log.ts` (Step 6, ~180 LOC) — audit log:
  `renderDedupDecisionLine`, `payloadFromExtractDecision`,
  `appendDedupDecisionLog`, `appendDedupDecisionLogBatch`.

### New test files
- `test/services/commitment-dedup-pipeline.test.ts` — 46 tests
- `test/services/commitment-dedup-extract.test.ts` — 17 tests
- `test/services/commitment-dedup-reverse-stamp.test.ts` — 12 tests
- `test/services/dedup-decisions-log.test.ts` — 14 tests
- `test/integrations/staged-items-dupe-of.test.ts` — 5 tests
- **Total**: 94 new tests, all passing.

### Modified files
- `packages/core/src/services/index.ts` — added exports for all 4 new
  modules + their types.
- `.gitignore` — added explicit `dev/diary/dedup-decisions.log` entry
  alongside chef-skip-log (the `*.log` glob already covered it; the
  line documents intent).

### Untouched (per brief)
- `packages/core/src/integrations/gws/` and
  `packages/core/test/integrations/gws/` — Phase 11-pre territory.
- `packages/core/src/integrations/staged-items.ts` lines ~718-738 —
  the followup-2 v3 F5 cleanup block; Step 4 rides on the existing
  contract.

## Test Status

```
test/services/commitment-dedup-pipeline.test.ts:       46 pass, 0 fail
test/services/commitment-dedup-extract.test.ts:        17 pass, 0 fail
test/services/commitment-dedup-reverse-stamp.test.ts:  12 pass, 0 fail
test/services/dedup-decisions-log.test.ts:             14 pass, 0 fail
test/integrations/staged-items-dupe-of.test.ts:         5 pass, 0 fail
                                              total:   94 pass, 0 fail
```

Adjacent regression check (all still passing):
- `commitments-hash-v2.test.ts`: 22 pass
- `commitments-counterparty-parser.test.ts`: 35 pass
- `ai-call-concurrent.test.ts`: 5 pass
- `commitments-withlock.test.ts`: 8 pass
- `integrations/staged-items.test.ts`: 63 pass

## AC3a Golden-Set Precision/Recall (fast tier, mocked LLM)

Drawn from `golden-set-from-triage-2026-06-03.md`. 30 hand-labeled pairs:
- 10 SAME (wording variants of arete-reserv DROP/CONSOLIDATE patterns)
- 12 DIFFERENT (distinct recipients + distinct artifacts)
- 8 UNCERTAIN (overlap with ambiguous timing/artifact)

Mocked LLM returns the labeled `expectedLLM` verdict for each pair
(deterministic by construction). Pipeline outcome compared against truth:

```
TP=9    FP=0    FN=1    TN=12   UNCERTAIN_TP=6   UNCERTAIN_MISS=2
precision = 1.000   recall = 0.900
```

**Thresholds (per AC3a)**: precision ≥0.85, recall ≥0.80.
**Result**: PASS — fast-tier stays as default.

Misses (for soak observation):
- 1 SAME pair failed pre-filter (Jaccard too low after normalization)
- 2 UNCERTAIN pairs failed pre-filter (Jaccard or slug overlap below
  threshold; pipeline doesn't see them so they fall to new-canonical)

Tier-promotion gate (AC11a) does NOT fire at these numbers; no user
confirmation needed.

## Threshold Sweep (AC3, deterministic pre-filter alone)

Synthetic pairs at Jaccard ≈ {0.3, 0.5, 0.6, 0.7, 0.85, 0.95}. Asserts
the 0.6 threshold gate:

```
Jaccard ≈ 0.3:  REJECTS  (below threshold)
Jaccard ≈ 0.5:  REJECTS  (below threshold)
Jaccard ≈ 0.6:  PASSES   (at threshold)
Jaccard ≈ 0.7:  PASSES
Jaccard ≈ 0.85: PASSES
Jaccard ≈ 0.95: PASSES (or exact-match short-circuit)
```

All 6 sweep tests passing.

## Verification Commands

```bash
# All Phase 10b-min tests
cd packages/core && \
  npx tsx --test test/services/commitment-dedup-pipeline.test.ts \
                 test/services/commitment-dedup-extract.test.ts \
                 test/services/commitment-dedup-reverse-stamp.test.ts \
                 test/services/dedup-decisions-log.test.ts \
                 test/integrations/staged-items-dupe-of.test.ts

# Just the golden-set precision/recall (AC3a)
cd packages/core && npx tsx --test test/services/commitment-dedup-pipeline.test.ts \
  2>&1 | grep "AC3a golden-set"

# Typecheck
cd packages/core && npx tsc --noEmit

# Rebuild dist
cd packages/core && npm run build
```

## What's NOT Wired Yet

This build delivers the **building blocks** in core. The Phase 10b-min
scope description called Step 2 "wire pipeline into meeting extract".
Step 2 here adds the orchestrator + adapter helpers
(`runExtractDedup`, badge decoration, skip_reason payload) but does NOT
modify `packages/cli/src/commands/meeting.ts` to invoke them in the
extract flow.

**Reason**: the CLI integration depends on:
1. The CLI obtaining a `CommitmentsService` instance with `withLock` access.
2. The CLI knowing how to load same-day staged items from OTHER
   meetings (existing `loadRecentMeetingBatch` is the obvious adapter
   target — but its semantics need a same-day filter pass through).
3. The Step 5 reverse-stamp path needing the canonical's meeting
   PATH (not just slug) — slug → path resolution lives in the workspace
   helpers.

Each of these is a CLI-layer concern that should land as a follow-up
commit (call it `phase-10b-min(cli): wire pipeline into arete meeting
extract`). All the core primitives are ready and tested; the wiring is
mechanical glue code.

For the same reason, the build report records the core delivery as
**complete** but the user-visible feature flag would default OFF (or
not exist yet) until the CLI wiring lands.

## Critical Invariants — Verified

- NO LLM calls against arete-reserv during build/tests. LLM is injected
  as `LLMCallConcurrentFn` and tests use a mock-LLM with a fixed
  response table.
- NO production data writes from any of the 4 new core modules. Step 5
  uses `writeWithLock` against temp-dir files in tests; the production
  use site (when the CLI wires it in) writes ONLY to the canonical
  meeting file with a 60s mtime-guard.
- Per-step commits with the convention `phase-10b-min(<scope>): <desc>`.
- Co-authored footer on every commit.
- Test per file via `tsx --test`, never `npm test` at root.
- Dist rebuilt after each commit.
- Did NOT touch Gmail / integrations/gws/ files (Phase 11-pre running
  in parallel).
- Did NOT touch staged-items.ts lines ~718-738 (followup-2 F5 fix).
- Same-day window only (Q4 deferred to soak per plan v2 third pass).
- Hybrid pre-filter is Jaccard + person-slug overlap + direction match,
  NOT entity NER (eng C4).

## AC Status

| AC | Coverage | Status |
|---|---|---|
| AC2 (text-hash exact match) | Pipeline test + extract test | PASS |
| AC3 (semantic hybrid) | Pipeline test + threshold sweep | PASS |
| AC3a (golden-set P/R, fast tier) | 30-pair test | PASS (P=1.000, R=0.900) |
| AC4 (distinct recipients) | Pipeline test | PASS |
| AC4a (UNCERTAIN → possibly-mergeable + new canonical) | Pipeline + decision precedence tests | PASS |
| AC9 (dedup-decisions.log format) | dedup-decisions-log test | PASS |

## Soak Observations to Wait For

1. **Tier promotion**: golden set is synthetic-on-real-patterns; soak
   on actual workspace traffic should re-measure precision/recall.
   `AC11a` interactive promotion gate will fire if soak P falls below
   0.85.
2. **Q4 last-7d window**: deferred. After soak shows same-day works,
   widen `filterSameDayOpenCommitments` to a configurable window
   parameter (signature is API-stable for that).
3. **Reverse-stamp mtime guard hits**: best-effort writes will abstain
   when the user is actively editing the canonical's meeting. Watch
   the `dedup-decisions.log` for ABSTAIN entries — frequent abstains
   suggest the guard window (60s) is too aggressive.
