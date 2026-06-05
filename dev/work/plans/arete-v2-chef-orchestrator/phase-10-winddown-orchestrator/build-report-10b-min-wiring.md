# Phase 10b-min Wiring — Build Report

**Branch**: `worktree-arete-v2-chef-orchestrator`
**Date**: 2026-06-05
**Scope**: Wire the Phase 10b-min hybrid dedup pipeline into the
`arete meeting extract` CLI flow. Same pattern as the followup-2 wiring
fix — the pure pipeline modules exist (5 commits, 94 tests pass) but
were NOT invoked in production code.

## Commits

| Commit | Step | Description |
|---|---|---|
| `675a1e25` | 1 | `extract-dedup-wiring` helper (core) — CLI-facing glue |
| `b7c82fa8` | 2 | Wire `wireExtractDedup` into `arete meeting extract` |

Each commit rebuilds dist and ships under the `phase-10b-min-wiring`
convention. Co-authored footer present on both.

## Files Changed

### New source files
- `packages/core/src/services/extract-dedup-wiring.ts` (~440 LOC) — the
  CLI-facing wiring helper. Owns:
    - `wireExtractDedup(services, inputs, callConcurrent, options)`
      — top-level orchestrator
    - `loadSameDayStagedItems` — cross-meeting candidate loader
    - `resolveMeetingSlugToPath` — for the reverse-stamp step
    - `adaptFilteredItemsForDedup` — `processed.filteredItems` adapter

### New test files
- `packages/core/test/services/extract-dedup-wiring.test.ts` —
  13 integration tests (all passing). Uses real temp dirs + real
  `proper-lockfile` (commitments lock), mocked LLM.

### Modified
- `packages/core/src/services/index.ts` — exports for new wiring module.
- `packages/cli/src/commands/meeting.ts` — wires `wireExtractDedup`
  into the `--stage` path; threads `statusPatch` into
  `processed.stagedItemStatus`; merges `skipReasonPatch` into the
  `writeWithLock` mutator's `staged_item_skip_reason` map; decorates
  staged sections with badges; surfaces `crossMeetingDedup` counts in
  both JSON and human-readable output.

### Untouched (per brief)
- `packages/core/src/services/commitment-dedup-pipeline.ts`
- `packages/core/src/services/commitment-dedup-extract.ts`
- `packages/core/src/services/commitment-dedup-reverse-stamp.ts`
- `packages/core/src/services/dedup-decisions-log.ts`
- `packages/core/src/integrations/staged-items.ts` lines ~718-738
- `packages/core/src/integrations/gws/`

## CLI Integration Points

The extract action's `--stage` path now invokes the pipeline at one
specific point: AFTER `processMeetingExtraction` + reconciliation +
`batchLLMReview` have done their intra-meeting and last-7d passes,
BEFORE `formatFilteredStagedSections` renders the body and the
`writeWithLock` mutator writes the file.

```
extractMeetingIntelligence
  ↓
processMeetingExtraction (intra-meeting dedup, confidence filter)
  ↓
reconciliation + batchLLMReview (cross-meeting last-7d, when --reconcile)
  ↓
wireExtractDedup ← Phase 10b-min wiring lands HERE
  ↓
formatFilteredStagedSections + decorateStagedSectionsWithDupeBadges
  ↓
writeWithLock (frontmatter patch + body update)
```

Specifically:

1. **Service handle**: uses existing `services.commitments` +
   `services.storage` from `createServices(process.cwd())`.

2. **Same-day staged loading**: `loadSameDayStagedItems` scans
   `resources/meetings/<date>-*.md` (excluding the current meeting's
   slug), parses staged action items + status / owner maps, and adapts
   each into `ExistingCommitmentForDedup`. Items whose status is
   already `'skipped'` are dropped (prevents resurrecting skipped
   canonicals).

3. **Slug → path resolution**: `resolveMeetingSlugToPath` produces the
   absolute path under `meetingsDir/<slug>.md` for the reverse-stamp
   step.

4. **Orchestrator invocation**: `wireExtractDedup` runs under
   `services.commitments.withLock(...)`. Inside the lock it reads
   commitments.json + the same-day staged pool, then invokes
   `runExtractDedup` for the per-item decisions.

5. **Frontmatter application**:
   - `dedupResult.statusPatch` overwrites
     `processed.stagedItemStatus[id] = 'skipped'` for definite dupes
     BEFORE the existing `mergedStatus` computation runs — so the
     chef-set merge logic in the `writeWithLock` mutator treats our
     new `'skipped'` entries as first-class.
   - `dedupResult.skipReasonPatch` is merged into
     `staged_item_skip_reason` inside the mutator (explicit merge of
     `currentSkipReason` + patch). Chef-set entries on OTHER IDs are
     preserved by the partial-merge contract (followup-2 F2).

6. **No double-write of audit log**: `appendDedupDecisionLogBatch`
   fires once inside `wireExtractDedup`. The CLI does NOT call it
   separately.

7. **Reverse-stamp**: `wireExtractDedup` invokes `applyReverseStamp`
   per definite-dupe canonical (de-duped by canonical slug within the
   extract). Best-effort with the 60s mtime guard inside the helper.

## dryRun Semantics

The CLI's existing `--dry-run` flag now propagates into the wiring
helper as `dryRun: true`. The pipeline still RUNS (so the user sees
the decisions in the dry-run output) but skips the side effects:

- No reverse-stamp writes to canonical meetings
- No append to `dev/diary/dedup-decisions.log`
- No frontmatter writes (already handled by the CLI's own dry-run
  branch — `writeWithLock` isn't called when `dryRun` is true)

## Test Status

```
test/services/extract-dedup-wiring.test.ts:           13 pass, 0 fail   (new)
test/services/commitment-dedup-pipeline.test.ts:      46 pass, 0 fail   (unchanged)
test/services/commitment-dedup-extract.test.ts:       17 pass, 0 fail   (unchanged)
test/services/commitment-dedup-reverse-stamp.test.ts: 12 pass, 0 fail   (unchanged)
test/services/dedup-decisions-log.test.ts:            14 pass, 0 fail   (unchanged)
test/integrations/staged-items-dupe-of.test.ts:        5 pass, 0 fail   (unchanged)
                                              total: 107 pass, 0 fail
```

Adjacent regression checks (all still passing):
- `commitments-withlock.test.ts`: 8 pass
- `integrations/staged-items.test.ts`: 63 pass
- CLI `meeting-extract.test.ts`: 50 pass
- CLI `meeting-approve.test.ts` + `meeting-process.test.ts`: 13 pass

## New Test Coverage

The `extract-dedup-wiring.test.ts` suite covers the four scenarios
from the task brief:

1. **Same-day cross-meeting text-hash exact match** → orchestrator
   marks new item as `definite-dupe`; `statusPatch[id] = 'skipped'`;
   `skipReasonPatch[id].reason = "dupe_of_<canonical-id>"`.

2. **Existing commitment + new staged item, semantic-similar text**:
   - LLM SAME → marked dupe (`definite-dupe` outcome)
   - LLM DIFFERENT → both retained (`new-canonical`, empty patches)
   - LLM UNCERTAIN → both retained AND flagged (`possibly-mergeable`;
     empty patches — possibly-mergeable does NOT skip per AC4a)

3. **Concurrent extracts**: two `CommitmentsService` instances (real
   proper-lockfile, cross-instance contention) → both complete, no
   throw, commitments.json valid JSON after.

4. **Reverse-stamp**: meeting B finds canonical in meeting A →
   marker appended to A's body. Refreshing A's mtime to NOW + re-run
   → guard fires (`written: false` or `'already-stamped'`), never a
   throw.

Plus 9 focused tests for `loadSameDayStagedItems`,
`resolveMeetingSlugToPath`, and `adaptFilteredItemsForDedup`.

## Critical Invariants — Verified

- NO LLM calls against arete-reserv during build / tests. The wiring
  helper accepts `callConcurrent` as a parameter; tests inject a
  mock with a fixed response table.
- NO production data writes during tests — all use temp dirs.
- Per-step commits with the `phase-10b-min-wiring(scope): description`
  convention.
- Co-authored footer on both commits.
- Dist rebuilt after each commit (`packages/core/dist/services/...`
  and `packages/cli/dist/commands/meeting.js`).
- Did NOT touch pipeline modules (10b-min Step 1-6 source files).
- Did NOT touch the `staged-items.ts` followup-2 v3 F5 cleanup block.
- Did NOT touch `integrations/gws/` (Phase 11-pre territory).

## AC Re-verification — Promotion from "core only" to "fully wired"

| AC | Pre-wiring Status | Post-wiring Status |
|---|---|---|
| AC2 (text-hash exact match) | PASS (core only) | **YES** — fires in extract |
| AC3 (semantic hybrid pre-filter) | PASS (core only) | **YES** — fires in extract |
| AC3a (golden-set P/R, fast tier) | PASS | YES — same gates apply at extract |
| AC4 (distinct recipients) | PASS (core only) | **YES** — pipeline routed |
| AC4a (UNCERTAIN → possibly-mergeable) | PASS (core only) | **YES** — badge surfaces |
| AC6a (reverse-stamp marker) | PASS (core only) | **YES** — `applyReverseStamp` invoked |
| AC9 (dedup-decisions.log format) | PASS | YES — `appendDedupDecisionLogBatch` fires |
| AC11a (tier-promotion gate) | n/a until soak | unchanged |

The previously "core only" ACs (AC2, AC3, AC4) are now exercised
end-to-end in the CLI extract path. AC6a + AC9 — same. AC3a + AC11a
gates remain controlled by the golden-set test in
`commitment-dedup-pipeline.test.ts`.

## Verification Commands

```bash
# All Phase 10b-min + wiring tests
cd packages/core && \
  npx tsx --test test/services/commitment-dedup-pipeline.test.ts \
                 test/services/commitment-dedup-extract.test.ts \
                 test/services/commitment-dedup-reverse-stamp.test.ts \
                 test/services/dedup-decisions-log.test.ts \
                 test/services/extract-dedup-wiring.test.ts \
                 test/integrations/staged-items-dupe-of.test.ts

# Adjacent regression
cd packages/core && \
  npx tsx --test test/services/commitments-withlock.test.ts \
                 test/integrations/staged-items.test.ts

# CLI regression
cd packages/cli && \
  npx tsx --test test/commands/meeting-extract.test.ts \
                 test/commands/meeting-approve.test.ts \
                 test/commands/meeting-process.test.ts

# Typecheck
cd packages/core && npx tsc --noEmit
cd packages/cli && npx tsc --noEmit

# Rebuild dist
cd packages/core && npm run build
cd packages/cli && npm run build
```

## Soak Observations to Watch For

1. **First end-to-end extract**: run `arete meeting extract --stage`
   against a workspace with at least two same-day meetings. Confirm
   the JSON response includes `crossMeetingDedup.evaluated > 0` and
   the human-readable output prints "Cross-meeting dedup: N dupe(s),
   M possibly-mergeable" when applicable.

2. **Reverse-stamp abstains**: tail
   `dev/diary/dedup-decisions.log` after a busy day. Frequent
   `abstainReason: 'recent-user-edit'` entries indicate the 60s
   guard is too aggressive for the user's editor cadence (followup
   work would lower the guard or add a "force-stamp" flag).

3. **Pipeline error fallthrough**: a `wireExtractDedup` failure (e.g.
   commitments lock contention timeout) surfaces as
   `warn('Cross-meeting dedup skipped due to error: ...')`. Extract
   proceeds with new canonicals. Watch for repeated warnings — they
   indicate a real bug rather than a transient.

4. **dryRun preview accuracy**: in `--dry-run` mode the pipeline
   runs but skips writes; the dry-run output should show the
   correct badge decoration. If it doesn't, the wire-in's dryRun
   plumbing has a bug.

## What's Done

This build completes the Phase 10b-min scope as originally written.
The "what's NOT wired yet" gap from the build-report-10b-min.md is
closed. The pipeline now fires automatically on every
`arete meeting extract --stage` invocation. No user opt-in flag is
needed — the pipeline degrades gracefully when there are no
candidates (no LLM call) or when the LLM is unreachable (UNCERTAIN
fallback → new canonical).

The CLI feature is now ready for soak observation per AC3a / AC11a.
