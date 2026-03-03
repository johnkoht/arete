# Leverage Intelligence — Commitments Service

## Problem

Action item extraction from meeting transcripts is regex-based and produces garbage results — raw transcript text gets captured as "commitments" when it's just someone explaining how something works. There's also no way to query commitments cross-person, resolve them, or reconcile them against external task managers.

## Key Decisions

- **Naming**: "Commitments" (preferred over "action items" or "open items")
- **Extraction**: Replace regex with LLM-based extraction (same DI pattern as stances)
- **Storage**: `commitments.json` is the source of truth; person markdown files are a rendered projection
- **Person files keep commitments visible**: Rendered as `- [ ]` checkboxes so editor-only users see them when browsing person files
- **Bidirectional sync**: User can check `- [x]` or delete a line in markdown → resolved on next refresh
- **Resolved items**: Pruned from `commitments.json` after 30 days
- **Historical re-extraction**: Running `arete people memory refresh` naturally re-extracts with new LLM prompt — no special command needed
- **Reconciliation service**: `CommitmentsService.reconcile()` accepts completed items from any source (Notion, Linear, manual) and fuzzy-matches against open commitments. Integration-agnostic.
- **Not opinionated**: Areté surfaces and tracks commitments. How they become tasks, where tasks live, how they get completed — not our concern.

## Plan

### Part 1: Fix Extraction Quality (3 steps)

1. **LLM-based commitment extraction** — Replace regex `extractActionItemsForPerson()` with LLM-based extraction following the `extractStancesForPerson()` DI pattern. Prompt must distinguish genuine commitments (promises, action items, deliverables) from descriptions/explanations/general discussion. Return clean, normalized descriptions with direction classification.
   - AC: Given the Dave transcript, extracts ≤3 genuine items (share slides, Jira walkthrough, organize offsite), rejects all transcript excerpts. Each item has a concise deliverable description.

2. **Update person memory refresh pipeline** — Wire LLM extraction into `refreshPersonMemory` in entity.ts, using the stance cache pattern (cache by meeting+person). Keep lifecycle functions (stale, dedup, cap) unchanged.
   - AC: `arete people memory refresh` uses LLM extraction for action items. Cached per meeting+person. Existing lifecycle works as before.

3. **Update tests** — Update person-signals tests for async LLM-based extraction with mock `callLLM`. Keep lifecycle function tests unchanged.
   - AC: All tests pass. New coverage for: prompt construction, response parsing, malformed JSON, direction classification, empty content edge cases.

### Part 2: Commitments Service, CLI & Skill Updates (5 steps)

4. **Commitments data model & storage** — Store in `.arete/commitments.json`. Schema: `{ commitments: [{ id, text, direction, personSlug, personName, source, date, status: 'open'|'resolved', resolvedDate? }] }`. Resolved items pruned after 30 days on write.
   - AC: Schema defined in models. StorageAdapter for I/O. Auto-prune removes resolved items >30 days old.

5. **CommitmentsService** — Core service (StorageAdapter for persistence):
   - `listOpen(direction?)` — all open, optionally filtered by direction
   - `listForPerson(personSlug)` — open commitments for a person
   - `resolve(id)` / `bulkResolve(ids[])` — mark resolved with date
   - `sync(freshItems: Map<string, PersonActionItem[]>)` — merge extraction results, preserve resolved state
   - `reconcile(completedItems: { text: string, source: string }[])` — fuzzy-match completed items against open commitments, return `{ commitment, completedItem, confidence }[]` for user confirmation
   - AC: Fully tested. Sync preserves resolved state. Reconcile returns confidence scores, no auto-resolve.

6. **Person memory renders commitments as checkboxes with bidirectional sync** — Update `renderPersonMemorySection()` to render commitments as `- [ ]` task items from CommitmentsService. During refresh, **before re-rendering**, read the current person file's commitments section to detect user edits:
   - `- [x]` items → resolve in CommitmentsService
   - Items present in CommitmentsService but missing from markdown → resolve in CommitmentsService (user deleted them)
   - Then re-render from updated CommitmentsService state
   - AC: Person file shows `- [ ] Share Monday meeting slides (2026-02-26)`. User checking the box or deleting the line resolves the commitment on next refresh. New commitments from extraction appear as unchecked items.

7. **CLI exposure** — `arete commitments list [--direction i_owe_them|they_owe_me] [--person <slug>]`, `arete commitments resolve <id>`.
   - AC: `list` groups by direction with person names. `resolve` confirms the action.

8. **Update planning skills** — Update `daily-plan`, `meeting-prep`, `week-plan`, `week-review` SKILL.md files:
   - **daily-plan**: "Commitments" section uses `arete commitments list` filtered by today's meeting attendees
   - **meeting-prep**: Uses `arete commitments list --person <slug>` for each attendee
   - **week-plan**: Surfaces all open commitments; user picks which become this week's tasks
   - **week-review**: Explicit commitment resolution step — present open commitments, user marks done/carried/dropped
   - **PATTERNS.md**: Update `get_meeting_context` pattern to reference commitments service
   - AC: Each skill references `arete commitments` commands. Week-review has resolution workflow.

## Size

Large (8 steps, 2 phases). Each phase independently shippable.

## What We're NOT Doing

- Task manager integrations (Notion databases, Linear) — reconciliation service is ready when those arrive
- Auto-resolution without user action — always requires check/delete/CLI/skill
- Reminder/notification system
- `arete commitments reconcile` CLI command (future — needs integration to feed it; the service method exists for when it's needed)

## Risks

- **Step 1 (LLM prompt quality)**: If the prompt can't reliably distinguish commitments from descriptions, everything downstream shows garbage. Mitigation: test prompt against 3-4 real transcripts before wiring up.
- **Step 6 (bidirectional sync edge cases)**: What if user edits text? What if refresh runs mid-edit? Mitigation: sync logic is conservative — only resolves, never creates from markdown edits. Match by hash, not text comparison.

## Next Steps

- `/pre-mortem` for risk analysis
- `/prd` for autonomous execution
