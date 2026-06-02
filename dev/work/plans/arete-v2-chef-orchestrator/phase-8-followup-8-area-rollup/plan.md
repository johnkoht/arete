---
title: "Phase 8 followup-8 — area-rollup gap (commitment-level area propagation)"
slug: phase-8-followup-8-area-rollup
created: "2026-05-27"
revised: "2026-06-01 — post review-1"
parent: arete-v2-chef-orchestrator
owner: meta-orchestrator (Claude)
status: revised-post-review-1
---

## Revisions from review-1 (eng-lead, 2026-06-01)

- **C1 [HIGH]**: WRONG area-parser method. Plan invoked `AreaParserService.getAreaForMeeting(title)` — that's recurring-meeting title match only (returns 1.0 or null). The richer inference logic (area-name-in-title + keyword overlap with focus, producing 0.7-0.8 confidence) lives in **`suggestAreaForMeeting({title, summary, transcript})`** at `area-parser.ts:392`. AC2 now uses `suggestAreaForMeeting` with the 0.7 confidence threshold preserved. Summary/transcript threadable from meeting body for richer matching. **Without this fix, inference fallback recovers ~0 of 24 area-orphan meetings vs the plan's intended material match rate.**
- **C2 [MED]**: Hash-invariance test elevated to explicit GATE in AC5: "`commitments.test.ts` MUST include test asserting `computeCommitmentHash(text, slug, dir)` is invariant when constructed Commitment.area differs. Build-report.md must echo 'hash invariance verified: [test name]'." Pre-mortem R3's #1 silent-regression risk now named in AC5 explicitly.
- **C3 [LOW]**: CLI flag surface clarified for AC3: default = preview (dry-run), `--apply` = write changes, `--reset` = clear `area` field on commitments where `areaSetBy: 'backfill'` provenance marker is present (NOT areas set by Path A or correctly-at-creation). Backfill stamps the provenance marker on every write to enable selective reset.

# Phase 8 followup-8 — area-rollup gap

## Why this exists

Phase 8 first-real-use winddown surfaced a structural data gap: **93% of open commitments (57/61) have `area: null`** in `~/code/arete-reserv/.arete/commitments.json`. Area-scoped views (e.g., "show me all open commitments in glance-communications") render empty because the data has no area attribution to filter on.

Phase 7a AC4 introduced `arete areas` CLI + `jira_epics:` on area frontmatter, betting that area-scoped rollups would let us collapse multiple skill outputs into a single per-area view. That bet only pays out if commitments are area-attributed. Today they are not.

This is the **rollup-gap corollary** to the area-memory work deferred in Phase 4/6: area-memory cannot meaningfully roll up commitments if the commitments themselves carry no area.

**One-line goal**: every newly-extracted commitment carries the correct `area` slug; existing area-orphaned commitments are backfilled by inferring area from their `source` meeting frontmatter (or recurring/keyword match).

## Root cause (scope discovery)

Two creation paths exist; one is correct, one is the bug.

### Path A — Meeting approval flow (`packages/cli/src/commands/meeting.ts:1641, 1668`)

Reads `meetingArea` from `frontmatter['area']` (meeting.ts:1524) and passes it explicitly:

```ts
await services.commitments.create(text, personSlug, personName, direction, {
  area: meetingArea,          // ← correct
  goalSlug: selectedGoalSlug,
  source: `${slug}.md`,
  ...
});
```

This path is correct **when the meeting has area set**. But many meetings don't (see "data audit" below).

### Path B — People-memory refresh (`packages/core/src/services/entity.ts:1354`)

Calls `parseActionItemsFromMeeting(content, person.slug, ownerSlug, source)` then `commitments.sync(personActionItems, nameMap)`.

`parseActionItemsFromMeeting()` (`meeting-parser.ts:325`) returns `ParsedActionItem[]` shapes with NO `area` field. The meeting frontmatter is parsed for `date` (line 332) but the function never reads `area` from the frontmatter, nor accepts an area parameter.

Downstream, `commitments.sync()` (`commitments.ts:530-574`) builds the commitment with `...(item.area ? { area: item.area } : {})` — so it CAN store area, but `item.area` is always undefined coming out of the parser.

**This is the bug**: Path B drops area on the floor even when the meeting has `area:` set in its frontmatter.

### Path C — `arete commitments create` CLI (`packages/cli/src/commands/commitments.ts:250`)

Accepts `--area <slug>` and passes through correctly. Not in scope.

## Data audit (informs scope)

Inspected 26 unique source meetings for the 57 area-null open commitments:

| Bucket | Count | Action |
|---|---|---|
| Meeting has `area:` frontmatter, commitment is null | 2 | Path B bug; fixable by extract-time fix |
| Meeting has NO `area:` frontmatter | 24 | Upstream gap — meetings themselves are area-orphaned |

So the Path B fix alone recovers ~3-5% (2/57) of the area-null open commitments. The **larger gap is upstream**: most meetings never get `area:` set at all, because:

- Krisp auto-import doesn't infer area
- Approval flow doesn't backfill area if user doesn't explicitly set it
- No periodic "infer area for unlabeled meetings" job runs

A more durable fix touches **two** surfaces:

1. **Path B extract-time fix** (small): parse area from meeting frontmatter; pass into commitments.
2. **Area-inference fallback** (medium): when meeting frontmatter has no area, call `AreaParserService.getAreaForMeeting(meetingTitle)` (already exists, used in `meeting-context.ts:902`) to recurring/keyword-match. Apply both to commitments AND optionally to backfill meeting frontmatter.

## Scope (acceptance criteria)

### AC1 — Extract-time area propagation in Path B (GATE)

`packages/core/src/services/meeting-parser.ts`:
- Add optional `meetingArea?: string` parameter to `parseActionItemsFromMeeting()` (read by caller from frontmatter)
- Populate `area` on each returned `ParsedActionItem`
- Update `ParsedActionItem` type to include `area?: string`
- Keep the parameter optional for backward compat with existing tests

`packages/core/src/services/person-signals.ts`:
- `PersonActionItem.area?: string` already exists (line 200). No type change needed.

`packages/core/src/services/entity.ts:1351-1359`:
- Read `area` from meeting frontmatter (already parsed at line 1296 as `parsed.frontmatter`)
- Pass to `parseActionItemsFromMeeting(content, person.slug, ownerSlug, source, area)`

Net effect: `commitments.sync()` now receives `item.area` populated from meeting frontmatter; existing `...(item.area ? { area: item.area } : {})` line at `commitments.ts:560` propagates it through.

### AC2 — Area-inference fallback (GATE)

When meeting frontmatter has no `area:`, fall back to `AreaParserService.getAreaForMeeting(meetingTitle)`:

- In `entity.ts:1351-1359`, before passing area to `parseActionItemsFromMeeting`, do:
  ```ts
  let meetingArea = typeof parsed?.frontmatter.area === 'string' ? parsed.frontmatter.area : undefined;
  if (!meetingArea && parsed?.frontmatter.title) {
    const match = await areaParser.getAreaForMeeting(String(parsed.frontmatter.title));
    if (match && match.confidence >= 0.7) meetingArea = match.areaSlug;
  }
  ```
- Requires injecting `AreaParserService` into the people-memory refresh path. The service factory already constructs it; verify it's reachable from `entity.refreshPersonMemory`.
- Confidence threshold (0.7) excludes weak keyword matches. Adjust during build if false-positive rate is concerning.

### AC3 — Backfill existing commitments (GATE — scope decision)

**Recommendation: INCLUDE backfill** in this followup. Rationale:

- AC1 + AC2 only fix going-forward. Existing 57 area-null open commitments remain orphaned until they resolve.
- Backfill is ~30 LOC: walk `commitments.json`, for each `area == null`, read `source` meeting frontmatter, infer area (same logic as AC2), write back.
- One-shot job. Run once post-merge; no maintenance burden.

Implementation:
- New CLI subcommand: `arete commitments backfill-area [--dry-run]`
- Reads `.arete/commitments.json` via `CommitmentsService`
- For each commitment with `area == null`, locate `source` file in `resources/meetings/`, parse frontmatter, fall back to `getAreaForMeeting(title)` per AC2
- Report: N commitments updated, M still null (source missing or no inference match)

If backfill turns out to need >100 LOC or new abstractions, drop it; the going-forward fix is still the priority.

### AC4 — (Optional stretch) Backfill meeting frontmatter

For meetings where `getAreaForMeeting(title)` would return a match but frontmatter has no `area:`, write area back to meeting frontmatter as part of the backfill job. This makes future `arete people memory refresh` runs find area without re-running inference.

**Defer to stretch**: requires touching `.md` files in resources/meetings/. Risk of editing user's notes. Lean: skip for v1; rely on inference-at-read-time.

### AC5 — Tests (GATE)

Per-file `tsx --test`:
- `meeting-parser.test.ts` — add cases for area propagation when frontmatter has area / has no area / `meetingArea` parameter passed explicitly
- `commitments.test.ts` — verify `sync()` preserves area when `PersonActionItem.area` is set
- `entity.test.ts` (if it covers refreshPersonMemory) — integration test with a meeting that has `area:` set

### AC6 — Discipline ledger

| Item | LOC |
|---|---|
| `meeting-parser.ts` — area param + return field | ~10 |
| `entity.ts` — read area from frontmatter, pass through, inference fallback | ~20 |
| `commitments.ts` — (no change; already supports area passthrough) | 0 |
| Backfill CLI subcommand | ~50 |
| Tests | ~80 |
| **Net** | **~+160 LOC** |

Net positive. Justification: this is a data-correctness gap, not a feature add. The "discipline negative" ledger is from Phase 7-8 architectural cleanup; this is a Phase-8-followup data fix and is exempt from the negative-LOC budget (parent plan AC8 applies to chef-pattern simplification, not data integrity).

### AC7 — Rollback path

- Path B fix (AC1+AC2): `git revert` restores prior parser signature; no schema change
- Backfill (AC3): one-shot job; if it sets wrong areas, re-run with corrected logic or null them out via `arete commitments backfill-area --reset`
- No data migration; commitments.json schema is unchanged

## Skeptical view (per parent plan principle #9)

**Strongest case against:**

"The data audit shows the real gap is **meetings without area frontmatter** (24/26 sources). Fixing Path B propagation only recovers 2 commitments. The other 24 sources have no area in the meeting either — so the inference fallback (AC2) is doing the heavy lifting, and inference accuracy is unverified. If `getAreaForMeeting` matches the wrong area (e.g., a meeting title like 'Quick Sync' matches no recurring rule and gets misclassified by a noisy keyword), we now have wrong-area commitments instead of null-area commitments. Wrong is worse than missing — area-scoped views look populated but show items that don't belong."

**Counter:**

1. The 0.7 confidence threshold in `getAreaForMeeting` is conservative — recurring matches are 1.0, weak keyword matches are <0.5
2. `area: null` commitments are equally invisible to area views, so "wrong" only matters if it creates active noise; the dominant failure mode is "no match found", which leaves commitment area-null (current state)
3. Backfill (AC3) is reversible; if accuracy is poor, reset to null
4. The alternative — relying on user to add `area:` to every meeting — has demonstrably failed (92% miss rate over 1 month)

**Risks** (R1-R5 enumerated in pre-mortem):
- R1: inference misclassifies, populates wrong-area commitments
- R2: backfill job has bug, corrupts commitments.json
- R3: extract-time fix changes commitment hash semantics, causes resync churn
- R4: AreaParserService injection into entity.ts breaks factory wiring
- R5: AC2 confidence threshold poorly tuned, either too permissive (R1) or too strict (no improvement)

## Phase plan requirements

- **MC1 (gates vs stretch)**: AC1, AC2, AC3, AC5, AC6, AC7 are gates. AC4 is stretch (defer).
- **MC2 (rollback per surface)**: per-AC rollback documented.
- **MC3 (shadow validation)**: optional — run `arete commitments backfill-area --dry-run` against arete-reserv before commit; review output.
- **MC4 (PATTERNS.md ship first)**: N/A — no new architectural pattern.
- **MC5 (legacy interaction)**: confirmed no other commitment-creation paths.

## Recommended execution mode

**Full sub-worktree cycle**, not hotfix. Reasoning:

- Two code surfaces (parser + entity) plus backfill CLI = 3 commits minimum
- Touches dedup-adjacent logic (area is metadata-only per `commitments.ts:559` comment, but reviewer should re-verify hash is unchanged)
- Tests touch parser, commitments, and an integration path
- ~160 LOC + tests; eng-lead review is warranted

Sized as: **fix-now, not queue-for-later**. The data gap is actively harming the chef-pattern win — area-scoped skill outputs render empty, which is the kind of "looks broken" symptom that erodes trust in v2. Fix is well-scoped, low-risk, and has a reversible backfill.

Estimate: 1-2 day sub-worktree cycle.

## Build orchestration

Sub-orchestrator runs in manually-created sub-worktree per Phase 3+ pattern.

Branch: `worktree-phase-8-followup-8-area-rollup`
Worktree path: `.claude/worktrees/phase-8-followup-8-area-rollup`

Steps:
1. **Pre-flight**: confirm latest parent (8f7 + soak commits) reachable; `arete-reserv` workspace available for shadow validation
2. **AC1 build** — meeting-parser.ts signature + entity.ts read+pass. Commit.
3. **AC2 build** — inject AreaParserService into entity.refreshPersonMemory; inference fallback. Commit.
4. **AC3 build** — `arete commitments backfill-area` subcommand. Commit.
5. **AC5 tests** — meeting-parser, commitments, entity. Commit.
6. **Shadow validation**: run `arete commitments backfill-area --dry-run` against `~/code/arete-reserv`. Capture stdout. If any commitment proposed-area is suspicious, lower confidence threshold or escalate.
7. **Rebuild dist**. Commit.
8. **Write build-report.md** with: before/after area-null counts, backfill match rate, sample classifications, confidence distribution.

Eng-lead review at end. Fix-ups if needed. Merge to parent.

## Open questions / parking lot

- AC2 confidence threshold tuning — start at 0.7; revisit if shadow validation shows <50% match rate or >5% false positives
- Whether `getAreaForMeeting` should also consider participant overlap (people memory + area linkages) — defer to a future enhancement
- AC4 (frontmatter backfill) — leave for a separate follow-up if AC1-3 land cleanly
- Should `arete commitments backfill-area` be auto-run as part of `arete people memory refresh`? Lean no — keep it explicit/idempotent for now
