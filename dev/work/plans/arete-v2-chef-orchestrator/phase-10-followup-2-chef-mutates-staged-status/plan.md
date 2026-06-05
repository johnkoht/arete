# Phase 10 followup-2 — Chef Mutates `staged_item_status` (Structural Skip-Already-Done)

**Status**: planning — v3 (pre-mortem F1/F2/F5 + M1-M4 applied; build-ready, no further reviewers)
**Authored**: 2026-06-05 (v1) → 2026-06-06 (v2) → 2026-06-07 (v3)
**Parent**: arete-v2-chef-orchestrator
**Extracted from**: Phase 11 v1 Goal 2 (`phase-11-external-resolution-unified-approval/plan.md`) — both reviewers (PM + eng-lead) recommended shipping this independently of Phase 11's Gmail integration
**Depends on**: Phase 10 main scope shipped (data model + reactive dedup); Phase 10 10a-pre `proper-lockfile` + `CommitmentsService.withLock` shipped (commitments only — meeting-file lockfile is net-new in this followup)
**Triggered by**: 2026-06-04 winddown CT2 catch — chef detected "Share Notion claim-review-process doc with Jamie" was already fulfilled via Slack DM, but had no structural way to enforce skip on apply. User clicked "approve all staged" → CT2 commitment created anyway.

**Revision history**:
- v1 (2026-06-05): initial build-ready draft. Closes the CT2 gap structurally with a parallel sibling frontmatter field (`staged_item_skip_reason`).
- v2 (2026-06-06): applies PM blocking (`[[confirm-skip]]` gate for first 7 days) + eng C1/C2/C3 (lockfile + parser pre-conditions re-tensed; meeting-file lockfile built here; step sizes corrected to 4.5-5 days); audit log format converged to Phase 9 shape; R5 reworded with extract-time producer references.
- v3 (2026-06-07): pre-mortem PROCEED-WITH-MITIGATIONS verdict applied — F1 stricter demotion criterion, F2 partial-merge mutator contract, F5 cleanup-filter-by-approvedIds bug fix at `staged-items.ts:575-579`, plus M1/M2/M3/M4 ergonomics & doc clarifications. See mapping table below.

**v3 mapping table** (pre-mortem finding → plan change):

| Finding | Severity | Plan change | Location |
|---------|----------|-------------|----------|
| F1 — week-1 demotion criterion too weak | High | AC8 demotion now requires ≥1 CONFIRM AND zero UNSKIP; if neither directive used in 7d → stay in week-1 + nudge text | AC8, R6, §Soak observability |
| F2 — lockfile serializes writes but doesn't enforce per-field ownership | High | `writeWithLock` mutator returns `Partial<Frontmatter>` (merge, not replace); extract path mutator returns only its 5 owned keys; `staged_item_skip_reason` survives by default | §Architecture, Step 2, AC5 |
| F5 — apply cleanup at staged-items.ts:575-579 wipes sibling fields wholesale | **Critical** | Step 4a added: cleanup filters by `approvedIds` set; pending items + their sibling fields stay in frontmatter; week-1 unskip flow becomes safe | Step 4a, AC3, AC8, R3 |
| M1 — audit log grep ergonomics | Low | §Soak observability includes awk-strip recipe + 3 canonical `jq` invocations | §Soak observability |
| M2 — pending-status ambiguity (extract vs chef) | Low | Discriminator documented: `staged_item_skip_reason[id]?.setBy === 'chef-proposed'` distinguishes chef-proposed from bare-extract pending | §Architecture (data model), Step 6 SKILL.md prose |
| M3 — first-ship sentinel + worktree workflow | Low | Sentinel COMMITTED (not gitignored); demotion logic fail-closed if sentinel missing | Pre-condition #4, AC7 |
| M4 — Phase 9 `mode` token semantics divergence | Low | Document: `chef-skip` is module-name; action is inside payload (event-type-richer than Phase 9). Not a divergence to fix. | §Audit log |

---

## Background

The 2026-06-04 winddown caught this pattern in real-time (`now/archive/daily-winddown/winddown-2026-06-04.md:13-15`):

> [CT2] Staged action item 'Share the Notion claim-review-process doc with Jamie' (from John/Jamie today) — **already fulfilled**: you DM'd Jamie the Notion link today.
> Evidence: Slack DM → Jamie Burk, 2026-06-04
> Action if approved: do NOT create this commitment on meeting approve (skip-stage; already done)

The chef noticed the Slack DM evidence and proposed skipping. But the *only* enforcement mechanism today is prose in the chef-curated output asking the user to remember to exclude CT2. When the user clicks "approve all staged," there's no structural backstop and CT2 gets committed anyway.

**This is a structural gap, not a model gap.** The chef has the signal; the data path doesn't honor it. This followup-2 closes that gap end-to-end without depending on Gmail integration (Phase 11) or the Phase 10 14-day soak.

### Why split out from Phase 11

Phase 11 v1 bundled this work as Goal 2 ("11b chef-mutates-staged-status"). Both reviewers recommended shipping it as a Phase 10 followup: fresh empirical signal (no soak needed to confirm), no Gmail dependency (chef writes off whatever evidence it can already see today), lower trust risk (user-visible BEFORE apply, with inline override hint), smaller surface.

---

## Goal (v2 — one)

When the chef detects via cross-source evidence that a staged action item has already been fulfilled, it writes a structural marker into the meeting frontmatter BEFORE the user reviews. `arete meeting approve` honors the marker and skips the item — no commitment created. The user can SEE the chef's decision in the winddown curated view, in the meeting body (audit comment), and in frontmatter; they can override by editing frontmatter, by issuing an `[[unskip <id>]]` directive in the next winddown, or — during the first 7 days post-ship — by *omitting* a `[[confirm-skip <id>]]` directive (the chef-proposed skip lapses to `pending` and stages normally).

---

## Non-goals (explicit deferrals)

- **Gmail Sent integration / auto-resolution of committed entries** — Phase 11a. This followup only acts on STAGED items.
- **Cross-source detection beyond what chef can already do via existing MCP** — chef detection sources are whatever winddown SKILL.md already brings online today (Slack rules, in-meeting mentions, etc.). No new MCP plumbing.
- **Building a Slack-Sent provider** — Phase 12+.
- **`[[unresolve]]` for committed entries / decision auto-stale / unified approval surface** — Phase 11 scope.
- **LLM-graded confidence on chef skip decisions** — chef writes when its existing precision threshold ("concrete match") fires. This followup wires the data path, not the confidence model.
- **Rename detection across re-extracts** (per MC3) — orphan = drop.

---

## Pre-conditions

1. **Phase 10 main scope has shipped** — data model + reactive dedup. **`proper-lockfile` + `CommitmentsService.withLock` is shipped from Phase 10 10a-pre FOR COMMITMENTS ONLY.** Meeting-file lockfile is NET-NEW in this followup — built in Step 2 (~½ extra day) as `MeetingService.writeWithLock(slug, mutator)`. Not inheritable from 10a-pre; eng C1 corrected the v1 mis-tense.
2. **No pre-existing `[[<directive>]]` parser infrastructure.** Phase 10's `[[unmerge]]` is specified but the parser does not exist in `packages/core/src` or `packages/cli/src` (verified via grep). **The `[[unskip <id>]]` and `[[confirm-skip <id>]]` parser built in this followup IS the directive infrastructure for the project**; Phase 10b-aux's eventual `[[unmerge]]` will follow this precedent (parser shape, meeting-file resolver, audit-log conventions). Eng C1 promoted the parser from "fallback" to "the path."
3. **`commitApprovedItems` confirmed to silently filter non-`'approved'` statuses** — verified at `packages/core/src/integrations/staged-items.ts:485-488`: `Object.entries(statusMap).filter(([, v]) => v === 'approved')`. Items with `'skipped'` are naturally excluded; no parser change needed at apply time to honor the skip. **However** (F5): the cleanup at lines 575-579 wholesale-deletes all sibling fields regardless of approval state. Step 4a fixes this — see §Build phases.
4. **First-ship sentinel** — workspace config records the followup-2 ship date so the 7-day `[[confirm-skip]]` window can elapse deterministically (per MC4). Stored at `.arete/phase-10-followup-2-ship-date.json` with `{ shippedAt: ISO }`. **COMMITTED to git** (not gitignored — M3). If sentinel is missing/unparseable on read, demotion logic fails closed: assume week-1, keep chef-proposed gate active. Worktree merge does NOT lose the sentinel because it's a committed runtime config.

---

## Hard parts

### HP1 — Atomicity of chef-write-during-winddown + user-approve-later

Chef writes `staged_item_skip_reason` during winddown (6pm). User clicks `approve all staged` later that evening or next morning. In between, `arete meeting extract` may re-run (async Fathom transcript arrives 3 days late). Risks:

- **Re-extract clobber** — `meeting.ts:1103-1108` writes `staged_item_*` sibling fields wholesale on extract.
- **Concurrent CLI writer race** — chef SKILL invokes `writeChefSkipToFile` while `arete meeting extract` runs in another terminal. mtime guard alone does NOT catch this (both writers see stale mtime; eng C2 finding).
- **Apply-after-chef-mutate timing** — if `arete meeting approve` reads stale content, skip is missed.

**Mitigation**: meeting-file lockfile (`MeetingService.writeWithLock`) — REQUIRED, not optional (eng C2). mtime guard at 60s INSIDE the lock for user-in-editor race; atomic tmp + rename; **mutator returns `Partial<Frontmatter>` (v3 F2 fix) so any keys the mutator does NOT touch survive by definition** — extract's mutator returning only the 5 extract-owned keys leaves `staged_item_skip_reason` intact. The combination — lock for concurrent CLI, mtime for editor, partial-merge mutator contract — closes all three.

### HP2 — Rendering visibility (first-week trust)

Frontmatter is collapsed/invisible in most editors. If chef writes `staged_item_status[ai_0042] = 'skipped'` silently, the user won't notice. Three surfaces required (all-of, not one-of):

1. **Winddown curated view** — chef surfaces every chef-proposed skip in a dedicated section with evidence link + `[[unskip <id>]]` hint **on every skip line, persistent past banner removal** (PM C2). During first 7 days, also surfaces `[[confirm-skip <id>]]` hint on each line.
2. **Meeting body audit comment** — inline `<!-- chef-skip: <reason> | evidence: <ref> -->` next to the staged item line.
3. **Frontmatter** — the load-bearing structural field; consumed by `commitApprovedItems`.

### HP3 — User-trust first-week confirm gate

PM C1 blocking change: for the first 7 days post-ship, chef MUST NOT directly write `staged_item_status = 'skipped'`. Instead:

- Chef writes `staged_item_status[id] = 'pending'` (UNCHANGED from extract default) AND `staged_item_skip_reason[id] = { ..., setBy: 'chef-proposed' }` (NEW provenance value).
- Winddown curated view surfaces "Chef proposes skipping: ai_0042 — already fulfilled via slack-dm. To confirm, add `[[confirm-skip ai_0042]]` to this view before re-running winddown."
- If user adds `[[confirm-skip ai_0042]]` → next winddown flips `staged_item_status` to `'skipped'` AND updates `setBy: 'chef'` (confirmed).
- If user does nothing for 7 days OR omits `[[confirm-skip]]` and runs apply → item is `'pending'`, falls through to normal staging flow (chef-proposed skip lapses harmlessly). **Critically (F5 fix in Step 4a):** the pending item's sibling fields are PRESERVED on apply — `commitApprovedItems` only clears fields for committed (approved) IDs.
- **After 7 days post-ship AND ≥1 CONFIRM in audit log AND zero UNSKIP in audit log (F1 stricter criterion)** → chef demotes to direct `'skipped'` write (no more `chef-proposed` step). Demotion is automatic.
- If 7d elapses with zero CONFIRM AND zero UNSKIP → stay in week-1 mode AND surface "You haven't audited any chef skips this week; review or run `arete dedup --scope chef-skips` to clear backlog" in the next winddown.

This is conservative-first-week trust-building (mirrors what Phase 11 PM rec'd for Gmail auto-resolve), then demote on validated engagement (not absence of complaint). Cost: 1 winddown cycle of latency for first-week skips, gained in week-1 false-positive safety + demotion validity.

### HP4 — `[[unskip]]` / `[[confirm-skip]]` directive infrastructure

Per pre-condition #2 — this followup OWNS the directive parser surface. Step 6 builds the canonical pattern:

- Lexer: scan winddown view for `\[\[(unskip|confirm-skip)\s+(?:([a-z0-9-]+):)?(ai_\d+)\]\]`.
- Resolver: id-alone → search staged sections of meetings where `staged_item_status` is populated (non-empty map); cap at N=50 most-recent-mtime if candidate list exceeds. Slug-qualified → exact meeting file. Both forms accepted from day 1 (PM C4).
- Disambiguation rules: if id-alone matches in 2+ meetings, surface a "ambiguous — please qualify" line in the next winddown and NO-OP (do not silently pick first). If id-alone matches 0 candidates, surface "no match — may have already been processed."
- Phase 10b-aux's `[[unmerge]]` follows this pattern (same lexer, same resolver shape).

---

## Architecture

### Data model — new parallel sibling frontmatter field

**Keep `staged_item_status` as the existing flat string** per eng-lead C3:

```ts
// EXISTING — packages/core/src/models/integrations.ts:14 — UNCHANGED
export type StagedItemStatus = Record<string, 'approved' | 'skipped' | 'pending'>;
```

**Add new sibling** alongside `staged_item_edits` / `staged_item_owner` / `staged_item_confidence`:

```ts
// NEW — models/integrations.ts
export type StagedItemSkipReason = Record<string, {
  reason: string;                                     // human-readable
  evidence: string;                                   // free-form reference
  setBy: 'chef' | 'chef-proposed' | 'user';           // chef = confirmed/post-week-1; chef-proposed = week-1 stage-1; user = override
  setAt: string;                                      // ISO 8601 timestamp
}>;
```

In meeting frontmatter (post-week-1 confirmed shape):

```yaml
staged_item_status:
  ai_0042: skipped          # post-week-1 OR confirmed via [[confirm-skip]]
  ai_0043: pending

staged_item_skip_reason:
  ai_0042:
    reason: already fulfilled via slack-dm
    evidence: "Slack DM → Jamie Burk, 2026-06-04"
    setBy: chef
    setAt: 2026-06-04T18:42:11Z
```

During week-1 (chef-proposed shape):

```yaml
staged_item_status:
  ai_0042: pending          # NOT skipped — awaits [[confirm-skip]]
staged_item_skip_reason:
  ai_0042:
    setBy: chef-proposed
    # ... rest same shape
```

**Why this shape**:
- `staged_item_status` stays flat string. Parser changes for apply path = zero LOC for the *filter*; one LOC change for the *cleanup* (F5/Step 4a — filter by `approvedIds`).
- `staged_item_skip_reason` mirrors existing sibling-field schema (`staged-items.ts:204-247`). Parser is a clone of `parseStagedItemOwner` with a different shape validator.
- Backward compat: missing `staged_item_skip_reason` is a no-op (M3 first-ship — every existing meeting has no skip_reason; chef logic must handle this initial state gracefully — implementation: treat absence as `{}`).

**Pending-status discriminator (M2)**: chef-proposed pending and extract-default pending are both `'pending'` in `staged_item_status`. They're distinguished via:

| Producer | `staged_item_status[id]` | `staged_item_skip_reason[id]` |
|----------|--------------------------|--------------------------------|
| extract default | `'pending'` | undefined |
| chef-proposed (week-1) | `'pending'` | `{ setBy: 'chef-proposed', ... }` |
| chef confirmed (week-2+ OR `[[confirm-skip]]`) | `'skipped'` | `{ setBy: 'chef', ... }` |
| user override via `[[unskip]]` | `'pending'` | undefined (deleted) |
| extract-time existing-task skip | `'skipped'` | undefined |

SKILL.md (Step 6) MUST filter the "Chef proposes skipping" section by `staged_item_skip_reason[id]?.setBy === 'chef-proposed'`. Do NOT surface bare-pending items in this section.

### `MeetingService.writeWithLock(slug, mutator)` — NEW (eng C2 + v3 F2 tightening)

```ts
// NEW — packages/core/src/services/meeting.ts
export interface MeetingFrontmatterRead {
  frontmatter: Readonly<Record<string, unknown>>;
  body: string;
  mtime: Date;
}

/**
 * Mutator returns a PARTIAL frontmatter patch + optional body replacement.
 *   - Returned keys are MERGED (shallow) into current.frontmatter.
 *   - Keys NOT returned are preserved unchanged.
 *   - To DELETE: return `{ [key]: undefined }` explicitly.
 *   - To abstain: return `{ abstain: '<reason>' }`.
 *
 * INVARIANT (v3 F2): mutator CANNOT accidentally clobber sibling fields it
 * doesn't touch. Extract's mutator returns only its 5 owned keys (status,
 * edits, source, confidence, owner); `staged_item_skip_reason` survives BY
 * DEFAULT — type system + shallow-merge enforce per-field ownership.
 */
export type MeetingMutationResult =
  | { frontmatter: Partial<Record<string, unknown>>; body?: string }
  | { abstain: string };

export type MeetingMutator =
  (current: MeetingFrontmatterRead) => Promise<MeetingMutationResult>;

export async function writeWithLock(
  storage: StorageAdapter, meetingPath: string, mutator: MeetingMutator,
  options?: { mtimeGuardSeconds?: number },
): Promise<{ written: boolean; abstainReason?: string }>;
```

Implementation: (1) acquire `proper-lockfile` on `<meetingPath>.lock` (TTL 30s, PID stale-check); (2) read current file + mtime, pass to mutator; (3) on `{abstain}` — release, return abstain; (4) shallow-merge returned `frontmatter` into current (explicit `undefined` deletes); body replaced if returned else preserved; (5) atomic tmp+rename via storage adapter; (6) release lock. ~50 LOC + ~7 unit tests including the **F2 contract test**: pre-existing `{staged_item_status, staged_item_skip_reason}` + mutator returning `{frontmatter: {staged_item_status: ..., staged_item_edits: ...}}` (no `skip_reason` key) → assert post-write `staged_item_skip_reason` is byte-for-byte preserved. This is the contract that makes Step 5's re-extract preservation correct-by-construction.

### Chef writes the skip — winddown phase

`writeChefSkipToFile(storage, filePath, itemId, { reason, evidence, setBy })` wraps `writeWithLock`. Mutator: (a) checks mtime guard (60s) — abstain on fresh user edit; (b) parses existing status + skip_reason maps (defaulting to `{}` per M3 first-ship); (c) patches `staged_item_status[itemId]` to `'skipped'` if `setBy === 'chef'`, leaves `'pending'` if `setBy === 'chef-proposed'`; (d) always patches `staged_item_skip_reason[itemId] = { ...skip, setAt: ISO }` (idempotent per MC2); (e) returns `{ frontmatter, body }` with inline `<!-- chef-skip: <reason> | evidence: <evidence> -->` near the staged-item line (idempotent — replace if exists). Caller then appends audit-log line (SKIP / PROPOSE / ABSTAIN).

### `arete meeting approve` honors `'skipped'` — filter unchanged, cleanup FIXED (F5)

`commitApprovedItems` (`staged-items.ts:463`) already filters to status `'approved'` (line 487). Items with `'skipped'` status are dropped. **The filter is unchanged.**

The cleanup at lines 575-579 IS changed (Step 4a):

```ts
// BEFORE (v2 bug) — staged-items.ts:575-579 wholesale-deleted ALL sibling fields:
//   delete data['staged_item_status']; delete data['staged_item_edits']; ...
// AFTER (v3) — filter each map by approvedIds; pending + chef-proposed survive:
for (const key of [
  'staged_item_status', 'staged_item_edits', 'staged_item_owner',
  'staged_item_source', 'staged_item_confidence', 'staged_item_skip_reason',
] as const) {
  const map = data[key] as Record<string, unknown> | undefined;
  if (map === undefined) continue;
  const filtered = Object.fromEntries(
    Object.entries(map).filter(([id]) => !approvedIds.has(id))
  );
  if (Object.keys(filtered).length === 0) delete data[key];   // empty → drop
  else data[key] = filtered;                                    // partial → keep
}
```

This is the F5 fix. Pending items (chef-proposed OR bare-extract) + skipped items that the user `[[unskip]]`'d back to pending retain their sibling fields for the next round. Only committed items lose their bookkeeping.

Apply-time addition (Step 4): the Approved-section writer pass (`staged-items.ts:534-549`) emits a `## Skipped on Apply` markdown section listing items dropped due to `'skipped'` status, with their reasons read from `staged_item_skip_reason` BEFORE the Step 4a cleanup runs:

```markdown
## Skipped on Apply
- [ai_0042] Share the Notion claim-review-process doc with Jamie  ↪ skipped: already fulfilled via slack-dm (chef, 2026-06-04 18:42)
```

This puts the audit trail in the meeting body permanently after cleanup. Also append APPLY-SKIP audit log line per skipped ID (Q4 promoted to AC per PM C3).

### Re-extract preservation (simplified by F2 fix)

`meeting.ts:1105` overwrites `staged_item_status` wholesale on each `arete meeting extract`. Step 5 changes the extract path to use `writeWithLock` with a mutator that returns ONLY the 5 extract-owned keys:

```ts
// Step 5 — meeting.ts:1103-1108 replaced with:
await writeWithLock(storage, meetingPath, async (current) => {
  // ... LLM extract logic produces newStatus / newEdits / newSource / newConfidence / newOwner ...
  // For status: merge with existing (chef-set 'skipped' wins over extract-set 'pending';
  // extract-time 'skipped' from existing-task path also preserved).
  const mergedStatus = mergeStatusMaps(current.frontmatter.staged_item_status, newStatus);
  return {
    frontmatter: {
      staged_item_status: mergedStatus,
      staged_item_edits: newEdits,
      staged_item_source: newSource,
      staged_item_confidence: newConfidence,
      staged_item_owner: newOwner,
      // staged_item_skip_reason NOT mentioned → survives unchanged via partial-merge (F2 contract)
    },
    body: rewrittenBody,
  };
});
```

By F2's partial-merge contract, the extract mutator CANNOT accidentally drop `staged_item_skip_reason` — it'd have to explicitly return `{ staged_item_skip_reason: undefined }`. The contract makes correctness the default.

1. **`--force-clear-skips` flag**: extract command explicitly returns `{ staged_item_skip_reason: undefined }` when the flag is set.
2. **Orphan handling**: if a preserved-skip ID no longer appears in re-extracted sections, drop the orphan entry (mutator filters them out) + log a one-line warning. Rename detection is out of scope (MC3).

### User override path

Three channels:
1. **Direct frontmatter edit** — user changes `staged_item_status[ai_0042]` from `skipped` to `approved` (or `pending`).
2. **`[[unskip <itemId>]]` directive** — user adds to next winddown view. Parser calls `writeWithLock` with mutator returning `{ frontmatter: { staged_item_status: { ...current, [id]: 'pending' }, staged_item_skip_reason: { ...current, [id]: undefined } } }`. Appends UNSKIP audit log line with `setBy: 'user'`. Accepts id-alone OR `<slug>:<id>` from day 1. **F5 fix interaction**: because Step 4a's cleanup is filter-by-approved-IDs, the unsked item (now pending) RETAINS its presence in `staged_item_status` after the next apply — user can re-approve normally next time.
3. **`[[confirm-skip <itemId>]]` directive** (week-1 only) — user confirms chef-proposed → parser flips `staged_item_status[id]` to `'skipped'` AND updates `staged_item_skip_reason[id].setBy` to `'chef'`. Appends CONFIRM audit log line.

### Audit log (FORMAT v3 — Phase 9-shape with documented divergence)

Append-only file at `dev/diary/chef-skip-log.md`. Format mirrors Phase 9 `brief-invocations.log` (`intelligence.ts:846`): `${ISO} ${mode} ${JSON.stringify(input)}\n`.

**M4 clarification**: the middle token is the module name `chef-skip`, constant across all events. The event-type token (SKIP/PROPOSE/UNSKIP/CONFIRM/ABSTAIN/APPLY-SKIP) lives inside the JSON payload under `action`. This is an intentional, documented divergence from Phase 9's per-invocation-mode token (Phase 9 has 2-3 modes; followup-2 has 6 event types — richer discriminator inside structured payload). The action key matches Phase 9 conventions (`action=skip`, not `mode=skip`).

```
2026-06-04T18:42:11Z chef-skip {"action":"SKIP","id":"ai_0042","meeting":"john-jamie-2026-06-04","setBy":"chef","reason":"already fulfilled via slack-dm","evidence":"Slack DM → Jamie Burk, 2026-06-04"}
2026-06-04T18:42:14Z chef-skip {"action":"PROPOSE","id":"ai_0099","meeting":"john-philip-2026-06-04","setBy":"chef-proposed","reason":"...","evidence":"..."}
2026-06-04T18:42:17Z chef-skip {"action":"ABSTAIN","id":"ai_0055","meeting":"john-greg-2026-06-04","reason":"recent-user-edit","mtimeAgeSec":27}
2026-06-05T08:13:02Z chef-skip {"action":"UNSKIP","id":"ai_0042","meeting":"john-jamie-2026-06-04","setBy":"user"}
2026-06-05T08:13:05Z chef-skip {"action":"CONFIRM","id":"ai_0099","meeting":"john-philip-2026-06-04","setBy":"user→chef"}
2026-06-05T09:15:31Z chef-skip {"action":"APPLY-SKIP","id":"ai_0042","meeting":"john-jamie-2026-06-04"}
```

**M1 grep recipes** (documented for soak reviewer):

```bash
# Count SKIP events
grep '"action":"SKIP"' dev/diary/chef-skip-log.md | wc -l

# Strip the "${ISO} chef-skip " prefix so jq can parse line-delimited JSON
awk '{$1=$2=""; sub(/^  /, ""); print}' dev/diary/chef-skip-log.md | jq -c '.'

# All events from a date range
grep '^2026-06-0[1-7]' dev/diary/chef-skip-log.md | awk '{$1=$2=""; print}' | jq -r 'select(.action == "SKIP") | .id'

# CONFIRM count (F1 demotion criterion)
grep '"action":"CONFIRM"' dev/diary/chef-skip-log.md | wc -l
```

Soak observability: best-effort write; failures don't block winddown or apply. Log is **gitignored** alongside Phase 9's `brief-invocations.log` (M3/F4 — local-only audit, not versioned).

---

## Build phases

Each step sized honestly per eng C3 + v3 Step 4a; total ~5-5.5 days.

**Step 1 — Sibling field + parser (~½ day)**: add `StagedItemSkipReason` type to `models/integrations.ts` (with `'chef' | 'chef-proposed' | 'user'` setBy union + JSDoc documenting the M2 discriminator table); `parseStagedItemSkipReason` to `staged-items.ts` (clone of `parseStagedItemOwner`); snapshot reasons in `commitApprovedItems` BEFORE Step 4a cleanup for Step 4's audit section.

**Step 2 — `MeetingService.writeWithLock` + `writeChefSkipToFile` + mtime guard + atomic write (~1.5 days)**: build net-new meeting-file lockfile via `proper-lockfile` (~50 LOC + 7 tests, eng C2 + v3 F2); **partial-merge mutator contract (v3 F2)**: mutator returns `Partial<Frontmatter>`, shallow-merge into current; explicit `undefined` deletes keys; test for "mutator returning `{status, edits}` does NOT erase existing `skip_reason`"; mtime guard at 60s INSIDE lock; atomic tmp+rename via storage adapter; idempotent inline body comment insertion (locate `- [ ] <text> [ai_0042]` line pattern; fail soft + log warning if not locatable); body-comment idempotence (replace if exists for same `<id>`, MC2).

**Step 3 — Audit log writer (~½ day)**: `appendChefSkipLog(workspacePath, action, payload)` best-effort writer using Phase 9 shape (`${ISO} chef-skip ${JSON.stringify(payload)}\n`); wire SKIP / PROPOSE / ABSTAIN / UNSKIP / CONFIRM / APPLY-SKIP from Steps 2/4/4a/6; gitignore `dev/diary/chef-skip-log.md` in the build PR (M1/F4).

**Step 4 — `commitApprovedItems` audit-section emit (~½ day)**: build "Skipped on Apply" markdown section in approved-section writer pass; insert before `## Transcript`; emit APPLY-SKIP audit line per skipped ID (PM C3, AC9); snapshot `staged_item_skip_reason` map BEFORE Step 4a cleanup so reasons can be rendered.

**Step 4a — NEW v3 — Apply cleanup filter-by-committed-IDs (~½ day, F5 fix)**: replace the wholesale-delete block at `staged-items.ts:575-579` per the §Architecture "cleanup FIXED" spec — for each of the 6 sibling-field keys, retain entries whose ID is NOT in `approvedIds`; drop the key entirely if the filtered map is empty (preserves legacy post-apply shape). Three Step 7 test cases verify the contract — see §Tests.

**Step 5 — Re-extract preservation via partial-merge contract (~½ day, simpler in v3)**: refactor `meeting.ts:1103-1108` extract path to call `writeWithLock` with a mutator returning ONLY the 5 extract-owned keys; status merged per-ID via `mergeStatusMaps` helper (chef-set 'skipped' wins; extract-time 'skipped' from existing-task at meeting-processing.ts:416/439 preserved); `staged_item_skip_reason` survives BY DEFAULT (F2 contract); `--force-clear-skips` → mutator explicitly returns `{ staged_item_skip_reason: undefined }`; orphan IDs filtered + warning logged.

**Step 6 — SKILL.md + directive parser ([[unskip]] + [[confirm-skip]]) (~1 day)**: SKILL.md prose update (week-1 vs week-2+ chef behavior; M2 pending-discriminator prose — "filter pending items by `staged_item_skip_reason[id]?.setBy === 'chef-proposed'`; do NOT surface bare-pending items in this section"); inline `[[unskip <id>]]` hints on every skip line in curated section (PM C2 — persists past banner); inline `[[confirm-skip <id>]]` hints during week-1; first-week banner sourced from sentinel (auto-removes when F1 demotion fires); **directive parser + resolver** — id-alone OR slug-qualified from day 1; resolver scans meetings with non-empty `staged_item_status` (capped at 50 most-recent-mtime); ambiguity NO-OPs with explanatory line in next winddown (PM C4, HP4); **F1 nudge text**: if 7d post-ship AND zero CONFIRM AND zero UNSKIP in audit log → surface "You haven't audited any chef skips this week; review or run `arete dedup --scope chef-skips` to clear backlog."

**Step 7 — Tests + fixtures (~½ day)**: synthetic fixtures only — see §Tests. Three NEW v3 cases required: (a) `writeWithLock` partial-merge preserves untouched keys (F2 contract); (b) `commitApprovedItems` cleanup filters by `approvedIds` (F5 fix); (c) week-1 unskip survival end-to-end (F5 integration).

**Total**: 5-5.5 days (v3 adds Step 4a + 3 new test cases over v2's 4.5-5d).

---

## Acceptance criteria

**AC1 (sibling field schema)**: `staged_item_skip_reason` parses into `Record<string, { reason, evidence, setBy: 'chef'|'chef-proposed'|'user', setAt }>`. Malformed entries drop silently with parser warning. `staged_item_status` remains the existing flat-string union — zero shape change. M3 first-ship: meeting files with no `staged_item_skip_reason` parse to `{}`.

**AC2 (chef writes skip — CT2 reproduction, post-week-1 path)**: synthetic fixture with ai_0042. Helper `writeChefSkipToFile(... setBy: 'chef')` writes `staged_item_status[ai_0042] = 'skipped'` + `staged_item_skip_reason[ai_0042] = { ..., setBy: 'chef', setAt: ISO }` + inline body comment + SKIP audit-log line.

**AC3 (apply honors skip — filter unchanged; cleanup F5-fixed)**: meeting from AC2 → `arete meeting approve` → ai_0042 NOT written to commitments. `## Skipped on Apply` block lists ai_0042 with skip reason. APPLY-SKIP audit log line appended per skipped ID. **Post-commit frontmatter (v3)**: `staged_item_status` and `staged_item_skip_reason` contain ONLY entries for IDs that were NOT approved (e.g., still-pending items survive); approved IDs (`ai_0042`'s sibling entries) are removed. If only `ai_0042` existed in the meeting and it was committed, the map keys are dropped entirely (legacy post-apply shape preserved).

**AC4 (mtime guard inside lock — concurrent edit abstain)**: fixture with mtime 30s ago. `writeChefSkipToFile` returns `{ written: false, abstainReason: 'recent-user-edit' }`. No frontmatter mutation. ABSTAIN audit line appended. SKILL.md surfaces "would have skipped ai_0042 — handle manually."

**AC5 (re-extract preservation via partial-merge — F2)**: chef writes skip → user runs `arete meeting extract <slug>` (no `--force-clear-skips`) → extract mutator returns only 5 owned keys → `staged_item_skip_reason` preserved byte-for-byte (not just key-preserved — full nested payload intact); `staged_item_status[chef-set-IDs]` preserved (merged); other extract-domain sibling fields wholesale-rewritten as today. `--force-clear-skips` → extract explicitly clears `staged_item_skip_reason`. Orphan ID drops with one-line warning. **Type-system test (F2 contract)**: an extract-side mutator that returns `{ staged_item_status: ..., staged_item_edits: ... }` (without mentioning `staged_item_skip_reason`) leaves `staged_item_skip_reason` UNTOUCHED.

**AC6 (user override — `[[unskip]]` directive, both forms)**: winddown view contains `[[unskip ai_0042]]` OR `[[unskip john-jamie-2026-06-04:ai_0042]]`. Parser flips status to `'pending'`, deletes `staged_item_skip_reason[ai_0042]`, appends UNSKIP audit line. Both id-alone and slug-qualified forms work from day 1 (PM C4). Ambiguous id-alone (matches in 2+ meetings) NO-OPs and surfaces "please qualify" in next winddown. Zero-match id-alone surfaces "no match — may have already been processed."

**AC7 (first-week banner)**: chef header during first 7 days post-ship (per `.arete/phase-10-followup-2-ship-date.json` sentinel — COMMITTED to git per M3) surfaces "Followup-2 chef-skip active. N items proposed today; use `[[confirm-skip <id>]]` to confirm or omit to let lapse. Use `[[unskip <id>]]` to override any confirmed skip." Auto-removes when AC8 demotion fires. If sentinel missing/unparseable, fail closed: assume week-1, banner shows.

**AC8 (v3 — stricter `[[confirm-skip]]` gate + F1 demotion criterion)**:
- **Week-1 (day 0 to ship+7d)**: chef writes `staged_item_skip_reason[id] = { ..., setBy: 'chef-proposed' }` AND `staged_item_status[id]` stays `'pending'`. PROPOSE audit line appended.
- Winddown curated view surfaces "Chef proposes skipping ai_0042 — add `[[confirm-skip ai_0042]]` to confirm" on each chef-proposed line (filter by `setBy === 'chef-proposed'` per M2).
- User-confirms via directive in next winddown: parser flips `staged_item_status[id]` to `'skipped'` and updates `setBy: 'chef'`. CONFIRM audit line appended.
- User omits directive: status remains `'pending'`; apply stages normally (chef-proposed lapses harmlessly). **F5 fix critical here**: `staged_item_skip_reason[id]` SURVIVES apply because the item wasn't in `approvedIds`. Next round, chef can re-propose or user can review.
- **Week-2+ demotion criterion (v3 F1 stricter)**: ship+7d elapsed AND **≥1 CONFIRM in audit log** AND **zero UNSKIP in audit log** → chef demotes to direct `'skipped'` write per AC2. Demotion is automatic.
- **F1 zero-engagement fallback**: ship+7d elapsed AND zero CONFIRM AND zero UNSKIP → STAY in week-1 mode; surface in next winddown: "You haven't audited any chef skips this week; review or run `arete dedup --scope chef-skips` to clear backlog." Demotion deferred until either CONFIRM observed or user opts out via config.
- `[[unskip <id>]]` hint persists on every skip/skipped line forever, past banner removal (PM C2).

**AC9 (APPLY-SKIP audit line, PM C3)**: at commit time, each skipped item emits an APPLY-SKIP entry to `chef-skip-log.md` with `{action: "APPLY-SKIP", id, meeting}`. Closes the data-path-honored loop observably from chef→apply.

**AC10 (soak observability)**: `dev/diary/chef-skip-log.md` accumulates one JSON line per event. Format matches Phase 9 `brief-invocations.log` shape (middle token = module-name `chef-skip`; event-type inside payload — M4). `jq` and `grep` both work (grep recipes in §Audit log); daily soak checks per §Soak observability run cleanly. Log gitignored alongside `brief-invocations.log`.

**AC11 (NEW v3 — F5 week-1 unskip survival)**: ship+3d. Chef proposes `ai_0099` (chef-proposed pending); user `[[unskip ai_0099]]` flips to pending + deletes skip_reason; separately user approves `ai_0042` and runs apply. Assert post-apply: `ai_0099` still in `staged_item_status` as `'pending'` (NOT cleared by wholesale wipe). Next round re-surfaces for normal review. Closes F5.

---

## Tests

Synthetic fixtures only. No LLM calls, no production-data writes.

- **CT2 reproduction (AC2 + AC3)**: chef helper → frontmatter mutation → `commitApprovedItems` → no commitment for ai_0042 → "Skipped on Apply" present.
- **Week-1 chef-proposed path (AC8)**: ship sentinel set 3d ago → chef-helper writes `setBy: 'chef-proposed'` + status `'pending'`; `[[confirm-skip ai_0042]]` directive flips to `'skipped'` + `setBy: 'chef'`; omission test (no directive, apply runs) → item stages normally as pending **AND skip_reason survives (F5/AC11)**.
- **Demotion test (AC8 week-2+, v3 stricter)**: ship sentinel set 8d ago + ≥1 CONFIRM entry + zero UNSKIP lines in audit log → chef-helper writes `setBy: 'chef'` directly + status `'skipped'`. Negative test: ship sentinel set 8d ago + zero CONFIRM AND zero UNSKIP → chef stays in chef-proposed mode + nudge surfaced.
- **Concurrent CLI race (HP1, AC4)**: drive two `writeChefSkipToFile` calls in parallel for same meeting; assert lock serializes; both writes land; no corrupt frontmatter.
- **mtime guard inside lock (AC4)**: file mtime 30s old → abstain; no mutation; ABSTAIN logged.
- **`writeWithLock` partial-merge preserves untouched keys (NEW v3, F2)**: pre-existing frontmatter has `{staged_item_status: {ai_0042: 'skipped'}, staged_item_skip_reason: {ai_0042: {reason: 'x', setBy: 'chef', ...}}}`. Call `writeWithLock` with mutator returning `{frontmatter: {staged_item_status: {ai_0042: 'skipped', ai_0043: 'pending'}, staged_item_edits: {ai_0043: 'edited'}}}` (no `staged_item_skip_reason`). Assert post-write frontmatter STILL contains `staged_item_skip_reason[ai_0042]` byte-for-byte (full payload preserved). Assert `staged_item_edits[ai_0043]` was added. Assert no other key was touched.
- **`commitApprovedItems` cleanup filters by approvedIds (NEW v3, F5)**: fixture with `staged_item_status = {ai_0042: 'approved', ai_0043: 'pending', ai_0099: 'pending'}` + `staged_item_skip_reason = {ai_0099: {setBy: 'chef-proposed', ...}}`. Run `commitApprovedItems`. Assert post-commit: `staged_item_status = {ai_0043: 'pending', ai_0099: 'pending'}` (ai_0042 removed); `staged_item_skip_reason = {ai_0099: {...}}` (preserved); `ai_0042`'s entries in all 6 sibling maps are gone.
- **Week-1 unskip survival end-to-end (NEW v3, AC11/F5)**: ship+3d. Chef proposes ai_0099 → user `[[unskip ai_0099]]` (deletes skip_reason; status → pending) → approve ai_0042 → run apply → assert ai_0099 still present in `staged_item_status` as pending (NOT cleared by wholesale wipe).
- **Re-extract preservation + merge (AC5, F2 contract)**: chef skip → extract with mocked LLM same IDs → preserved; extract mutator returns only 5 keys → `skip_reason` survives by F2 contract; `--force-clear-skips` → cleared via explicit `{ staged_item_skip_reason: undefined }`; orphan ID → dropped with warning.
- **`[[unskip]]` both forms (AC6)**: id-alone match → flip; slug-qualified → flip; id-alone ambiguous → NO-OP + "please qualify" surfaced; id-alone zero-match → "no match" surfaced.
- **`[[confirm-skip]]` (AC8)**: directive → flip `chef-proposed` to `chef` and status `pending` → `skipped`; CONFIRM audit line written.
- **Body-comment idempotence (MC2)**: chef writes skip twice for same ID with different evidence → single comment, updated.
- **Audit log format (M1/M4)**: written entries parse as `${ISO} chef-skip ${JSON.stringify(...)}` — awk-strip + `jq -r` over file yields valid objects per documented recipe.
- **First-ship sentinel fail-closed (M3)**: sentinel file missing → demotion logic returns "week-1"; sentinel file unparseable JSON → same. Banner shows.
- **Backward compat / M3 first-ship**: meeting with no `staged_item_skip_reason` → parsers return `{}`; chef logic handles initial state; no errors.

---

## Risks

**R1 — False-positive chef-skip (trust crater)**: chef writes skip on item user had NOT fulfilled. Mitigation: chef writes only when its winddown surface already produces a "concrete match" (existing precision threshold preserved); week-1 `[[confirm-skip]]` gate (AC8) catches false positives BEFORE commit. Three visibility surfaces (HP2). First-week banner (AC7). Audit log makes false positives detectable (AC10). Override rate >20% in soak → demote. **v3 F1**: demotion now requires evidence of ENGAGEMENT (≥1 CONFIRM) not just absence of complaint — protects against silent disengagement masking false positives.

**R2 — Meeting file frontmatter corruption via concurrent writers**: meeting-file lockfile via `MeetingService.writeWithLock` (REQUIRED, Step 2). mtime guard inside lock for editor race (AC4). Atomic tmp+rename. eng C2 closed the gap fully. **v3 F2**: partial-merge mutator contract closes the SEMANTIC race (mutator can't accidentally clobber fields it doesn't own) at the type-system level.

**R3 — Apply cleanup interaction with pending items (NEW v3, F5)**: the v2 wholesale `delete data['staged_item_*']` at `staged-items.ts:575-579` clobbered sibling fields for all items, including pending ones (chef-proposed or bare-extract). v3 Step 4a fixes this — cleanup filters by `approvedIds`. Pending items keep their frontmatter for re-review next round. Validated by AC11 + 3 new test cases. **If F5 fix regresses**: rollback trigger is "user `[[unskip]]`'s an item AND the item disappears from frontmatter post-apply" — emergency hotfix needed.

**R4 — Lockfile acquire failure**: if `proper-lockfile` cannot acquire (disk full, stale-lock loop, etc.), helper returns `{ written: false, abstainReason: 'lock-acquire-failed' }` and logs ABSTAIN. NEVER silent corruption. Chef SKILL.md surfaces "would have skipped ai_0042 — lock failure; handle manually."

**R5 — Re-extract clobbers chef mutations silently**: covered in AC5 + Step 5 + §"Re-extract preservation" — preserved BY DEFAULT via F2 partial-merge contract; `--force-clear-skips` escape hatch (explicit `{skip_reason: undefined}`); orphan handling drops + warns. **v3 simplification**: no more "merge semantics prose" risk — the contract IS the merge semantics.

**R6 — `'skipped'` value overload (multiple producers)**: `'skipped'` is set by multiple producers today AND post-followup-2. **Existing producers**: extract pipeline writes `'skipped'` at `meeting-processing.ts:{416, 439, 476, 518, 557}` in various extract-time scenarios (existing-task match path, reconciler silent-merge, etc.). Consumer (`commitApprovedItems` filter) is shape-agnostic — only cares that status !== 'approved'. Followup-2 adds chef as a new producer at apply-prep time (winddown). Provenance distinguished via `staged_item_skip_reason.setBy ∈ {'chef', 'chef-proposed', 'user'}` (M2 table in §Architecture). Extract-time writes do NOT populate `staged_item_skip_reason` — so a `'skipped'` status with NO corresponding `skip_reason` entry is implicitly extract-time provenance. Document overload + producer set in `models/integrations.ts` JSDoc (eng MC1).

**R7 — `[[confirm-skip]]` accumulation + zero-engagement disengagement (v3 F1 expansion of v2 R6)**: user ignores `[[confirm-skip]]` directives across multiple winddowns → pending-confirm backlog. Mitigation: chef-proposed status leaves `staged_item_status = 'pending'` so item stages normally on apply (failure mode is "chef's signal was ignored, item committed anyway as if no skip" — same as today's CT2). No silent demotion of un-confirmed proposals; user keeps full control. **v3 F1 stronger mitigation**: demotion criterion now requires ≥1 explicit CONFIRM; zero-CONFIRM-zero-UNSKIP at +7d does NOT auto-demote — surfaces nudge instead. After 30d of accumulated chef-proposed entries → soak observability surfaces in daily metric (PROPOSE - CONFIRM - UNSKIP count); decision deferred to soak findings.

---

## Open questions (with leans)

**Q1 — Chef writes skip on weak/fuzzy evidence?** Lean NO. Chef only structurally enforces on existing "concrete match" tier; precision over recall.

**Q2 — `evidence` field shape — structured URL vs free-form string?** Lean free-form string v1. Phase 11 may tighten to discriminated union once Gmail Sent is primary source.

**Q3 — mtime guard 60s hardcoded vs configurable?** Lean 60s hardcoded for v1. Revisit if soak shows frequent abstains.

**Q4 — `[[unskip <id>]]` ambiguity precedence rule?** Lean STRICT NO-OP + "please qualify" (per AC6). Never silently pick a meeting; user must disambiguate via slug-qualified form.

**Q5 — Should chef-proposed week-1 entries auto-expire if not confirmed within N days?** Lean NO — chef-proposed lapses naturally because `staged_item_status = 'pending'` stages normally on apply; F5 fix preserves the skip_reason so chef can re-propose. No timeout machinery needed. Re-evaluate if soak shows backlog.

**Q6 (NEW v3) — Should F5 cleanup-by-approvedIds be backported to other sibling-field cleanups in the codebase (e.g., `meeting-processing.ts`)?** Lean NO for this followup — scope is `commitApprovedItems` only. The wholesale-delete pattern at `meeting-processing.ts:{416, 439, 476, 518, 557}` is extract-time, not apply-time; it's allowed to wholesale-rewrite extract-owned fields. F5 is specifically about apply NOT clobbering chef-owned fields.

---

## Soak observability + rollback

**Daily during 14-day soak (manual)**:

1. **Skip rate** — `grep '"action":"SKIP"' chef-skip-log.md | wc -l` daily. Triggers: 0 SKIPs for 5+ days = wiring not reaching helper; >5/day in week 1 = chef finding real skips.
2. **Propose rate** (week-1) — `grep '"action":"PROPOSE"' chef-skip-log.md | wc -l`. Compare to CONFIRM count: if PROPOSE - CONFIRM > 5/week, user is ignoring the directive (R7 surfacing).
3. **Confirm rate (NEW v3, F1)** — `grep '"action":"CONFIRM"' chef-skip-log.md | wc -l`. Demotion criterion: at +7d, MUST be ≥1 for chef to demote to direct write. Zero CONFIRM + zero UNSKIP at +7d = stay in week-1, surface nudge.
4. **Override rate** — `grep '"action":"UNSKIP"' chef-skip-log.md | wc -l` weekly. Trigger: >20% of total SKIPs = R1 materializing; pause via feature flag. Demotion criterion (v3): zero UNSKIP AND ≥1 CONFIRM at +7d window → automatic demotion from chef-proposed to direct chef-skip (AC8).
5. **Abstain rate** — `grep '"action":"ABSTAIN"' chef-skip-log.md | wc -l` daily. Trigger: >50% = mtime guard too aggressive OR concurrent CLI traffic spike.
6. **Apply-side audit** — `jq -r 'select(.action == "APPLY-SKIP") | .id' chef-skip-log.md | sort -u` — each chef-skipped meeting MUST have a corresponding APPLY-SKIP entry. Mismatch = apply didn't honor; investigate.
7. **F5 sanity check (NEW v3)** — after first `[[unskip]]` event, spot-check the meeting file. Confirm the unsked item is still in `staged_item_status` as pending post-apply. If cleared, F5 fix regressed — emergency hotfix.
8. **Frontmatter corruption check** — `git diff resources/meetings/*.md` daily — confirm `staged_item_skip_reason` writes look well-formed and partial-merge contract holds (no surprise key deletions).

**Rollback triggers (priority order)**:
- **F5 regression** (unsked item disappears from frontmatter after apply): emergency hotfix on Step 4a cleanup filter. No feature flag — this is a data-loss bug.
- **R3/F2 materializes** (re-extract drops `skip_reason` despite partial-merge contract): investigate which mutator is explicitly returning `undefined`; tighten contract.
- **R1 materializes** (>20% override rate or irrecoverable wrong skip): flip `PHASE_10_FOLLOWUP_2_CHEF_SKIP_ENABLED=false`. Chef reverts to prose-only. Existing entries remain (audit preserved); apply still honors `'skipped'` (existing flat string).
- **R2 materializes** (frontmatter corruption from concurrent writers): restore from git; flip feature flag; investigate lockfile.
- **F1 zero-engagement** (zero CONFIRM at +7d): non-emergency — stays in week-1 mode, surfaces nudge. No rollback; the design self-corrects.

**Soak-success criteria (+14d)**:
- ≥2 chef-skips/week with override rate <20% → wiring + precision both hold.
- Zero frontmatter corruption events.
- Audit log readable, parseable, bounded (<200 lines after 14d).
- ≥1 `[[confirm-skip]]` (week-1 engagement) AND ≥1 `[[unskip]]` (override path) used — validates AC6 + AC8 recovery paths.
- **Demotion fires automatically at +7d on the stricter v3 criterion** (≥1 CONFIRM AND zero UNSKIP); OR demotion deferred with nudge surfaced (also a pass — system self-corrects).
- **Zero F5 regressions**: no unsked item lost to apply cleanup; AC11 holds in production.
- **F2 contract holds**: zero observed `skip_reason` losses after re-extract.

---

## References

- **Phase 11 v1 plan** (source — Goal 2 / 11b is this followup): `dev/work/plans/arete-v2-chef-orchestrator/phase-11-external-resolution-unified-approval/plan.md`
- **Phase 11 PM review** (split-out + first-week-confirm precedent): `dev/work/plans/arete-v2-chef-orchestrator/phase-11-external-resolution-unified-approval/review-pm.md`
- **Phase 11 eng-lead review** (C3 sibling-field): `dev/work/plans/arete-v2-chef-orchestrator/phase-11-external-resolution-unified-approval/review-eng.md`
- **Followup-2 PM review v1** (drove v2 PM C1 / C2 / C3 / C4): `dev/work/plans/arete-v2-chef-orchestrator/phase-10-followup-2-chef-mutates-staged-status/review-pm.md`
- **Followup-2 eng review v1** (drove v2 eng C1 / C2 / C3 + audit log format): `dev/work/plans/arete-v2-chef-orchestrator/phase-10-followup-2-chef-mutates-staged-status/review-eng.md`
- **Followup-2 pre-mortem v2** (drove v3 F1 / F2 / F5 + M1-M4): `dev/work/plans/arete-v2-chef-orchestrator/phase-10-followup-2-chef-mutates-staged-status/pre-mortem.md`
- **2026-06-04 CT2 catch**: `/Users/john/code/arete-reserv/now/archive/daily-winddown/winddown-2026-06-04.md:13-15`
- **Current `StagedItemStatus` type**: `packages/core/src/models/integrations.ts:14`
- **Sibling-field parser pattern** (template): `packages/core/src/integrations/staged-items.ts:204-247` (`parseStagedItemOwner`); `:483` (confidence read pattern)
- **`writeItemStatusToFile`** (existing single-item writer): `packages/core/src/integrations/staged-items.ts:266-292`
- **`commitApprovedItems`** (apply path): `packages/core/src/integrations/staged-items.ts:463-487` (filter line 487 unchanged); **cleanup at 575-579 — F5 bug site, Step 4a fixes**
- **Meeting extract sibling-field write** (clobber risk, F2 site): `packages/cli/src/commands/meeting.ts:1103-1108`
- **Phase 9 invocation-log pattern** (audit log format target): `packages/cli/src/commands/intelligence.ts:837-851` (`${ISO} ${mode} ${JSON.stringify(input)}\n`)
- **Phase 10 `proper-lockfile` + `CommitmentsService.withLock`** (commitments-only; meeting-file lockfile is net-new here): `packages/core/src/services/commitments.ts:14, 653`
- **Existing `'skipped'` producers** (R6/M2): `packages/core/src/services/meeting-processing.ts:{416, 439, 476, 518, 557, 607}`
- **Chef winddown SKILL.md** (Rule 1 / Rule 4 prose origin): `packages/runtime/skills/daily-winddown/SKILL.md:602-651`
