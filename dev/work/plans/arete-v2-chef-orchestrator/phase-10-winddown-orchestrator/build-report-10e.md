# Phase 10e build report — background dedup hygiene verb

**Status**: shipped — exit condition normal
**Authored**: 2026-06-01
**Branch**: worktree-arete-v2-chef-orchestrator
**Commits**: 2 (core engine + CLI verb)

---

## Summary

Shipped `arete dedup --scope <commitments|decisions|learnings|topics>`
CLI verb. Reuses the Phase 10b-min hybrid pipeline retroactively across
an optional `--since` window. Default is `--dry-run` (writes diff report
only); `--apply` is gated behind explicit flag and mutates only the
commitments scope (memory scopes are surface-only per plan AC10a).

**All AC10 acceptance criteria satisfied**:
- AC10 dry-run + apply path
- AC10 idempotency on second `--apply`
- AC10 covers all four scopes (commitments full; decisions/learnings/
  topics surface-only)
- AC10a memory-file diff pattern (decisions-dedup-diff-<date>.md,
  learnings-dedup-diff-<date>.md surfaced; no mechanical merging)

---

## Commits

1. **cd90bde5** `phase-10e(core): background-dedup hygiene engine`
   - `packages/core/src/services/background-dedup.ts` (new, 671 LOC)
   - `packages/core/test/services/background-dedup.test.ts` (new, 537 LOC)
   - 18 unit tests across 5 suites — all pass

2. **7d266604** `phase-10e(cli): arete dedup verb + integration tests`
   - `packages/cli/src/commands/dedup.ts` (new, 343 LOC)
   - `packages/cli/test/integration/dedup.integration.test.ts` (new, 369 LOC)
   - `packages/cli/src/index.ts` (registered verb)
   - `packages/core/src/services/index.ts` (added `parseMemorySections` export)
   - 7 CLI integration tests — all pass

Total: 2 commits, ~1920 LOC across 4 source + test files. Per-step
commits follow the `phase-10e(scope):` convention.

---

## Files changed

### New (src)
- `packages/core/src/services/background-dedup.ts` — pure engine. Exports
  `runBackgroundDedup`, `applyCommitmentsDedup`, `formatBackgroundDedupDiff`,
  per-scope jaccard constants, and full type surface.
- `packages/cli/src/commands/dedup.ts` — CLI verb wiring. Owns scope/since
  validation, diff write, per-scope input loader, and the apply path
  (commitments scope only, under `services.commitments.withLock`).

### New (tests)
- `packages/core/test/services/background-dedup.test.ts` — 18 unit tests
- `packages/cli/test/integration/dedup.integration.test.ts` — 7 integration
  tests

### Modified
- `packages/core/src/services/index.ts` — added `parseMemorySections`
  export. Phase 10e block (engine exports) was added by parallel 10b-min
  wiring commit (already in HEAD).
- `packages/cli/src/index.ts` — register `registerDedupCommand(program)`.

### Untouched (per do-not-touch list)
- `commitment-dedup-pipeline.ts` + `commitment-dedup-extract.ts` (10b-min)
- `commitment-dedup-reverse-stamp.ts` (10b-min Step 5)
- `dedup-decisions-log.ts` (10b-min Step 6)
- `cli/commands/meeting.ts` (10b-min wiring in flight in parallel)
- `cli/commands/commitments.ts` (Phase 10a — pattern reused, no edits)
- `integrations/gws/*` (Phase 11-pre)
- `staged-items.ts:718-738` (followup-2)

---

## Architecture decisions

### 1. Pure engine + CLI shell split

`background-dedup.ts` is a pure module: no I/O, no service handles, no
disk reads. The CLI verb (`dedup.ts`) owns all side effects — read
commitments.json, read memory files, write diff, acquire lock, atomic
write. Same pattern as `commitment-dedup-pipeline.ts` (10b-min Step 1)
which the engine reuses. Makes the engine trivially testable with
synthetic inputs and zero mocking of storage / lock / LLM.

### 2. Reuse of reactive pipeline primitives

The commitments-scope path consumes `findDedupCandidates` +
`runLLMCrossCheck` + `applyDedupDecisions` from the 10b-min pipeline
verbatim. Same Jaccard threshold (0.6), same person-slug overlap gate,
same LLM tier default (fast). The only difference is that the
background pass walks pairs across an arbitrary time window (default:
all-time, optionally bounded by `--since`), whereas reactive limits to
same-day. This means the verb is the user-facing surface for the Q4
cross-day extension that the plan deferred from reactive (the soak can
opt into wider windows manually before reactive widens).

### 3. Memory scopes are surface-only

Decisions / learnings / topics dedup is implemented as Jaccard +
title-equal grouping (decisions/learnings) or alias-overlap +
body-Jaccard (topics). The engine never auto-merges these scopes —
even with `--apply` the verb writes the diff and explicitly informs
the user that editorial intent is preserved. This matches plan v2
non-goal #4 ("memory dedup is editorial, not mechanical") and AC10a's
diff-pattern requirement.

The CLI returns `applied: false` for non-commitments scopes under
`--apply`, with an explanatory info line. Diff is still written so
the soak / hygiene runs surface candidate merges for human review.

### 4. Mutual exclusion under withLock

Commitments-scope `--apply` re-reads commitments.json INSIDE
`services.commitments.withLock(async () => { ... })`, re-runs the
engine against the locked content, and writes atomically. Same pattern
as `commitments migrate --apply` (Phase 10a fixup HIGH-2). A
concurrent `arete meeting extract` waits on the same proper-lockfile.
No race possible.

### 5. LLM is opt-in via `--llm`

By default the verb runs Jaccard-only — surfaces fuzzy pairs as
candidates without LLM verdicts. Users opt into LLM cross-check via
`--llm` (wires `AIService.callConcurrent`) for tighter dedup at cost
of a few cents per scope-pass. Per plan §"Hard part 4: Cost" this
keeps hygiene runs cheap (Jaccard-only) while allowing precision
boost when the user wants it.

---

## Test coverage

### Unit tests (`packages/core/test/services/background-dedup.test.ts`)

18 tests across 5 suites:

**commitments scope (7 tests)**:
- Exact text-hash duplicates grouped without LLM
- LLM SAME promotes fuzzy candidate to group
- LLM UNCERTAIN surfaces as review candidate (not group)
- LLM DIFFERENT keeps as distinct canonicals
- `--since` filter drops earlier rows
- Drops resolved/dropped rows from scope
- Without LLM, fuzzy pairs surface as candidates (never silent merge)

**applyCommitmentsDedup (3 tests)**:
- Removes duplicates + merges source_meetings + textVariants
- Idempotent on second apply (no new groups, byte-equal output)
- textVariants cap at 5 with oldest-first eviction

**decisions/learnings scope (4 tests)**:
- Groups sections with same normalized title
- Surfaces body-similar sections (no auto-merge)
- Topic-gate filters pairs with no topic overlap
- `--since` filter drops earlier sections

**topics scope (3 tests)**:
- Alias-overlap surfaces as candidate (with "alias overlap" reasoning)
- Body-similar pages surface without alias overlap
- `--since` filters by `last_refreshed`

**formatBackgroundDedupDiff (1 test)**:
- Stable dry-run markdown header

All 18 tests pass; no LLM calls (deterministic mock LLM); no production
writes (synthetic fixtures only).

### CLI integration tests (`packages/cli/test/integration/dedup.integration.test.ts`)

7 tests across 2 suites against tmp workspaces:

**commitments scope (5 tests)**:
- `--dry-run` writes diff + does NOT modify commitments.json
- `--apply` absorbs duplicates + is idempotent on second invocation
- `--since` filter narrows scope (verified via summary count)
- Invalid `--scope` rejected with clear error
- Invalid `--since` shape (non-YYYY-MM-DD) rejected

**decisions scope (2 tests)**:
- `--dry-run` surfaces same-title group as candidates
- `--apply` is surface-only — decisions.md byte-equal after invocation

All 7 tests pass; no LLM calls; no production writes (tmp directories
cleaned up in `afterEach`).

---

## Verification commands

```bash
# Unit tests (engine)
ARETE_SEARCH_FALLBACK=1 npx tsx --test \
  packages/core/test/services/background-dedup.test.ts

# CLI integration tests
ARETE_SEARCH_FALLBACK=1 npx tsx --test \
  packages/cli/test/integration/dedup.integration.test.ts

# Combined (25 tests total)
ARETE_SEARCH_FALLBACK=1 npx tsx --test \
  packages/core/test/services/background-dedup.test.ts \
  packages/cli/test/integration/dedup.integration.test.ts

# Typecheck (full monorepo)
npm run typecheck

# Build dist (for commit)
npm run build:packages

# Manual smoke (against a workspace)
arete dedup --scope commitments --dry-run \
  --diff-dir /tmp/dedup-diffs

# Manual apply
arete dedup --scope commitments --apply \
  --diff-dir /tmp/dedup-diffs

# Optional LLM mode
arete dedup --scope commitments --dry-run --llm --tier fast
```

Expected output (commitments dry-run on a fresh workspace):
```
Dry-run complete for scope=commitments: N items in scope, 0 group(s), 0 pair(s) for review.
  Diff report: <root>/dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator/dedup-diff-commitments-2026-06-01.md
  Summary: totalIn=N groups=0 duplicates=0 uncertain=0

ℹ To apply (commitments scope only in v2): rerun with --apply. Memory scopes are surface-only; edit the source files using the diff as guidance.
```

---

## Acceptance criteria mapping

| AC | Status | Notes |
|----|--------|-------|
| AC10 (background dedup verb) | ✅ | All four scopes covered. `--dry-run` + `--apply`. Idempotent. |
| AC10a (memory-file diff pattern) | ✅ | decisions / learnings / topics scopes write `-diff-<date>.md` artifacts. Surface-only; no auto-merge. |

Plan §"10e — Background dedup hygiene verb" all bullets done:
- ✅ `arete dedup --scope <X>` CLI verb
- ✅ Same hybrid pipeline as reactive (reuses 10b-min primitives)
- ✅ Default `--dry-run`; explicit `--apply` required for writes
- ✅ `--since <date>` to limit scope
- ✅ Each scope produces expected dedup groupings on fixture
- ✅ Idempotent: second `--apply` is no-op
- ✅ `--dry-run` does NOT write

---

## Known gaps / future work

1. **`--llm` not exercised in tests**: integration tests run Jaccard-
   only mode (no `--llm` flag). The engine correctly accepts an LLM
   injection point and unit tests cover the SAME/DIFFERENT/UNCERTAIN
   branches with a deterministic mock. Wiring the real `--llm` path
   through CLI integration tests would require either a mock provider
   or a tier-conditional test fixture — deferred as a soak-time
   refinement (the unit tests already cover the engine paths the CLI
   exercises).

2. **Memory-scope auto-merge**: explicit non-goal per plan v2 §AC10a.
   The diff is the audit artifact; the user is expected to edit the
   source files manually. Future work (Phase 11+) could add an
   `[[merge-memory]]` chef directive parallel to `[[unmerge]]` for
   guided merges.

3. **Topic body diff**: topic page body Jaccard concatenates ALL
   sections (including frontmatter-bearing ones). A future refinement
   could weight semantic sections (e.g., "Current state") higher than
   boilerplate ("Source trail"). Out of scope for v2.

4. **No cron**: manual-only per plan v2 §"Non-goals". Soak data may
   surface that weekly winddown is the right cadence; cron can be
   added later via a simple wrapper script + macOS launchd / cron.

---

## Out-of-band findings (none)

No bugs surfaced in the reactive pipeline during 10e build. The
existing `findDedupCandidates` / `runLLMCrossCheck` / `applyDedupDecisions`
primitives plug into the background path cleanly with zero
modifications — strong validation of the 10b-min API design.

The 18-test unit suite + 7-test integration suite together cover the
engine's surface area without any production data writes or LLM calls.
Soak rotation can lean on `arete dedup --dry-run` as a daily / weekly
hygiene signal before flipping to `--apply` once the diff shape is
trusted.
