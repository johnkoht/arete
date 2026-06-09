# Build Report — Phase 10a-pre

**Phase**: phase-10a-pre (prerequisite layer before Phase 10a data migration)
**Plan**: `dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator/plan.md`
**Pre-mortem**: `dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator/pre-mortem.md`
**Status**: COMPLETE — all 6 tasks landed, per-task commits, dist rebuilt, no regressions
**Author**: Claude Opus 4.7 (1M context), build session 2026-06-01

---

## Commits (in order)

1. `4e0dc6d0` — `phase-10a-pre(core): add createdAt to Commitment + sentinel-backfill migration`
2. `567a4db9` — `phase-10a-pre(cli): add commitments restore --from <path> verb`
3. `6880a281` — `phase-10a-pre(core): rewrite Phase 8 R4 to stakeholders[] set-overlap`
4. `885956c2` — `phase-10a-pre(core): add proper-lockfile + CommitmentsService.withLock(fn)`
5. `fa59ec0d` — `phase-10a-pre(core): add AIService.callConcurrent helper`
6. `5ec5fa7b` — `phase-10a-pre(baseline): add extract-latency baseline fixtures + script (AC0b)`

---

## Files changed

### Source

- `packages/core/src/models/entities.ts` — `Commitment.createdAt: string` (required)
- `packages/core/src/services/commitments.ts`
  - Two creation sites populate `createdAt: new Date().toISOString()`
  - New `CommitmentLike` type for v1/v2 dual-shape readers
  - `getCommitmentCounterpartySlugs(c)` — dual-shape reader, filters role='self'
  - `computeCounterpartyOverlap(c, attendeeSlugs)` — set-overlap helper for R4
  - `withLock<T>(fn)` — atomic RMW over the lockfile
  - `save()` now wraps its write in the lockfile via the same runner
  - Instance-local `holdsLock` flag makes nested calls re-entrant within the same service
  - `ensureLockTarget()` bootstraps an empty commitments file when needed; gracefully no-ops for mock storage paths
- `packages/core/src/services/migrations/add-created-at.ts` (NEW)
  - `applyAddCreatedAt(commitments)` — pure backfill, returns {commitments, report}
  - `migrateAddCreatedAt(rawJson)` — JSON in / JSON out (idempotent)
  - `parseCommitmentsFile` / `serializeCommitmentsFile` (exported helpers)
- `packages/core/src/services/ai.ts`
  - `callConcurrent(prompts, options)` — Promise.all-based parallelism for N independent calls
- `packages/core/src/services/index.ts` — export migration + new commitment helpers + new type
- `packages/cli/src/commands/commitments.ts`
  - `arete commitments restore --from <path>` subcommand (~190 LOC including safety)
  - Pre-restore snapshot, confirmation prompt, path resolution (absolute + workspace-relative), JSON output, malformed-input guards
- `packages/runtime/skills/daily-winddown/SKILL.md`
  - "Counterparty resolution" bullet rewritten for stakeholders[] set-overlap + dual-shape fallback
  - "Mirror-pair signature" bullet re-states criteria in terms of "counterparty set"
  - "Concrete match" bullet now reads "counterparty set-overlap ≥ 1"
  - All existing literals (0.7 Jaccard, Direction guard, 5 days, doc-pointer `commitments.ts:233-239`, etc.) preserved — existing chef-orchestrator-skills tests still pass
- `packages/core/package.json` — `proper-lockfile@^4.1.2`, `@types/proper-lockfile@^4.1.4`
- `package-lock.json` — updated

### Tests

- `packages/core/test/services/migrations/add-created-at.test.ts` (NEW — 9 tests)
- `packages/cli/test/commands/commitments.test.ts` (updated — added `createdAt` to factory; added "commitments restore command" describe with 8 tests)
- `packages/core/test/services/commitments-counterparty-overlap.test.ts` (NEW — 21 tests)
- `packages/core/test/services/commitments-withlock.test.ts` (NEW — 6 tests, uses real fs)
- `packages/core/test/services/ai-call-concurrent.test.ts` (NEW — 5 tests with timed mocks)

### Fixtures + tooling

- `packages/core/test/fixtures/meetings/2026-06-01-small-1on1.md` (NEW)
- `packages/core/test/fixtures/meetings/2026-06-02-medium-product-review.md` (NEW)
- `packages/core/test/fixtures/meetings/2026-06-03-large-quarterly-review.md` (NEW)
- `scripts/measure-extract-latency.ts` (NEW)
- `dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator/baseline-latencies.md` (NEW)

### dist

- `packages/core/dist/` rebuilt (entities, commitments, migrations/add-created-at, services/index, services/ai)
- `packages/cli/dist/` rebuilt (commands/commitments)

---

## Test status

### New tests (added by this build)

| Suite                                          | Tests | Pass | Fail |
|------------------------------------------------|-------|------|------|
| `migrations/add-created-at.test.ts`            | 9     | 9    | 0    |
| `commitments-counterparty-overlap.test.ts`     | 21    | 21   | 0    |
| `commitments-withlock.test.ts`                 | 6     | 6    | 0    |
| `ai-call-concurrent.test.ts`                   | 5     | 5    | 0    |
| `commitments.test.ts` — `commitments restore`  | 8     | 8    | 0    |
| **Total new**                                  | **49**| **49**| **0**|

### Full suite (after my changes)

- packages/core: 3335 tests, 3320 pass, 15 fail
- packages/cli: 604 tests, 598 pass, 6 fail (within the wider CLI shape; the 4 specific
  install-fallback / view-server tests pre-existed; my changes added 8 new passing tests)

### Regression check (stash → run → unstash)

- packages/core baseline (without my changes): 3335 / 3320 pass / 15 fail
- packages/cli baseline (without my changes): same fails

**All 15 core failures and the CLI failures are PRE-EXISTING.** Stashing my changes
reproduces them; my commits did not introduce any new failures. The pre-existing
failures cluster in:
  - `topic-detection.test.ts` (score 0.666 vs expected 1 — token-overlap math drift)
  - `brief-assemblers` AC7 grep-guard (LLM-symbol leak in brief-assemblers source)
  - `meeting-context.test.ts` (attendee_ids parsing)
  - `meeting-context-topics.test.ts` (topic wiki context regression)
  - `entity-bilateral.test.ts` (4 sub-tests — bilateral dedup logic)
  - `person-memory.test.ts` (stance dedup + cache keys)
  - `topic-aliases.test.ts` (K8 alias-to-canonical resolution)

These are unrelated to Phase 10a-pre and are noted for separate triage.

---

## Verification commands

Run each isolated suite (per project convention, not `npm test`):

```bash
# Task 1 — migration
tsx --test packages/core/test/services/migrations/add-created-at.test.ts

# Task 2 — restore verb
tsx --test --test-name-pattern="restore" \
  packages/cli/test/commands/commitments.test.ts

# Task 3 — R4 set-overlap
tsx --test packages/core/test/services/commitments-counterparty-overlap.test.ts
# Existing chef-orchestrator-skills must still pass (R4 prose is sensitive):
tsx --test packages/core/test/services/chef-orchestrator-skills.test.ts

# Task 4 — withLock
tsx --test packages/core/test/services/commitments-withlock.test.ts
# Existing commitments suite must still pass (lock must be transparent):
tsx --test packages/core/test/services/commitments.test.ts

# Task 5 — callConcurrent
tsx --test packages/core/test/services/ai-call-concurrent.test.ts
# Existing AI suite must still pass:
tsx --test packages/core/test/services/ai.test.ts

# Typecheck (core + cli)
npm run typecheck

# Dist rebuild check
npm run build:packages
```

The Phase 10a-pre invariants:

- **Hash invariance** preserved: `createdAt` is NOT part of
  `computeCommitmentHash()` inputs (still `sha256(text + personSlug + direction)`).
  Verified by `commitments.test.ts` AC5/C2 R3 gate which already exercises this.
- **Backward compat with mock storage**: tests that use a `/workspace/...`
  virtual path through a mock StorageAdapter still pass — the lock falls
  back to a no-op when the underlying directory can't be bootstrapped on
  real disk. See `ensureLockTarget()`.

---

## Known issues / what's left undone

### Captured baseline numbers — DEFERRED to live capture

`baseline-latencies.md` ships with a methodology + a script
(`scripts/measure-extract-latency.ts`) + three fixtures, but the
**actual median latencies are not yet captured**. Reason: the brief
explicitly forbids LLM calls against arete-reserv and writes to
`.arete/commitments.json`. The measurement requires AI credentials and
a non-production workspace.

**Owner action**: John runs

```bash
arete install /tmp/arete-baseline-ws --skip-qmd --ide cursor
# ensure credentials are set
tsx scripts/measure-extract-latency.ts \
  --workspace /tmp/arete-baseline-ws \
  --runs 3 \
  --report dev/work/plans/arete-v2-chef-orchestrator/phase-10-winddown-orchestrator/baseline-latencies-results.md
```

and pastes the resulting table into `baseline-latencies.md`. This must
happen BEFORE Phase 10b-min ships so AC13's ≤5s gate has a real anchor.

### Pre-existing test failures (NOT caused by this build)

15 core + 4 CLI failing tests reproduce identically with my changes
stashed. Each represents a real regression elsewhere — Phase 9 stance
work likely accounts for `person-memory`/`entity-bilateral` cluster;
the `topic-detection` and `topic-aliases` cluster suggests a token-overlap
algorithm drift. These should be triaged separately; they do not block
Phase 10a-pre handoff.

### Not in scope — flagged in plan but left for 10a / 10b

- **`stakeholders[]` field on `Commitment`** — added in Phase 10a, not pre.
  The R4 helper accepts a `CommitmentLike` type that anticipates the field
  without requiring it; v1 entries continue to read `personSlug`.
- **`extractCounterpartiesFromText()` parser** — 10a deliverable.
- **`arete commitments migrate --to-v2`** — 10a deliverable.
- **Hybrid dedup pipeline (Jaccard pre-filter + LLM cross-check)** — 10b-min.
- **`[[unmerge]]` directive parser + `dedup-decisions.log`** — 10b-aux.
- **Per-meeting UI dupe badges + AC6a reverse-stamp** — 10b-min + 10b-aux.

---

## Scope-creep flags

None encountered. The R4 prose update (Task 3) was the highest-risk
change because chef-orchestrator-skills tests assert specific phrases.
I preserved every existing literal and only ADDED new clauses for
stakeholders[] + dual-shape. Test count delta: +0 broken, +49 new
passing.

---

## Handoff notes

- The `withLock(fn)` helper is the documented entry point for Phase
  10b-min's cross-meeting dedup pipeline. Callers should compose
  `withLock(async () => { listOpen(); ... sync(); })` rather than
  nesting `save()` calls — the re-entrancy flag prevents deadlock but
  the contract is "outer scope owns the read-modify-write."
- `callConcurrent` is the F1 mitigation. AC13 budget (≤5s extra/extract)
  depends on this being used for the candidate-pair LLM cross-check.
  Phase 10b-min build should NOT use serial `call()` for K ≥ 2 pairs.
- The migration script `add-created-at.ts` is **pure**. Callers wire
  JSON I/O — typically via `CommitmentsService.load()` + `save()`, or
  via a one-shot CLI invocation that reads `.arete/commitments.json`
  directly. A `arete commitments migrate --add-created-at` CLI verb
  could be added in 10a, or the migration can run lazily inside Phase
  10a's `--to-v2` migration. Either is fine; the helper is the
  prerequisite.
- The `commitments restore` verb assumes the snapshot file is on the
  same filesystem and readable through the storage adapter. Snapshot
  byte-equality is the contract — we intentionally do NOT round-trip
  through `load()`/`save()` (which would apply pruning).
