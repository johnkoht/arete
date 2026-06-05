# Build Report — Phase 11 11a (Gmail Sent auto-resolution)

**Status**: COMPLETE — 6 steps shipped, tests green, dist rebuilt, golden-set precision recorded.
**Scope**: CODE ONLY. No LLM execution against production, no production Gmail API calls, no production data writes, no actual auto-resolve against real commitments. All LLM + Gmail surfaces are injected/mocked.
**Built**: 2026-06-05

---

## Commits (per-step convention)

| Commit | Step(s) | Summary |
|---|---|---|
| `b85a342f` | Step 1 | Commitment Gmail-resolve fields + `external_resolution` AITask (fast tier) + type-shape tests |
| `c178b707` | Step 2 | `commitment-resolution-pipeline.ts` — hybrid pre-filter + LLM cross-check (41 tests) |
| `ed96ac6d` | Steps 3-6 | Directives + mutators + audit log + ordering guard + 50-pair golden set (56 tests) |

(Note: `7192f307 phase-10b-aux` interleaved on the branch from a different phase's agent — not part of 11a.)

---

## Files

### Source (new)
- `packages/core/src/services/commitment-resolution-pipeline.ts` — pure detection pipeline (Step 2).
- `packages/core/src/services/resolution-directives.ts` — directive parser + commitment mutators + promotion gate (Steps 3/4).
- `packages/core/src/services/resolution-decisions-log.ts` — `dev/diary/resolution-decisions.log` writer + parser + M4 repeat-detection (Step 5).
- `packages/core/src/services/resolution-ordering.ts` — auto-resolve vs followup-2 ordering guard (Step 6).

### Source (edited)
- `packages/core/src/models/entities.ts` — `Commitment` gains `resolvedBy` / `resolvedEvidence` / `resolvedConfidence` / `unresolveSuppressedUntil` / `resolveStagedAt` / `confirmedAt` (all optional).
- `packages/core/src/models/workspace.ts` — `AITask` gains `external_resolution`.
- `packages/core/src/services/ai.ts` — `DEFAULT_TASK_TIERS.external_resolution = 'fast'` (eng MC2).
- `packages/core/src/services/index.ts` — barrel exports for all four new modules.

### Tests (new) — 97 total, all pass
- `packages/core/test/models/commitment-phase11-shape.test.ts` (6)
- `packages/core/test/services/commitment-resolution-pipeline.test.ts` (41)
- `packages/core/test/services/resolution-directives.test.ts` (29)
- `packages/core/test/services/resolution-decisions-log.test.ts` (11)
- `packages/core/test/services/resolution-ordering.test.ts` (5)
- `packages/core/test/services/resolution-golden-precision.test.ts` (4)
- `packages/core/test/services/resolution-integration.test.ts` (10)
- `packages/core/test/services/fixtures/resolution-golden-set.ts` (50-pair fixture + extended bank)

### Docs
- `dev/work/plans/.../golden-set-phase-11.md` — golden-set companion.

---

## Test status

- **Phase 11 11a suite**: 97 tests, **97 pass / 0 fail**.
- **Full `@arete/core` suite**: 3811 tests, 3796 pass / **15 fail**. All 15 failures are **PRE-EXISTING** at baseline `7d266604` (topic-detection alias matching, buildMeetingContext, refreshPersonMemory, brief-no-llm) — verified by running the baseline tree: identical 15 failures, zero of them in files 11a touched. **No 11a regressions.**

### AC3a golden-set precision (recorded)

```
[AC3a] golden-set: precision=1.000 recall=1.000 (HIGH=6, MATCH=6)
```

- 50 pairs: 6 anchor MATCH (RESOLVE-6 from triage) + 30 synthetic NO-MATCH + 14 judgment-call AMBIGUOUS.
- **Precision = 1.000** (floor 0.95) — zero false-positive HIGH on any NO-MATCH or AMBIGUOUS pair.
- **Recall = 1.000** (floor 0.50) on the anchor positives.
- All 14 AMBIGUOUS pairs land at MEDIUM/ignore — never auto-resolved.
- LLM held constant via a calibrated deterministic oracle so the gate measures the pipeline, not model variance.

---

## AC coverage

| AC | Status | Where |
|---|---|---|
| AC2 (HIGH basic) | ✅ | pipeline `resolve-high`; integration test |
| AC2a (week-1 confirm-gate) | ✅ | `stageResolve` keeps status=open; integration `stage→confirm` |
| AC2b (`[[unconfirm]]` 24h) | ✅ | `applyUnconfirm` window; directive + integration tests |
| AC3 (false-positive guard) | ✅ | FINAL-deck vs deck-draft → MEDIUM (pipeline test) |
| AC3a (precision ≥0.95) | ✅ | golden-precision test: 1.000 |
| AC3b (temporal=commitment.date) | ✅ | `inTemporalWindow`; Mon-meeting/Wed-evidence/Thu-process integration |
| AC5 (audit + phase attribution) | ✅ | `source_external` + `resolvedEvidence`; `resolution-decisions.log` `phase=p11-11a` (F1) |
| AC6 (`[[unresolve]]` → reopen + 14d suppress) | ✅ | `applyUnresolve`; preserves `source_external` |
| AC6a (only auto/staged) | ✅ | user-resolved → no-op + guidance |
| AC6b (structural suppress skip) | ✅ | `isSuppressed` pre-check; suppress-loop integration (no LLM call) |
| AC6c (`--permanent` 2100 sentinel) | ✅ | `applyUnresolve({permanent})`; never re-resolves |
| AC7 (`[[confirm]]` → user-resolve) | ✅ | `applyConfirm`; `resolvedBy='user'` (Q3) |
| AC8 (ordering G1/M2) | ✅ | `decideResolutionOrdering`; `+gmail:<id>` multi-source |
| M2 (cross-ref deferred-log) | ✅ | `RESOLVE-DEFERRED-TO-FOLLOWUP-2` action + multi-source evidence string |
| M4 (permanent + repeat-detection) | ✅ | sentinel + `hasPriorUnresolveForEvidence` (30d) |
| M5 (role=self excluded) | ✅ | adapter drops `role:'self'`; explicit no-match-no-LLM test |
| F1 (phase attribution) | ✅ | `phase=p11-11a` log column |
| F2 (no bulk confirm, promotion gate) | ✅ | `[[confirm-all-week-1]]` rejected; `evaluatePromotionGate` requires BOTH zero-unresolve AND ≥1 confirm |

---

## Verification commands

```bash
# Typecheck
npx tsc -p packages/core --noEmit

# Phase 11 11a suite (97 tests)
ARETE_SEARCH_FALLBACK=1 npx tsx --test \
  packages/core/test/models/commitment-phase11-shape.test.ts \
  packages/core/test/services/commitment-resolution-pipeline.test.ts \
  packages/core/test/services/resolution-directives.test.ts \
  packages/core/test/services/resolution-decisions-log.test.ts \
  packages/core/test/services/resolution-ordering.test.ts \
  packages/core/test/services/resolution-golden-precision.test.ts \
  packages/core/test/services/resolution-integration.test.ts

# AC3a precision number
ARETE_SEARCH_FALLBACK=1 npx tsx --test packages/core/test/services/resolution-golden-precision.test.ts 2>&1 | grep AC3a

# Build dist
npm run build:packages
```

---

## Critical invariants honored

- NO LLM calls against arete-reserv — LLM injected as `callConcurrent`; every test uses a deterministic mock.
- NO production Gmail API calls — provider not invoked; `EmailThread` fixtures only.
- NO production data writes — pipeline + mutators are pure; the one append test uses an `os.tmpdir()` dir.
- DID NOT touch: `integrations/gws/*` (consumed `EmailThread` + `normalizeEmail` read-only), `commitment-dedup-pipeline.ts`, `staged-items.ts`.
- dist rebuilt after each commit.

---

## EXPLICIT user-gated steps remaining (before any real auto-resolve run)

1. **Golden-pair labeling (M1)** — the 14 AMBIGUOUS rows + a spot-check of the 30 negatives are SYNTHETIC placeholders. John's scheduled 45-min labeling session must relabel them. After relabel, re-run the precision gate; if it drops below 0.95, ship 11a as MEDIUM-only surface (no auto-resolve) per AC3a.
2. **Chef-orchestrator wire-in** — this build delivers the pure core (pipeline + mutators + log + ordering). The winddown gather-phase wire-in (reads Gmail Sent cache + people-dir + commitments under `withLock`, runs `decideResolutionOrdering` first, applies mutators, writes the log line, surfaces the "Staged for confirm" / "Possibly already done" sections) is NOT yet wired into `SKILL.md` / the CLI verb `arete commitments resolve-from-gmail`. That wiring + the `[[…]]` directive handler dispatch belong to the wire-in / 11-audit step.
3. **1-day soak** — after wire-in, 1 day of confirm-gated week-1 operation before promotion to auto-mutate; promotion requires zero `[[unresolve]]` AND ≥1 explicit `[[confirm]]` (F2).
4. **First real auto-resolve run** — only after (1)+(2)+(3) and an explicit user GO. Feature flag `PHASE_11_AUTO_RESOLVE_ENABLED` (AC13) gates the path; default OFF until soak clean.
