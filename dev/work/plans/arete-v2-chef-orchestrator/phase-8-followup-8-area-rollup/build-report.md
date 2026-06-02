---
title: "Phase 8 followup-8 — area-rollup gap fix — build report"
slug: phase-8-followup-8-area-rollup-build-report
created: "2026-05-27"
parent: phase-8-followup-8-area-rollup
sub-orchestrator: build-orchestrator (Claude)
status: build-complete
---

# Build report — phase-8 followup-8 area-rollup gap

## Pre-flight result

PASS. Worktree on `worktree-phase-8-followup-8-area-rollup`, plan revisions
commit `92b401ce` reachable, parent followup-5 commits present,
`plan.md` + `pre-mortem.md` present at expected path, `node_modules/@arete/core`
present.

## Hash invariance verified: "computeCommitmentHash(text, slug, dir) is invariant when constructed Commitment.area differs"

This explicit GATE test lives at `packages/core/test/services/commitments.test.ts`
inside `describe('CommitmentsService — hash invariance gate (AC5/C2, R3)', ...)`.
It calls the now-exported `computeCommitmentHash` directly with the same
`(text, personSlug, direction)` triple but reads it back via three different
constructed Commitments differing in `area` and `areaSetBy`. All three rehash
to byte-identical output.

The pre-mortem named R3 (silent hash regression) as the single most likely
silent failure of this followup; the gate is the structural defense and would
fail loudly if a future change folds `area` into the hash inputs.

## AC by AC

### AC1 — Extract-time area propagation (Path B): SHIPPED

- `packages/core/src/services/meeting-parser.ts`:
  - `ParsedActionItem.area?: string` added
  - `parseActionItemsFromMeeting(...)` gains optional `meetingArea` parameter
  - Area threaded onto every returned item as metadata (NOT folded into hash)
- `packages/core/src/services/entity.ts:refreshPersonMemory`:
  - reads `parsed.frontmatter.area` and threads via the new param
- Tests added in `meeting-parser.test.ts` covering: populated, undefined,
  empty-string falsy, and explicit hash-invariance contract.

No deviations.

### AC2 — Area-inference fallback: SHIPPED with C1 revision

- `EntityService.setAreaParser(parser)` injector added (mirrors the
  `setCreateTaskFn` pattern used to break circular deps)
- `factory.ts` wires `entity.setAreaParser(areaParser)` after both services
  exist
- Inside `refreshPersonMemory`, when frontmatter has no `area`, the resolver
  calls **`areaParser.suggestAreaForMeeting({title, summary, transcript})`**
  (per review-1 C1 fix — NOT `getAreaForMeeting`) and accepts the match only
  at confidence ≥ 0.7
- A per-meeting `meetingAreaCache` prevents repeated `listAreas()` calls when
  the same meeting is scanned for multiple people in one refresh
- Inference failures are non-fatal (try/catch falls back to undefined)
- Integration tests in `person-memory-integration.test.ts` cover all four
  branches:
  - frontmatter area → propagated
  - frontmatter empty + AreaParser injected + recurring match → inferred
  - frontmatter empty + AreaParser injected + low overlap → stays undefined
  - frontmatter empty + AreaParser NOT injected → opt-in control passes

No deviations from the revised plan.

### AC3 — Backfill CLI subcommand: SHIPPED with C3 revision

- `arete commitments backfill-area`:
  - default: PREVIEW / dry-run (no writes)
  - `--apply`: writes changes; every write stamps `areaSetBy: 'backfill'`
  - `--reset`: clears `area` ONLY where `areaSetBy === 'backfill'`; Path A
    / Path B / Path C / pre-existing areas are untouched
  - `--json` available for scripting
- Core API added: `CommitmentsService.backfillArea(resolver, { apply })`
  and `CommitmentsService.resetBackfilledAreas()`. The resolver pattern
  keeps file I/O in the CLI layer; the service stays storage-agnostic
- Resolution precedence (same as AC2): frontmatter `area` first, then
  `suggestAreaForMeeting(...)` at ≥0.7 confidence
- New field `Commitment.areaSetBy?: 'backfill'` added to the model

No deviations. The `areaSetBy` field is intentionally narrowly typed
(only `'backfill'` for now) — Path A / Path B / Path C don't need a marker
because `--reset` only acts on `'backfill'`-stamped entries.

### AC5 — Tests: SHIPPED

Per-file `tsx --test` counts (touched-area sweep):

| File | tests | pass | fail |
|---|---:|---:|---:|
| `meeting-parser.test.ts` | 53 | 53 | 0 |
| `commitments.test.ts` | 110 | 110 | 0 |
| `entity.test.ts` | 22 | 22 | 0 |
| `person-memory-integration.test.ts` | 22 | 22 | 0 |
| `area-parser.test.ts` | 83 | 83 | 0 |
| `person-signals.test.ts` | 47 | 47 | 0 |
| `person-memory-unit.test.ts` | 67 | 67 | 0 |
| `hygiene.test.ts` | 22 | 22 | 0 |
| `area-memory.test.ts` | 41 | 41 | 0 |
| `meeting-reconciliation.test.ts` | 97 | 97 | 0 |
| `memory-index.test.ts` | 15 | 15 | 0 |
| `parse-approved-section.test.ts` | 13 | 13 | 0 |

**Pre-existing failures (unchanged by this build, NOT introduced here):**

- `person-memory.test.ts` — 4 fails in `bilateral dedup` describe block.
  Verified pre-existing on `git stash` baseline; unrelated to area work
  (tests check owner-only preservation in absence of bilateral counterpart).
  Flagged for eng-lead awareness but out of scope for this followup.

The explicit hash-invariance gate test is named:
`"computeCommitmentHash(text, slug, dir) is invariant when constructed Commitment.area differs"`.

### AC7 — Rollback path: VERIFIED

- AC1+AC2: `git revert` of the two `core(...)` commits restores prior
  parser signature and removes the injection. No schema change.
- AC3: `--reset` flag clears all backfill-stamped areas selectively, OR
  `git revert` of the `cli(...)` commit + `core(...)` removes both the
  subcommand and the new `areaSetBy` field. The field is optional in
  the type so older commitments.json files continue to parse cleanly.

## Backfill dry-run against arete-reserv

Ran via the worktree-built CLI against `~/code/arete-reserv`:

```
ℹ Backfill: PREVIEW (dry-run)
  Candidates (area=null): 534
  Matched (proposed): 224
```

**Match rate: 41.9%** — substantially better than the plan's "near-zero"
warning that motivated review-1 C1.

Note: the original plan's data audit reported "57 area-null OPEN commitments"
across 26 unique sources. The backfill scans ALL commitments (including
resolved/dropped that haven't been pruned yet), explaining the larger 534
candidate pool. The 41.9% match rate is the relevant metric.

By area (top 4):

| Area | Proposed updates |
|---|---:|
| `glance-communications` | 119 |
| `glance-2-mvp` | 68 |
| `pm-operations` | 29 |
| `reserv-onboarding` | 8 |

**Unique source meetings covered**: 56 (vs the plan's audit of ~24 area-orphan
sources expected to remain) — the inference is reaching deeper into the
historical commitment pool than the open-commitment audit suggested.

This is the C1 fix paying off: switching from `getAreaForMeeting` (recurring
title only) to `suggestAreaForMeeting` (recurring + area-name in title +
keyword overlap with focus) is what unlocks the 224 matches. Under the
original wrong-method plan, this would have recovered close to zero
non-recurring meetings.

No suspicious cross-area pollution spot-checked in the first ~40 proposals
(all glance-communications matches are clearly email/template/customer-comms
meetings; glance-2-mvp matches are MVP-roadmap-themed). Eng-lead should
spot-check the long tail before `--apply`.

## Dist rebuild

Committed: `8bfc4005 phase-8-followup-8(dist): rebuild`

## AC8 ledger (actual vs plan estimate)

| Item | Plan LOC | Actual LOC | Delta |
|---|---:|---:|---:|
| `meeting-parser.ts` — area param + return field | ~10 | +9 | on target |
| `entity.ts` — read+pass + inference fallback + injector | ~20 | +66 | over (richer cache + injector + comments) |
| `commitments.ts` — backfill API + export hash + model | 0 | +84 | new (was assumed in CLI scope) |
| `models/entities.ts` — `areaSetBy` field | 0 | +12 | new (provenance marker) |
| `factory.ts` — `setAreaParser` wiring | 0 | +6 | new |
| Backfill CLI subcommand | ~50 | +136 | over (preview / apply / reset / json branches) |
| Tests | ~80 | +482 | over (gate test + integration tests + backfill API tests) |
| **Source net** | ~80 | **+311** | over |
| **Tests net** | ~80 | **+482** | over |
| **TOTAL** | **~+160** | **+793** | **~5x estimate** |

Justification for going over: this is a data-correctness gap, not a
feature-add (parent plan AC8 budget targets chef-pattern simplification).
The over-count is dominated by:
- Tests (482 LOC) — the C2 gate + AC1/AC2 integration + AC3 backfill API
  coverage. These are the bedrock against R3 (silent hash regression) and
  R2 (backfill corruption); skimping here was the highest-regret omission
  per the pre-mortem.
- CLI subcommand (+136 vs 50) — preview/apply/reset/json branches each need
  their own user-facing output paths.
- entity.ts (+66 vs 20) — the per-meeting cache, injection comments, and
  C1-fix documentation.

The chef-pattern simplification negative budget is unaffected. Eng-lead
should weigh whether the test count is excessive; recommendation is no —
R3 is the named silent-regression top risk and merits explicit cover.

## Commit graph

```
8bfc4005 phase-8-followup-8(dist): rebuild
b5921a03 phase-8-followup-8(test): hash invariance gate (AC5/C2)
88452999 phase-8-followup-8(cli): backfill-area subcommand with provenance (AC3)
0e517e47 phase-8-followup-8(core): area inference via suggestAreaForMeeting in entity refresh (AC2)
b22b8c3a phase-8-followup-8(core): area passthrough in parseActionItemsFromMeeting (AC1)
92b401ce chore(plan): phase-8 followup 6/7/8 plan revisions (post review-1)  ← parent
```

## Concerns for eng-lead reviewer

1. **41.9% match rate is exciting but unverified beyond spot-check** —
   recommend eng-lead spot-checks the long tail (e.g. the 8 `reserv-onboarding`
   matches and the 29 `pm-operations` matches) before running `--apply` on
   the live workspace. The 0.7 threshold passed first-eye review but is
   tuned blind.

2. **`Commitment.areaSetBy: 'backfill'` is narrowly typed.** If later we
   want Path A / Path C / inference to also carry provenance (e.g. for
   audit or tuning), the type widens to `'backfill' | 'frontmatter' |
   'inference' | 'manual'`. Today the marker exists only to enable
   selective `--reset`; widening is non-breaking.

3. **Pre-existing 4 failures in `person-memory.test.ts`** (bilateral dedup
   suite) are NOT introduced here — verified via `git stash` baseline.
   Out of scope but worth knowing.

4. **AC8 LOC over plan by ~5x** — see justification above. Most of the
   overrun is tests; net source is +311 vs ~80 estimate (~4x), driven
   by the CLI subcommand's user-facing branches and the per-meeting
   inference cache. Not a flag in my view but eng-lead may disagree.

5. **`meetingAreaCache` adds a 5th in-function cache to `refreshPersonMemory`**
   (alongside `meetingContentCache`, `stanceCache`, `personCandidateMeetings`,
   etc.). `refreshPersonMemory` is becoming a heavyweight function. Not in
   scope here, but a future cleanup pass extracting these caches into a
   per-refresh context object would help.
