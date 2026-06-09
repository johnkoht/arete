# Phase 11 11a — Gmail auto-resolve golden set (50 pairs)

**Purpose**: AC3a precision floor (≥0.95) + recall floor (≥0.50) ground truth for the Gmail Sent external-resolution pipeline.
**Machine-readable source of truth**: `packages/core/test/services/fixtures/resolution-golden-set.ts` (`GOLDEN_SET`). This markdown is the human companion; the precision gate runs against the TS fixture.
**Status**: SYNTHETIC seed (this build). Per M1 / AC3a, the 14 judgment-call rows are placeholders pending John's 45-min labeling session; the precision gate is wired and PASSES on the synthetic seed, and re-runs on John's relabel without code change.

## Composition (M1)

| Bucket | Count | Source |
|---|---|---|
| Anchor positives (MATCH) | 6 | RESOLVE-6 from `golden-set-from-triage-2026-06-03.md` (CoverWhale/Leap DOI feedback ×2, status-letter draft, new-engineer overview session, POP MVP plan, one-pager) |
| Synthetic negatives (NO-MATCH) | 30 | Mechanical cross-product: wrong recipient, pre-commitment send, far-future send, named-artifact-without-corroboration, wrong-artifact-identity, action-mismatch (call/schedule), self-send |
| Judgment-call ambiguous (AMBIGUOUS) | 14 | Draft-vs-final / partial-delivery near-misses (FINAL deck vs deck-draft, signed contract vs unsigned, spec doc vs spec outline, …) |
| **Total** | **50** | |

## Label semantics

- **MATCH** → pipeline must reach `resolve-high` (HIGH). Counts toward precision numerator + recall.
- **NO-MATCH** → must NOT reach HIGH. Most are culled by the deterministic pre-filter (recipient / temporal / artifact); the remainder return LOW.
- **AMBIGUOUS** → must reach at most `flag-medium` (MEDIUM, winddown-surface only). NEVER `resolve-high` (trust crater).

## Result on synthetic seed (this build)

```
[AC3a] golden-set: precision=1.000 recall=1.000 (HIGH=6, MATCH=6)
```

- Precision = HIGH-on-MATCH / all-HIGH = 6/6 = **1.000** (floor 0.95). Zero false-positive HIGH on any NO-MATCH or AMBIGUOUS pair.
- Recall = MATCH-resolved / MATCH-total = 6/6 = **1.000** (floor 0.50).
- All 14 AMBIGUOUS pairs resolve to MEDIUM/ignore, never HIGH.

The precision test (`resolution-golden-precision.test.ts`) holds the LLM constant via a **calibrated deterministic oracle** (HIGH only when artifact delivered + topic shared + not draft/partial; MEDIUM on draft-vs-final or partial-delivery; LOW otherwise), so the gate measures the PIPELINE (pre-filter + outcome synthesis), not model variance.

## User-gated relabel (M1)

The 14 AMBIGUOUS rows + spot-check of the 30 negatives are placeholders for John's 45-min labeling session. When John relabels:
1. Edit labels in `resolution-golden-set.ts` (and mirror here).
2. Re-run `tsx --test packages/core/test/services/resolution-golden-precision.test.ts`.
3. If precision < 0.95 after relabel → ship 11a as MEDIUM-only surface (no auto-resolve), per AC3a.

`GOLDEN_EXTENDED_POSITIVES` (7 extra MATCH pairs, NOT part of the 50) is available for recall stress-testing during soak re-evaluation.
