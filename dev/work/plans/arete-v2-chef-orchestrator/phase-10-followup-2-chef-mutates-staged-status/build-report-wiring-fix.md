# Phase 10 followup-2 — Wiring Fix Build Report

**Author**: TypeScript engineer (wiring-gap follow-up)
**Date**: 2026-06-01
**Scope**: 3 HIGH-severity wiring gaps from `code-review.md`
**Branch**: `worktree-arete-v2-chef-orchestrator`

---

## TL;DR

All three HIGH concerns from the followup-2 code review are fixed and committed. The CT2 race the followup-2 build was meant to close is now actually closed in production code: the `arete meeting extract` write path goes through `writeWithLock` with a partial-merge mutator that preserves chef-written `staged_item_skip_reason` by default. AC5 ("re-extract preservation in production") is now structurally honored, not just at the F2 unit-test boundary.

3 commits, 3 files touched, 0 regressions across the chef-skip slice (165 tests pass in the targeted run).

## Commits

| SHA | Subject | Files |
|-----|---------|-------|
| `380f44f3` | `phase-10-followup-2-fix(cli): wire meeting extract through writeWithLock` | `packages/cli/src/commands/meeting.ts` (+ dist) |
| `825bd27a` | `phase-10-followup-2-fix(core): add concurrent CLI race test for writeWithLock` | `packages/core/test/services/meeting-lock.test.ts` |
| `4516ed0e` | `phase-10-followup-2-fix(core): rename Flow D + add Flow E for true CT2 race reproduction` | `packages/core/test/integrations/chef-skip-e2e.test.ts` |

All commits carry the convention `phase-10-followup-2-fix(scope):` and the `Co-Authored-By: Claude Opus 4.7 (1M context)` footer.

## HIGH fixes (detail)

### HIGH-1 — Wire `writeWithLock` into production extract path

**Before**: `packages/cli/src/commands/meeting.ts:1071-1119` cloned the in-memory frontmatter, mutated keys, then called `services.storage.write(meetingPath, updatedFile)` — a wholesale file rewrite. Any chef-written `staged_item_skip_reason` (or any other key the extract path didn't touch) was silently dropped on every `arete meeting extract` re-run.

**After**: refactored to use `writeWithLock(services.storage, meetingPath, mutator, { mtimeGuardSeconds: 0 })`. The mutator:

1. Builds an empty patch object and lets `writeMeetingApplyFrontmatter` populate ONLY the 8 keys it owns (`status`, `processed_at`, `topics`, `open_action_items`, `my_commitments`, `their_commitments`, `decisions_count`, `learnings_count`) — never reads from current frontmatter.
2. Adds the 5 staged-item keys (`staged_item_source`, `staged_item_confidence`, `staged_item_status`, optionally `staged_item_owner` / `staged_item_matched_text`) to the patch.
3. **Status-map merge** (plan v3 §"Re-extract preservation"): walks `current.frontmatter.staged_item_status` × `current.frontmatter.staged_item_skip_reason`; for any ID where `skip_reason[id].setBy ∈ {'chef','chef-proposed'}` and the prior status was `'skipped'`, keeps `'skipped'` in the merged status (unless extract just produced `'approved'`, which is impossible from the extract path but defensive). Otherwise the fresh extract status wins.
4. **`staged_item_skip_reason` is intentionally NOT in the patch** — the F2 partial-merge contract preserves it byte-for-byte.
5. Body update via `updateMeetingContent(current.body, stagedSections)`, returned as part of the mutator result.

`mtimeGuardSeconds: 0` because extract is the user-initiated entry point; the partial-merge contract (not the mtime guard) provides race safety with chef writes. Setting the guard would cause spurious aborts during the normal user-edits-then-runs-extract flow.

Vanished-file or abstain results surface as a non-fatal warning so artifacts aren't silently lost.

**Verification**: see Flow E in HIGH-3 below — exercises the production-shape mutator end-to-end through `writeWithLock` and verifies (a) chef's `skip_reason` survives the extract, (b) chef's `'skipped'` status survives the status-map merge, (c) `apply` correctly drops the chef-skipped item.

### HIGH-2 — Concurrent CLI race test

Added one new test in `packages/core/test/services/meeting-lock.test.ts`:

```
serializes two concurrent writeWithLock calls on the same meeting; both writes survive
```

Pattern: `Promise.all([writeWithLock(p, mutA), writeWithLock(p, mutB)])`. mutatorA sets `staged_item_status[ai_0042] = 'approved'`; mutatorB sets `staged_item_skip_reason[ai_0042] = {...}`. Asserts:

- Both writes return `{ written: true }` (lock serializes; neither one fails or stales out).
- File parses as clean YAML (no corruption).
- mutatorA's status mutation is in the final file.
- mutatorB's skip_reason mutation is in the final file.
- Pre-existing entries (from the seed) are still there.
- The `.lock` target directory is cleaned up after both writes complete.

Closes the AC4 "concurrent CLI race" gap.

### HIGH-3 — Flow D rewrite for true CT2 reproduction

The previous Flow D self-acknowledged it did not exercise the race. Two changes:

1. **Renamed Flow D** to "happy-path post-chef-skip apply (no user override; structural baseline)" — kept as a baseline assertion that chef's `'skipped'` filters through to apply when there's no contention.

2. **Added Flow E** ("CT2 reproduction: chef writes skip, concurrent extract mutator races, chef skip_reason survives + apply drops ai_X"): exercises the EXACT race that motivated the followup. Steps:

   - Seed meeting with two items including the CT2-canonical "Share the Notion claim-review-process doc with Jamie" (ai_0042) and a non-CT2 item (ai_0043).
   - Chef writes `staged_item_skip_reason[ai_0042] = {setBy:'chef',...}` via `writeWithLock`, status flips to `'skipped'`.
   - Simulates `arete meeting extract` re-run via `writeWithLock` using the SAME mutator shape as the production CLI extract path (post-HIGH-1) — returns only the 5 extract-owned keys + the chef-respecting status-map merge.
   - Verifies `staged_item_skip_reason[ai_0042]` survives BYTE-FOR-BYTE (reason, evidence, setBy, setAt all individually checked).
   - Verifies chef's `'skipped'` status survived the merge (was NOT demoted back to `'pending'`).
   - User approves ai_0043; apply runs.
   - Verifies `apply` correctly dropped ai_0042 via the `onSkipped` observer.
   - Verifies body has ai_0043 under "## Approved Action Items" and ai_0042 under "## Skipped on Apply".

This is the integration test that gates HIGH-1's correctness end-to-end.

## Files changed

- `packages/cli/src/commands/meeting.ts` — 1 import added (`writeWithLock`); lines 1071-1119 refactored from direct `storage.write` to `writeWithLock` with a partial-merge mutator.
- `packages/cli/dist/commands/meeting.{js,d.ts,js.map,d.ts.map}` — rebuilt.
- `packages/core/test/services/meeting-lock.test.ts` — +1 test (concurrent CLI race).
- `packages/core/test/integrations/chef-skip-e2e.test.ts` — Flow D renamed; new Flow E added.

No other files touched. Specifically:
- `packages/core/src/models/entities.ts` — untouched.
- `packages/core/src/services/commitments.ts` — untouched.
- `packages/cli/src/commands/commitments.ts` — untouched.
- `packages/core/src/services/migrations/*` — untouched.

## Test status

```bash
npx tsx --test \
  packages/core/test/services/meeting-lock.test.ts \
  packages/core/test/integrations/chef-skip-e2e.test.ts \
  packages/core/test/integrations/staged-items.test.ts \
  packages/core/test/services/chef-skip-directives.test.ts \
  packages/core/test/services/chef-skip-log.test.ts \
  packages/cli/test/commands/meeting-extract.test.ts \
  packages/cli/test/commands/meeting-approve.test.ts \
  packages/cli/test/commands/item-fate-instrumentation.test.ts
```

Result: 165 tests, 35 suites, 0 fail, 0 skipped, 0 todo, duration ~92s.

Additionally verified Phase 10a tests still pass (the gate from the task brief):
- `packages/core/test/services/commitments-counterparty-parser.test.ts` — 35/35.
- `packages/core/test/services/migrations/migrate-to-v2.test.ts` — 13/13.

Typecheck via `tsc --noEmit`: clean on both `packages/core` and `packages/cli`.

Dist rebuild: clean on both packages.

## AC re-verification

| AC | Description | Pre-fix status | Post-fix status |
|----|-------------|----------------|-----------------|
| AC1 | sibling-field schema | YES | YES (unchanged) |
| AC2 | chef writes skip | PARTIAL (no body comment) | PARTIAL (no body comment — LOW-5 untouched) |
| AC3 | apply honors skip + F5 cleanup | YES | YES (unchanged) |
| AC4 | mtime guard inside lock | PARTIAL — single-process only | **YES** — concurrent CLI race now tested |
| AC5 | re-extract preservation via partial-merge | **NO** — production extract path bypassed `writeWithLock` | **YES** — production extract goes through `writeWithLock` + Flow E exercises end-to-end |
| AC6 | user override `[[unskip]]` both forms | YES | YES (unchanged) |
| AC7 | first-week banner | PARTIAL — sentinel not committed | PARTIAL (LOW-2 untouched) |
| AC8 | week-1 confirm gate + F1 demotion criterion | PARTIAL — runtime demotion not implemented | PARTIAL (deferred per build-report-1 / not in this fix's scope) |
| AC9 | APPLY-SKIP audit line | YES | YES (unchanged) |
| AC10 | soak observability | YES | YES (unchanged) |
| AC11 | F5 week-1 unskip survival | YES | YES (unchanged) |

**Net change**: AC5 promoted from NO → YES (the structural undone item). AC4 promoted from PARTIAL → YES.

## What's left

The five LOW concerns from the code review remain as polish:

- **LOW-1** (`writeChefSkipToFile` sugar wrapper composing `writeWithLock + appendChefSkipLog`) — not addressed. Inline composition in tests is ~10-15 LOC; a wrapper would tighten the API surface. Tied to LOW-5.
- **LOW-5** (body-comment insertion at apply time / inline `<!-- chef-skip: ... -->`) — not addressed. AC2 explicitly requires it but it's a UX/visibility surface, not data-path correctness.
- **LOW-2** (sentinel file `.arete/phase-10-followup-2-ship-date.json` committed by THIS build) — not addressed. Ambiguity in the plan about whether "COMMITTED to git" refers to the source repo or the user workspace; deferred to avoid creating a runtime artifact in the source tree.
- **LOW-3** (resolver scan-by-mtime perf — filter by non-empty `staged_item_status` first) — not addressed. Acceptable for v1 per the review.
- **LOW-4** (status formatter SKIP/PROPOSE/UNSKIP/CONFIRM lines for winddown view) — not addressed. Audit log is the canonical surface; the formatter's purpose is narrower than the prompt implies.

None of these block production correctness. All are tracked in the existing code-review for soak-week-1 follow-up.

## Other notes

- The worktree had pre-existing uncommitted Phase 10a changes when this work started (`packages/core/src/services/commitments-counterparty-parser.ts`, `packages/core/src/services/migrations/migrate-to-v2.ts`, `packages/cli/src/commands/commitments.ts`). I did NOT touch those files; the modifications were already on disk and remain unstaged. Phase 10a's test suites pass against the current disk state.
- Untracked plan/doc directories under `dev/work/plans/...` were present at session start and remain untracked (out of scope for this fix).

## Exit condition

**Normal** — all three HIGH fixes shipped with tests; full per-file test suite passes for touched files. Optional LOW concerns deferred per task brief ("Don't block on these if HIGH fixes run long. They're polish.").
