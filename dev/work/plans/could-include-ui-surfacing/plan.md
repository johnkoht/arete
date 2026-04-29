---
title: Could-include UI surfacing
slug: could-include-ui-surfacing
status: idea
size: medium
tags: [web, backend, core, meeting-extraction, review-ui, follow-up]
created: 2026-04-29
updated: 2026-04-29
---

# Could-include UI surfacing

## Goal

Make the prioritized `could_include` headlines that meeting extraction now emits reachable through the existing approve/skip review flow on the web. Today they sit in the meeting markdown under `## Could include` but the review page neither lists them nor lets the user act on them. Surface them as a fourth, collapsed-by-default section of pre-skipped suggestions; let the user promote any item to a real memory entry (decision/learning/action), or leave it skipped. Backward-compat: meetings that pre-date wiki-leaning extraction simply render no fourth section.

Filed as a follow-up against the wiki-leaning extraction PR (`worktree-wiki-leaning-extraction`, base `main`) and intended to land shortly after that PR merges.

## The gap today

- Extraction emits `MeetingIntelligence.core?: string` and `MeetingIntelligence.could_include?: string[]` (`packages/core/src/services/meeting-extraction.ts:62-87`, fields added in commit `ec701c03`).
- `formatStagedSections` writes both to the meeting file (`## Core` and `## Could include` blocks; same file, around lines 1620-1687 in the upstream branch — note that line numbers shifted across commits `b5721ce6`..`e014cb59`, so `grep -n` rather than trusting these numbers verbatim).
- A/B run on 5 historical meetings produced 34 `could_include` items (see `dev/work/plans/wiki-leaning-meeting-extraction/ab-results.md`). Examples: `"Authority limits: restructured to adjuster-exposure level..."`, `"Team restructuring: Jordan plans line-of-business teams... blocked by inaccurate program DB tags"`. Real signal, currently invisible to the review UI.
- `processMeetingExtraction` (`packages/core/src/services/meeting-processing.ts:380-578`) only iterates `intelligence.actionItems / decisions / learnings`. There is no `ci_NNN` ID generation path, no entry in `stagedItemStatus`, no `StagedSections.couldInclude` field.
- `parseStagedSections` (`packages/core/src/integrations/staged-items.ts:127-186`) registers only `ai`/`de`/`le` headers and `(?:ai|de|le)_\d+` IDs; `## Could include` is silently ignored.
- `commitApprovedItems` (`packages/core/src/integrations/staged-items.ts:424-537`) buckets approved items into action/decision/learning only — there is no path for "approved could_include item becomes X".
- Web: `grep -rn "could_include\|## Core" packages/apps/web/src/` returns zero hits. `ReviewItems.tsx` (`packages/apps/web/src/components/ReviewItems.tsx:283-287`) hardcodes a 3-group list (`Action Items`, `Decisions`, `Learnings`); `ReviewItem.type` is `'action' | 'decision' | 'learning'` (`packages/apps/web/src/api/types.ts:400`).
- Wire format: `RawStagedSections` (`packages/apps/web/src/api/meetings.ts:53-57`) only carries the three known buckets; `flattenStagedItems` (same file, 116-134) flattens those three.

So the work is end-to-end: extend the staged-items shape in core, plumb it through the backend response and PATCH/approve routes, and render it in the web review page.

## Decisions log

1. **Default status is `'skipped'`.** User explicitly chose this over a new status enum value: "marking as skipped makes sense. I can always update this later if it's not the right approach." Promoting to `'approved'` commits to memory; setting back to `'pending'` parks for review-before-meeting-close. No new `ItemStatus` value introduced; `'pending' | 'approved' | 'skipped'` stays the canonical set (`packages/core/src/services/meeting-processing.ts:28`).
2. **New ID prefix `ci_NNN`.** Matches existing `ai_/de_/le_` convention. Adds a fourth literal to `StagedItem['type']` (`packages/core/src/models/integrations.ts:36`) and to `PREFIX_MAP` / `SECTION_HEADERS` in `staged-items.ts`.
3. **`could_include` items are read-only text in v1.** No goal picker, no owner notation, no edit affordance. The promote action handles all transformation. Keeps the v1 surface minimal.
4. **Section is collapsed by default in the UI.** Could-include items are auto-skipped by default — they shouldn't compete for attention with pending action items. Persist collapse state in `arete-review-collapsed` localStorage key alongside the existing three groups (`ReviewItems.tsx:216-245`).
5. **Promote-to-type flow: open question — see Thread B.** Three candidate approaches; recommendation is approach (B), but flagged for user input before implementation.

## Implementation

### Thread A — Backend / data model: emit `ci_NNN` staged items

**File: `packages/core/src/models/integrations.ts`**

- Line 36: extend `StagedItem['type']` to `'ai' | 'de' | 'le' | 'ci'`.
- Line 52-56: extend `StagedSections` with `couldInclude: StagedItem[]`.

**File: `packages/core/src/integrations/staged-items.ts`**

- Lines 57-61, `PREFIX_MAP`: add `ci: 'ci'`.
- Lines 77-81, `SECTION_HEADERS`: add `'could include': 'ci'` (lowercase match — header in file is `## Could include`).
- Lines 83, `ITEM_PATTERN`: extend to `/^-\s+((?:ai|de|le|ci)_\d+):\s+(.+)$/`.
- Lines 127-186, `parseStagedSections`: thread through a `couldInclude: StagedItem[]` collector parallel to the existing three.
- Lines 424-537, `commitApprovedItems`: add a fourth bucket `approvedCouldInclude` and route it per Thread B's outcome. **Do not** silently drop approved `ci_*` items (current behavior would, since `parseStagedSections` doesn't return them).

**File: `packages/core/src/services/meeting-extraction.ts`**

- `formatStagedSections` (around line 1624): currently writes `## Could include` as a bullet list with no IDs. Change to write `- ci_NNN: <headline>` so that `parseStagedSections` can round-trip them. Preserve the headline format (`"Category: short body"` per the upstream plan's Decision #3) intact in the bullet text.
- Bump `STAGED_HEADERS` set (line 1693): `'Could include'` is already there as anchor for `updateMeetingContent` — no change needed, just confirm.

**File: `packages/core/src/services/meeting-processing.ts`**

- Lines 380-578, `processMeetingExtraction`: after the `learnings` loop, add a `couldInclude` loop:
  - For each `intelligence.could_include?.[]` entry, generate `ci_NNN`, push a `FilteredItem` with `type: 'could_include'` (extends the union), and set `stagedItemStatus[id] = 'skipped'`. No confidence filtering, no dedup pass — these are LLM-prioritized headlines, not extracted items. Source defaults to `'ai'`.
  - **Open: do we filter `could_include` against `userNotes` / `priorItems` for dedup?** Recommendation: **no** in v1. They're already curated by the LLM as "side threads worth knowing about"; the dedup machinery is tuned for action/decision/learning text shapes (Jaccard against full-sentence task text), not `"Category: ..."` headline shapes. Revisit if A/B reveals overlap.
- Lines 38-45, `FilteredItem`: extend `type` union to `'action' | 'decision' | 'learning' | 'could_include'`.

**File: `packages/apps/backend/src/routes/meetings.ts`**

- Lines 180-205, PATCH `/:slug/items/:id`: no signature change. The route already takes an `id` and a `status`; the underlying `writeItemStatusToFile` writes whatever `id`+`status` it gets. Confirm by reading: it doesn't validate the prefix. So promote/dismiss on a `ci_NNN` id "just works" through this endpoint.
- Lines 209-268, POST `/:slug/approve`: depends on Thread B. If Thread B chooses approach (B) — promote-time type prompt — the route stays the same and the type choice is committed before approve via PATCH. If approach (C) — generic "could-include" memory bucket — `commitApprovedItems` needs to know how to write that bucket.

### Thread B — Promote-to-type flow (OPEN QUESTION)

When the user clicks "approve" on a `ci_NNN` item, what does that approved item become in the workspace? The headline format `"Risks: Sara flagged churn assumption"` carries a category prefix but is not a structured item.

Three candidate approaches:

**(A) Auto-classify by category prefix.** Map `Risks:` / `Pricing:` / `Team:` / etc. to learning vs. decision via a small lookup table. `Risks:` → learning. `Decision:` → decision. `Action:` → action item (but no owner — degenerate). Anything else → learning by default.
- Pro: zero clicks, no UI work.
- Con: silent miscategorization. Categories are LLM-freeform — `"Authority limits: ..."` doesn't fit a fixed table. Brittle.

**(B) Ask at promote time.** Clicking the approve button on a `ci_NNN` opens a small inline picker: "Save as: Decision / Learning / Action item / Cancel". Selection PATCHes the item: status=`approved` plus a new `promotedType: 'decision' | 'learning' | 'action'` field. `commitApprovedItems` reads `promotedType` and routes the item into the matching bucket; the `"Category: "` prefix is stripped from the body before write.
- Pro: user-controlled, no silent miscategorization, single extra click.
- Con: requires UI affordance + small backend extension (new `staged_item_promoted_type` frontmatter map, parallel to `staged_item_edits`).
- **Recommended.** Lowest-risk and matches how the user already thinks about the item ("commit this thread to memory as X").

**(C) Introduce a generic "highlights" memory bucket.** Approved `ci_*` items get appended to a new `.arete/memory/items/highlights.md` (or similar). They never become decisions/learnings/actions; they're a separate category.
- Pro: no classification needed; preserves the headline shape natively.
- Con: introduces a new memory-file type, new search/recall surfaces, new patterns/dedup considerations downstream. Premature for a follow-up plan; bigger surface area than the user-explicit signal warrants.

**Question for user**: confirm (B) vs. revisit. Implementation below assumes (B).

If (B) is chosen, additions on top of Thread A:

- **Frontmatter:** new `staged_item_promoted_type: Record<string, 'decision' | 'learning' | 'action'>` map written by the PATCH route when the user picks a type. Persisted alongside `staged_item_status` / `staged_item_edits`.
- **`commitApprovedItems`** (`staged-items.ts:424-537`): for each approved `ci_*` item, look up `promotedType`, strip the `"Category: "` prefix from the body (one regex: `/^[^:]+:\s*/`), and route to `approvedDecisions` / `approvedLearnings` / `approvedActionItems`. Keep the original headline in a comment-style suffix on the memory entry (`(promoted from could-include)`) so reviewers can trace provenance.
- **PATCH route** (`backend/src/routes/meetings.ts:180-205`): accept optional `promotedType` in the body; pass through to `updateItemStatus`. Extend `WriteItemStatusOptions` with `promotedType?`.

### Thread C — Web UI: 4th section in `ReviewItems.tsx`

**File: `packages/apps/web/src/api/types.ts`**

- Line 400: extend `ItemType` to `'action' | 'decision' | 'learning' | 'could_include'`.
- Line 411-430, `ReviewItem`: add optional `promotedType?: 'decision' | 'learning' | 'action'` for could_include items.
- `RawStagedItem.type` (`packages/apps/web/src/api/meetings.ts:44`): add `'ci'`. Extend `TYPE_MAP` (line 114) with `ci: 'could_include'`.
- `RawStagedSections` (line 53-57): add `couldInclude: RawStagedItem[]`. `flattenStagedItems` (116-134) include it.

**File: `packages/apps/web/src/components/ReviewItems.tsx`**

- Lines 9-13, `TYPE_LABELS`: add `could_include: "Could Include"`.
- Lines 247-250, filter: add `const couldInclude = items.filter((i) => i.type === "could_include")`.
- Lines 283-287, `groups`: add fourth entry. Pick an icon (lucide `Sparkles` or `BookmarkPlus` — visually distinct from the three existing icons). Pass a flag like `defaultCollapsed: true` to drive the initial open state.
- Lines 226-245, `getInitialOpenGroups`: default `"Could Include"` to **false** (collapsed). Persist as before.
- `ItemCard` (lines 53-214): for `item.type === "could_include"`:
  - Render the headline as-is (no edit affordance, per Decision #3).
  - Replace the "approve" tooltip text with "Promote to..." and on click open a small inline menu (Decision/Learning/Action). Use the existing `DropdownMenu` primitive. On selection, call `onStatusChange(id, 'approved')` AND a new `onPromoteTypeChange(id, type)` handler that PATCHes `promotedType` server-side.
  - "Skip" button stays unchanged — clicking once unsets back to `pending` from the default `skipped`, click again to re-skip. (Same toggle semantics as today's items.)
- Visual treatment: since these default to skipped, they render with the existing `opacity-50` + `line-through` styling (line 71-73 + 152). Still readable; clearly de-emphasized. **Watch:** combined `opacity-50` + collapsed-by-default may render the section nearly invisible — verify on a real meeting before merge; if it's too quiet, drop the opacity treatment for `ci_*` items only and rely on the section header alone for de-emphasis.

**File: `packages/apps/web/src/components/ReviewItems.test.tsx`**

- Add tests: 4th section renders when `could_include` items present; section absent when empty (backward-compat); items default to skipped status visually; promote menu PATCHes both status and type.

### Backward compatibility

- Existing meetings have no `## Could include` block → `parseStagedSections` returns `couldInclude: []` → `flattenStagedItems` produces zero `could_include` `ReviewItem`s → 4th section renders empty and is filtered out by the existing `group.items.length > 0` check (line 358 in `ReviewItems.tsx`). No migration needed.
- Frontmatter from old meetings has no `staged_item_promoted_type` map; absent map is treated the same as empty.

## Tests

- `packages/core/test/integrations/staged-items.test.ts` — `parseStagedSections` round-trips a `## Could include` block with `ci_NNN` ids; `commitApprovedItems` routes a promoted-to-decision `ci_*` correctly and strips the category prefix.
- `packages/core/test/services/meeting-processing.test.ts` — `processMeetingExtraction` emits `ci_NNN` ids with default status `'skipped'`; `intelligence.could_include` absent leaves staged maps unchanged.
- `packages/core/test/services/meeting-extraction.test.ts` — `formatStagedSections` writes `ci_NNN` prefixes (round-trip test against the new `parseStagedSections`).
- `packages/apps/backend/test/routes/meetings.test.ts` — PATCH accepts and persists `promotedType`; approve commits a promoted item to the right memory file.
- `packages/apps/web/src/components/ReviewItems.test.tsx` — 4th section presence/absence, default collapsed, promote menu PATCH wiring.

## Risks

1. **Promote-flow design churn.** Thread B is the load-bearing decision; if (B) doesn't survive contact with real use ("clicking a menu every time is too much friction"), we may need to fall back on (A) auto-classify or escalate to (C) highlights bucket. Mitigation: ship (B) behind a feature flag if friction is a concern; otherwise commit and revisit after a week of real use.
2. **`ci_*` items not surviving subsequent re-extraction.** If a meeting is re-processed (via `processMeeting` from the UI), the freshly-emitted `## Could include` overwrites the previous `ci_*` ids. Any user actions (promotions, re-skips) on the prior IDs are silently lost because IDs aren't stable across re-extraction. Same risk exists today for `ai_/de_/le_` items but is more acute here because `ci_*` items default to skipped — a user who promoted three of them, then re-processes, loses all three. Mitigation: warn on re-process if `staged_item_status` has any non-default `ci_*` entries, or text-match promoted items across re-extraction (out of scope for v1; flag in PR description).
3. **Section visual de-emphasis is too quiet.** Collapsed by default + `opacity-50` + `line-through` might mean users never discover the section. Mitigation: render the unread `could_include` count in the section header (the existing `<span>` count badge already shows this); A/B against a default-expanded variant if engagement is low after a week.
4. **`commitApprovedItems` prefix-stripping over-zealous.** The regex `/^[^:]+:\s*/` strips the category. But what if the body itself contains a colon (`"Risks: Sara flagged churn — cite: deck slide 4"`)? The simple regex is non-greedy on the first colon, so it strips only `"Risks: "` correctly. Verify with a fixture test.
5. **Wire-format drift from `@arete/core`.** `ItemSource` and `StagedItem.type` are duplicated between `packages/core/src/models/integrations.ts` and `packages/apps/web/src/api/types.ts` (call-out at types.ts:317-321). Adding `'ci'` requires updating both; the existing compat test (`packages/apps/backend/test/services/item-source-compat.test.ts`) should be extended with `StagedItem['type']` parity.

## Out of scope

- **Editing `could_include` headlines** in the UI. v1 keeps them read-only; promote action handles all transformation. Revisit if users frequently want to fix a headline before promoting.
- **Dedup of `could_include` against existing memory.** Treated as already-curated by the LLM. If overlap shows up in real use, add a Jaccard pass mirroring the existing `userNotes`/`priorItems` plumbing.
- **A separate `highlights.md` memory file** (Thread B approach C). Bigger surface area than this follow-up; revisit if approach (B) feels wrong.
- **Surfacing `core` text in the UI.** That's a separate, larger UX question (current summary rendering already covers the lead-prose slot via `Meeting.summary`; whether to show `core` distinctly is a Phase-C-style design call, not a follow-up to this PR).
- **Automatic re-promotion of previously-promoted items across re-extraction.** Listed in Risks #2 but not fixed here; flag in PR description so users know to avoid re-process after promoting.

## Critical files

- `packages/core/src/integrations/staged-items.ts`
- `packages/core/src/services/meeting-processing.ts`
- `packages/core/src/services/meeting-extraction.ts`
- `packages/core/src/models/integrations.ts`
- `packages/apps/web/src/components/ReviewItems.tsx`
- `packages/apps/web/src/components/ReviewItems.test.tsx`
- `packages/apps/web/src/api/meetings.ts`
- `packages/apps/web/src/api/types.ts`
- `packages/apps/backend/src/routes/meetings.ts`
- `packages/apps/backend/test/routes/meetings.test.ts`
