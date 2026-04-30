# Self-Match Reconciliation Fix (cross-meeting batch)

**Date**: 2026-04-30
**Triggered by**: Regression report — Apr 29 "Claude Code for Reserv Product" meeting had 6 staged items marked `skipped`/`reconciled` despite being legitimately new.
**Size**: Small (5 source files, 4 new tests, 3 commits)
**Commits**: `62f82a4a` (fix), `4150bdec` (wiring test), `<this commit>` (review nits + wrap)

## What Changed

`loadRecentMeetingBatch` gained an optional `excludePath?: string` (4th positional). Three call sites now pass the current meeting's path so reconciliation no longer matches the meeting being processed against itself:

- `packages/cli/src/commands/meeting.ts:897` (CLI extract)
- `packages/apps/backend/src/services/agent.ts:351` (backend reconciliation merge)
- `packages/apps/backend/src/services/agent.ts:684` (backend priorItems loader fed into the LLM extraction prompt)

The backend `ProcessingDeps.loadRecentBatch` interface was widened to accept an `excludePath` arg; `createDefaultDeps` forwards it.

### Files touched
- **Core**: `packages/core/src/services/meeting-reconciliation.ts` — added `excludePath` param to `loadRecentMeetingBatch`
- **CLI**: `packages/cli/src/commands/meeting.ts` — passes `meetingPath`
- **Backend**: `packages/apps/backend/src/services/agent.ts` — interface signature, two call sites
- **Tests**: 3 unit tests on `loadRecentMeetingBatch` (back-compat, excludePath honored, end-to-end regression mirroring the incident); 1 wiring test in `agent.test.ts` capturing the arg passed to `deps.loadRecentBatch`
- **Docs**: `packages/core/src/services/LEARNINGS.md` (entry naming the failure mode + diagnostic tell), `CHANGELOG.md` (Unreleased)

## Diagnosis

The diagnostic tell was empty `matched_text` on the reconciled items. Per-item Jaccard paths (`processMeetingExtraction` matching against completed/open tasks) write `matched_text` when they reconcile; the cross-meeting merge path (`meeting.ts:977-979`) only writes `status` and `source`. So an item with `source: 'reconciled'` and no `matched_text` came from cross-meeting batch logic, not local Jaccard or LLM batch review.

Reproduction was decisive: re-running `reconcileMeetingBatch` against the actual incident meeting + recent workspace state showed 11/12 items flagged DUPLICATE with `duplicateOf` pointing at the meeting being processed itself. After the fix: 0/12.

The actual incident hit 6/12, not 11/12, because the meeting's on-disk staged items (from a prior extraction pass) had drifted slightly from the new extraction — only 6 items still cleared Jaccard ≥ 0.7 against their own predecessors. That drift between extraction passes is itself worth following up on (see Recommendations).

## Key Decisions

1. **Load-layer guard, not algorithm-layer.** Initial plan added a same-`meetingPath` `continue` inside `findDuplicates`. Eng-manager review (during planning) flagged it as wrong: `findDuplicates` is a pure primitive and a same-path short-circuit would silently kill *legitimate* intra-meeting dedup (LLM consolidation prompt isn't perfect — there's an existing learning that fragmentation is a prompt problem, not a dedup problem). Fix moved to the load layer where the actual call-site composition happens.
2. **Positional optional arg, not options bag.** `loadRecentMeetingBatch(storage, dir, days?, excludePath?)`. Days already had a default; positional arg keeps the signature compact and back-compat.
3. **Apply to priorItems loader too.** The eng-manager review didn't ask for this, but `agent.ts:684`'s priorItems load had the same self-suppression risk: on reprocess, the meeting's own items would feed back into the LLM extraction prompt as "already extracted, skip these." Fixed in the same commit.

## Learnings

- **Empty `matched_text` is a diagnostic signature for cross-meeting reconciliation.** When an item is `status: 'skipped'`, `source: 'reconciled'`, but has no `matched_text`, it came from `findDuplicates` or `matchRecentMemory` (cross-meeting paths), not from per-item Jaccard. Per-item paths always write `matched_text`. Use this distinction when triaging "why was this item dropped?" reports.
- **Self-match is a class of bug, not a one-off.** Any time a function loads "everything in scope" and a caller composes `[...thatScope, current]`, you're at risk if "current" is also in scope. The same pattern lurks in any other `loadRecentX(...) + currentX` flow. Worth a grep.
- **Algorithm-layer guards bake caller assumptions into primitives.** The eng manager's veto on the `findDuplicates` guard was the right call — primitives should encode invariants of the data, not invariants of how callers happen to compose batches today.
- **Reproduction with real data was 5x cheaper than reading code.** I spent ~20 minutes tracing reconciliation paths in code; a 30-line node script that re-ran the actual reconciliation pipeline against the incident meeting nailed the bug in one run, with the smoking-gun annotation (`duplicateOf: <the meeting itself>`) printed verbatim.

## Review Notes

- **Eng-manager (planning review)**: Killed the algorithm-layer guard from the initial plan. Asked for a `loadRecentMeetingBatch` back-compat test (excludePath unset → meeting still picked up). Flagged the worktree language as passive — made it imperative. All addressed.
- **Eng-lead (post-implementation review)**: APPROVED with 2 nits — JSDoc strengthening on the strict-`===` invariant, LEARNINGS phrasing to survive future status additions. Both addressed in the wrap commit. Also caught 2 *additional* pre-existing test failures in `view.test.ts` (`spawns server, polls health…` and `kills child process on SIGINT`) — separate from the 3 in `agent.test.ts` I'd flagged. Both sets confirmed pre-existing on `main` and unrelated to this fix.

## Test Status

- **New tests**: 4 (3 in `meeting-reconciliation.test.ts`, 1 in `agent.test.ts`). All pass.
- **Suite-wide**: 97/97 in `meeting-reconciliation.test.ts`, 50/50 in `meeting-extract.test.ts`, 49/52 in `agent.test.ts` (3 pre-existing failures unrelated to fix).
- **Pre-existing failures noted for follow-up**:
  - `agent.test.ts`: `dedup takes precedence over confidence for approval status`, `handles boundary case: exactly 0.5 confidence is included as pending`, `auto-approves items matching priorItems`
  - `view.test.ts`: `spawns server, polls health…`, `kills child process on SIGINT`
  All five present on `main` before this fix.

## Recommendations (Continue / Stop / Start)

- **Continue**: Reproduce-with-real-data before reading code on diagnostic tasks. Faster signal, cheaper than tracing logic paths.
- **Continue**: Eng-manager planning review *before* implementation. Caught the algorithm-layer-guard mistake before any code was written. Cheap insurance.
- **Start**: Grep for other `[...recentX, currentX]` patterns. Same self-match class could exist anywhere `loadRecentX` returns a superset that includes "current."
- **Start**: Investigate the 6/12 drift. Re-running the wiki-leaning extraction on the same source produced different-enough text on 6 of 12 items that Jaccard ≥ 0.7 didn't hold against the prior pass. If extraction is non-deterministic at that magnitude, the dedup threshold is doing real work and we should either pin extraction more tightly or accept the drift as a known characteristic.
- **Start**: Reconcile + priorItems lookback windows are both hard-coded `7` days in the backend; CLI accepts `--reconcile-days`. Backend should respect a configured window.

## Follow-ups

- [ ] Reprocess `2026-04-29-claude-code-for-reserv-product.md` to fix its lingering bad `staged_item_status`/`source` values. Fix prevents new occurrences but doesn't retroactively repair the file.
- [ ] Triage 5 pre-existing test failures (3 in `agent.test.ts`, 2 in `view.test.ts`).
- [ ] Investigate extraction determinism (6/12 drift across extraction passes on identical source).
- [ ] Backend lookback window: respect a config value rather than hard-coded `7`.
