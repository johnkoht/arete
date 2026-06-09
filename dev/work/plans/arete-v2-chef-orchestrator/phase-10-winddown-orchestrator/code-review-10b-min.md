# Phase 10b-min — Code Review

**Reviewer**: senior staff engineer (code-check pass)
**Date**: 2026-06-05
**Scope**: 5 commits (`7e1c397b`, `7d62233f`, `3128e840`, `be5e2d82`, `7f74f7d8`),
94 new tests, AC3a golden-set P=1.000 / R=0.900.

## Verdict: APPROVE WITH MINOR

The core delivery is real, deterministic, and well-tested. Every load-bearing
claim in the build report verifies against the source. The single material
risk is the explicit CLI-wiring gap — correctly disclosed in the build report,
zero false wiring in the CLI, but it leaves the F5 (concurrent-extract) and
F2 (badge inconsistency) mitigations dependent on the future wire-in step.
Promote to APPROVE once the `phase-10b-min(cli): wire pipeline into arete
meeting extract` follow-up lands with the same care.

## Per-commit verification table

| Commit | Step | Claim | Verified | Notes |
|---|---|---|---|---|
| `7e1c397b` | 1 | `commitment-dedup-pipeline.ts` pure module, 720 LOC, 46 tests | YES | `findDedupCandidates`/`runLLMCrossCheck`/`applyDedupDecisions`/`runDedupPipeline` + `commitmentToDedupInput` exist with documented signatures. Self-role exclusion present (line 696). |
| `7e1c397b` | 1 | Jaccard ≥0.6 + person-slug overlap ≥1 + direction match, cap top 5 | YES | Constants `DEDUP_JACCARD_THRESHOLD=0.6`, `DEDUP_CANDIDATE_CAP=5` at lines 169/172; gate logic at 346-379. |
| `7e1c397b` | 1 | Text-hash exact match short-circuits | YES | Lines 318-338 — returns `{kind:'exact-match'}` before pre-filter. |
| `7e1c397b` | 1 | Fail-safe UNCERTAIN on LLM throw | YES | Lines 524-532 — catches inside `runLLMCrossCheck`. |
| `7e1c397b` | 1 | Decision precedence SAME > UNCERTAIN > DIFFERENT | YES | Lines 570-619 of pipeline. |
| `7d62233f` | 2 | `commitment-dedup-extract.ts` orchestrator with `runExtractDedup` | YES | Signature matches build report; same-day filter at line 121. |
| `7d62233f` | 2 | Uses `commitments.withLock()` — caller-owned | DOCUMENTED ONLY | The module documents the contract (lines 144-150) but does NOT itself call withLock. The CLI must wrap. Consistent with build-report disclosure. |
| `7d62233f` | 2 | Same-day window enforced | YES | `filterSameDayOpenCommitments` filters status='open' + date prefix match (lines 121-133). |
| `7d62233f` | 2 | CLI wiring deferred | YES | Confirmed below — no false wiring in CLI. |
| `3128e840` | 4 | Apply flow honors dupe-of via existing skip_reason contract | YES | Test file at `test/integrations/staged-items-dupe-of.test.ts` (263 LOC, 5 tests). Asserts dupe item dropped from approved set, renders into "## Skipped on Apply" with `dupe_of_canon_42` reason + `chef` provenance. |
| `3128e840` | 4 | No conflict with followup-2 F5 cleanup at staged-items.ts:718-738 | YES | `git diff` shows staged-items.ts source UNTOUCHED between 7e1c397b^ and 7f74f7d8. The F5 block is byte-identical to its followup-2 state. |
| `be5e2d82` | 5 | `commitment-dedup-reverse-stamp.ts` uses `writeWithLock` + 60s mtime guard | YES | Source line 206: `mtimeGuardSeconds: 60`. Uses `writeWithLock` from `services/meeting-lock.ts` (verified exported, signature matches). |
| `be5e2d82` | 5 | Marker format matches `<!-- also surfaced in <slug> on YYYY-MM-DD -->` | YES | `buildReverseStampMarker` (line 81-87). |
| `be5e2d82` | 5 | Best-effort: lock/bootstrap errors absorbed into `abstainReason` | YES | Lines 208-217 — wraps writeWithLock in try/catch and returns `written:false` with the error message. |
| `7f74f7d8` | 6 | `dedup-decisions-log.ts` AC9 format | YES | Renderer line 81-98 produces `ISO decision new-id canonical-id jaccard tier llm-decision reasoning`. |
| `7f74f7d8` | 6 | Best-effort writer, gitignored | YES | `appendDedupDecisionLog` swallows errors (line 168). `.gitignore` line 129 added explicitly (already covered by `*.log`). |
| ALL | — | `phase-10b-min(scope): description` convention + Co-Authored-By | YES | All 5 messages match; trailer present on each. |
| ALL | — | dist files rebuilt | YES | `dist/services/commitment-dedup-{pipeline,extract,reverse-stamp}.js` + `dedup-decisions-log.js` exist with mtimes matching each commit. `tsc --noEmit` clean. |

## Golden-set P/R breakdown verification

Reproduced locally (deterministic, no network):

```
[AC3a golden-set] TP=9 FP=0 FN=1 TN=12 UNCERTAIN_TP=6 UNCERTAIN_MISS=2
[AC3a golden-set] precision=1.000 recall=0.900 (thresholds: P≥0.85, R≥0.80)
```

**Exact match** to the build-report claim. Breakdown of the 30 fixtures
(`test/services/commitment-dedup-pipeline.test.ts` lines 801-834):

- **SAME pairs (10)** — `g01`-`g10`. Variations on Dave/staffing, POP MVP,
  Jira tickets, Austin AI prompts, Anthony TDD, Isaiah prototype. Truth=SAME,
  expectedLLM=SAME on all 10. Result: TP=9, FN=1 (one SAME pair fails the
  Jaccard pre-filter — surfaces in stdout as a miss for soak observation).
- **DIFFERENT pairs (12)** — `g11`-`g22`. Distinct recipients (Anthony vs
  Lindsay, Austin vs Ashley) + distinct artifacts (Jira vs roadmap, deck vs
  one-pager). Truth=DIFFERENT, expectedLLM=DIFFERENT. Result: TN=12, FP=0.
- **UNCERTAIN pairs (8)** — `g23`-`g30`. Ambiguous timing/artifact (Dave
  staffing vs eng plan, Lindsay POP status with/without "this week",
  hackathon Runyon with/without "next month"). Truth=UNCERTAIN. Result:
  UNCERTAIN_TP=6, UNCERTAIN_MISS=2 (2 UNCERTAIN pairs fall to new-canonical
  because pre-filter doesn't pass them through to the LLM).

Precision computed as `(TP + UNCERTAIN_TP) / (TP + UNCERTAIN_TP + FP)` =
`(9 + 6) / (9 + 6 + 0)` = `1.000`. Recall computed as `TP / (TP + FN)` =
`9 / 10` = `0.900`. Both exceed AC3a thresholds (P≥0.85, R≥0.80).

**Threshold sweep (AC3)** — `test/services/commitment-dedup-pipeline.test.ts`
line 695-756: targets `[0.3, 0.5, 0.6, 0.7, 0.85, 0.95]`. Asserts REJECT
below 0.6 and PASS at-or-above. All 6 sweep iterations passing.

## Concerns (HIGH — must fix)

None.

## Minor concerns (LOW)

1. **F5 mitigation depends on CLI wire-in correctness.** The orchestrator
   documents that the caller MUST wrap invocation in `commitments.withLock(...)`
   (`commitment-dedup-extract.ts` lines 144-150), but the module itself
   doesn't enforce it (it doesn't hold a CommitmentsService handle). This is
   defensible — the orchestrator should stay handle-free — but the F5
   pre-mortem mitigation is now a runtime contract that's only verified by
   convention. Suggest the CLI wire-in commit add a `CommitmentsService`
   parameter to `runExtractDedup` OR pass an explicit `inLock: true` flag
   that the orchestrator asserts at call time. LOW because the contract is
   documented in three places and the build report calls it out.

2. **`runExtractDedup` is serial across items (K × ~600ms ≈ 6s for K=10).**
   The module doc (lines 152-157) notes this and points out the caller can
   `Promise.all` if tighter latency is needed. The AC13 ≤5s budget would
   miss at K=10 in the serial path. Within the orchestrator alone, the
   contract is fine — the pipeline already batches candidate pairs into one
   LLM prompt per item — but the CLI wiring should consider whether to
   `Promise.all` across items or keep serial. LOW; build report flags this
   in `## What's NOT Wired Yet`.

3. **`decorateStagedSectionsWithDupeBadges` regex is conservative.** The
   regex at line 264 of `commitment-dedup-extract.ts` matches only
   `(?:ai|de|le)_\d+` — fine for current ID shapes, but if a future Phase
   adds a new ID prefix (say `co_` for committed-style IDs), badges would
   silently no-op. Suggest a TODO comment referencing the IDPrefix
   convention. LOW.

4. **Idempotency claim on reverse-stamp** is "same slug → abstain;
   different slug → second stamp appended." Asserted by `reverse-stamp.test.ts`
   lines 188-220 + the unit test for `insertReverseStampIntoBody`
   (lines 89-95). What is NOT asserted: a second reverse-stamp for the SAME
   slug-and-date on a file that's also been touched at the body-end by a
   user. Unlikely in practice; suggest a soak observation note instead of
   blocking. LOW.

5. **Golden set is synthetic-on-real-patterns, not real arete-reserv text.**
   The build report acknowledges this and ties soak observation to it
   (re-evaluate P/R on actual workspace traffic). Worth flagging in the
   soak checklist that the AC3a numbers do NOT carry over to production
   automatically. LOW — already documented in the build report's "Soak
   Observations to Wait For" §1.

## CLI wiring gap — confirmed truly deferred

Searched the CLI exhaustively:

- `grep -rn "runExtractDedup\|commitment-dedup-extract\|commitment-dedup-reverse-stamp\|dedup-decisions-log" packages/cli/src/` → **0 hits**.
- `grep -n "runExtractDedup\|commitment-dedup\|dedup-decisions-log\|dedup-reverse-stamp\|applyReverseStamp" packages/cli/src/commands/meeting.ts` → **0 hits**.

The CLI does not import, reference, or invoke any of the four new modules.
This matches the build report's "What's NOT Wired Yet" section. There is no
silent half-wiring — the gap is binary (entirely absent), which is the
desired state for a "building blocks ready" commit. The follow-up commit
`phase-10b-min(cli): wire pipeline into arete meeting extract` will be the
right place to evaluate the F5 lock contract + same-day pool construction
+ slug→path resolution called out in the build report.

## Cross-cutting checks

- **94 tests, all passing**: re-ran each file independently —
  pipeline 46/46, extract 17/17, reverse-stamp 12/12, dedup-log 14/14,
  staged-items-dupe-of 5/5. Total 94 pass, 0 fail, matches build report.
- **Regression suite (133 tests)**: `commitments-hash-v2` (22),
  `commitments-counterparty-parser` (35), `ai-call-concurrent` (5),
  `commitments-withlock` (8), `integrations/staged-items` (63) all pass
  unchanged. The followup-2 F5 fix at `staged-items.ts:718-738` is
  byte-identical pre/post these commits.
- **No unmocked LLM imports**: `grep -l "ai-service\|AIService"` against
  all 5 test files → empty. All tests inject `LLMCallConcurrentFn` mocks.
- **Typecheck**: `npx tsc --noEmit` clean across the packages/core tree.
- **Self-role exclusion in adapter**: `commitmentToDedupInput` correctly
  drops `role: 'self'` stakeholders (line 696) — addresses M2 (R4
  self-stakeholder exclusion) at the dedup-input layer.
- **Tier defaulted to 'fast' everywhere**: pipeline (line 516), extract
  (line 171), dedup-log (line 109). Matches AC3a + eng Q1.

## Tests spot-checked for quality

1. **`pipeline.test.ts` AC3a golden-set assertion (line 837)** — produces
   the actual TP/FP/FN/TN counts to stdout for the build report. Mock LLM
   keys on `${newText}::${candText}` ensuring per-pair determinism. Solid.

2. **`pipeline.test.ts` threshold sweep (line 695)** — synthetic pair
   generator at each Jaccard target with explicit `>= 0.95 expected exact
   match` branch. Catches the boundary at 0.6 cleanly.

3. **`extract.test.ts` mock LLM (line 54)** — parses prompt structure to
   build the candidate-text key; ensures any prompt format drift in the
   pipeline would break the test rather than silently pass.

4. **`reverse-stamp.test.ts` `recent-user-edit` abstain (line 222)** —
   creates a file with `mtime = now`, asserts abstainReason matches
   `recent-user-edit` exactly. Real temp-dir + utimesSync exercise.

5. **`dedup-decisions-log.test.ts` `best-effort bad root` (line 230)** —
   passes a non-existent workspace root; asserts no throw. Validates the
   "never block extract" contract.

All five tests assert exact strings/numbers (not loose `.match()` on
substrings) where appropriate; mocks are tight; no flakiness windows.

## Summary

Build delivers exactly what it claims:
- 5 commits, clean conventions, all co-authored
- 94 new tests + 133 regression tests passing
- AC3a P=1.000 / R=0.900 reproducible offline
- CLI wiring gap correctly disclosed and binary-absent
- Pre-mortem F5/F2 mitigations present as design contracts (caller-side
  withLock, reverse-stamp marker), enforcement deferred to CLI wire-in
- Followup-2 F5 block at staged-items.ts:718-738 untouched

Recommend: APPROVE WITH MINOR. Promote to APPROVE on landing of the CLI
wire-in commit with concurrency-test coverage of two same-text concurrent
extracts (per F5 mitigation in plan).
