# Phase 10 — Extract latency baseline (AC0b)

**Phase**: phase-10a-pre
**AC**: AC0b — measure `arete meeting extract <slug>` wall-time on 3
typical meeting fixtures BEFORE 10b ships dedup pipeline.

This document records the regression baseline for AC13's "≤5s extra
per extract" gate. Post-10b extract latency on the same fixtures must
not exceed median + 5s for the gate to pass during the 14-day soak.

---

## Fixtures

Three fixtures are committed under
`packages/core/test/fixtures/meetings/`:

| Fixture                                       | Size   | LOC | Word-count (transcript only) |
|-----------------------------------------------|--------|-----|------------------------------|
| `2026-06-01-small-1on1.md`                    | small  |  31 | ~100 words                   |
| `2026-06-02-medium-product-review.md`         | medium | 113 | ~700 words                   |
| `2026-06-03-large-quarterly-review.md`        | large  | 223 | ~1,800 words                 |

Variation in size brackets typical 1:1 vs cross-functional vs QBR-style
meetings — covers the realistic spread John sees per week.

---

## Methodology

Each fixture is extracted 3 times; report the median wall-clock latency.
3 runs is enough to wash out network jitter on the LLM call without
turning baseline-capture into a multi-minute exercise.

Measurement script: `scripts/measure-extract-latency.ts`

```bash
# Pre-req: a clean workspace with AI credentials configured.
arete install /tmp/arete-baseline-ws --skip-qmd --ide cursor
# (or arete credentials login anthropic, etc.)

# Capture the baseline. Runs each fixture 3 times.
tsx scripts/measure-extract-latency.ts \
  --workspace /tmp/arete-baseline-ws \
  --runs 3 \
  --report dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator/baseline-latencies-results.md
```

Important constraints:
- **Workspace must NOT be arete-reserv.** This is a clean throwaway
  workspace so we never touch production commitments.json or memory
  files. The script copies fixtures into the target workspace, runs
  extract, and leaves the staged sections in the fixture meeting files
  (no `meeting apply` — no commitments are committed).
- **AI credentials are required** because `arete meeting extract`
  invokes the LLM for action-item / decision / learning extraction.
  This is the cost of capturing a real baseline; the alternative
  (mocked LLM) doesn't measure the latency that AC13 actually gates on.
- **Cost**: each run is one `fast`-tier call per fixture (per current
  ai.tasks.extraction routing). 3 fixtures × 3 runs ≈ 9 LLM calls.
  At `fast` tier, well under $0.05 total.

---

## Captured baseline

> **Status**: NOT YET CAPTURED. John runs the script above against a
> clean workspace with AI credentials present; paste the resulting
> table here. Until populated, AC13 has no anchor and Phase 10b's
> ≤5s gate cannot fire.

Placeholder table — replace with real measurements when captured:

| Fixture                                  | Size   | Median | Mean | Min  | Max  |
|------------------------------------------|--------|--------|------|------|------|
| 2026-06-01-small-1on1                    | small  | TBD    | TBD  | TBD  | TBD  |
| 2026-06-02-medium-product-review         | medium | TBD    | TBD  | TBD  | TBD  |
| 2026-06-03-large-quarterly-review        | large  | TBD    | TBD  | TBD  | TBD  |

**Captured by**: TBD
**Captured at**: TBD (ISO-8601)
**Workspace**: TBD
**Arete version**: TBD (output of `arete --version` at capture time)

---

## AC13 regression check (Phase 10b-min)

After the Phase 10b reactive dedup pipeline ships, re-run the same
measurement script against the same fixtures + a workspace that has
real commitments to dedup against (so the hybrid pipeline has work to
do). Compare medians:

  AC13 passes iff: post-10b median[fixture] ≤ baseline median[fixture] + 5,000ms

If any fixture exceeds the gate:
  1. Confirm `callConcurrent` is being used (F1 mitigation) — serial
     LLM calls fail by construction at K ≥ 5 candidate pairs.
  2. Profile the hybrid pre-filter (Jaccard + slug overlap) — should
     be sub-millisecond per candidate set.
  3. Check pre-filter candidate count distribution (M1 — if median > 5
     candidates per item, the cap is too tight and recall suffers; if
     the cap is enforced, LLM round-trip dominates).

---

## References

- Phase 10 plan §10a-pre, AC0b (line 535)
- Pre-mortem F1 (AIService batching) — `callConcurrent` is the
  AC13-budget mitigation
- `scripts/measure-extract-latency.ts` — the measurement script
- `packages/core/test/fixtures/meetings/` — the three fixtures
