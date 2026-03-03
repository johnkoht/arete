---
title: Leverage Intelligence
slug: leverage-intelligence
status: building
size: large
tags: [intelligence, commitments, extraction, planning-skills]
created: 2026-03-03T04:10:58.396Z
updated: 2026-03-03T23:10:27.412Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 8
---

# Leverage Intelligence — Commitments Service

## Problem

Action item extraction from meeting transcripts is regex-based and produces low-quality results. Raw transcript text gets captured as "commitments" when it's just someone explaining how something works. Example: a walkthrough meeting with Dave generated 10+ "they owe me" items, most of which were just him describing his company's architecture — not actual commitments.

Additionally, there's no cross-person way to query "what do I owe people?" or "what do people owe me?", no way to resolve commitments as done, and no reconciliation against external task managers.

## Success Criteria

1. LLM-extracted commitments are genuine (promises, deliverables, action items) — not transcript noise
2. Commitments are queryable cross-person via CLI and service
3. Commitments can be resolved via CLI, markdown checkbox, or deletion
4. Planning skills (daily-plan, meeting-prep, week-plan, week-review) surface and close commitments naturally
5. Person markdown files render commitments as `- [ ]` checkboxes — visible to editor-only users

## Architecture

- **CommitmentsService** owns the data (`commitments.json`) — single source of truth
- **Person memory sections** are a rendered projection (read-only view from CommitmentsService)
- **Bidirectional sync**: user edits in markdown (check/delete) are detected on refresh and synced back to CommitmentsService
- **Producer path**: `arete people memory refresh` (Step 2) is the primary producer — LLM extraction feeds CommitmentsService via `sync()`. `process-meetings` skill (Step 8) also writes to CommitmentsService when it extracts action items.

## Dependencies

- Part 2 depends on Part 1 (needs LLM extraction to feed quality data)
- Step 8 depends on steps 5-7 (skills reference CLI commands and service)
- Within each part, steps are sequential
- Step 5 factory.ts wiring is a prerequisite for Step 7 (CLI) and Step 8 (skills)

---

## Plan

### Part 1: Fix Extraction Quality

#### Step 1. LLM-based commitment extraction

Replace regex `extractActionItemsForPerson()` in `person-signals.ts` with LLM-based extraction following the `extractStancesForPerson()` DI pattern. Create `buildActionItemPrompt()` and `parseActionItemResponse()`.

The prompt must:
- Distinguish genuine commitments (promises, action items, deliverables) from descriptions, explanations, and general discussion
- Classify direction: `i_owe_them` vs `they_owe_me`
- Return clean, normalized descriptions (not raw transcript text)
- Identify the specific deliverable (e.g., "Share Monday meeting slides" not the whole sentence)

**Files touched**: `packages/core/src/services/person-signals.ts`

**AC**:
- Given the Dave transcript example, extracts ≤3 genuine items (share slides, Jira walkthrough, organize offsite) and rejects all transcript excerpts
- Each item has a concise deliverable description
- Function signature adds `callLLM` parameter (becomes async)
- **When `callLLM` is not provided: fall back to the existing regex implementation to preserve current behavior. No silent zero-result regression.**
- Existing types (`PersonActionItem`, `ActionItemDirection`) unchanged
- Lifecycle functions (hash, stale, cap, dedup) unchanged

#### Step 2. Update person memory refresh pipeline

Wire LLM extraction into `refreshPersonMemory` in `entity.ts`, using the stance cache pattern (cache by meeting+person key to avoid redundant LLM calls).

**Files touched**: `packages/core/src/services/entity.ts`

**AC**:
- `arete people memory refresh` uses LLM extraction for action items when `callLLM` is provided
- **When `callLLM` is not provided, action item extraction falls back to regex (same as Step 1 — no behavioral regression)**
- Action item extraction cached per meeting+person (same pattern as stance extraction)
- Existing lifecycle (30-day staleness, dedup, cap at 10 per direction) works as before
- `extractActionItemsForPerson` call updated to pass `callLLM` and `await`

#### Step 3. Update tests

Update person-signals tests for async LLM-based extraction with mock `callLLM`. Keep lifecycle function tests (hash, stale, cap, dedup) unchanged.

**Files touched**: `packages/core/test/services/person-signals.test.ts`, `packages/core/test/services/person-memory*.test.ts`

**AC**:
- All existing tests pass or are updated
- New test coverage for: prompt construction, response parsing, malformed JSON handling, direction classification, empty content edge cases
- Mock `callLLM` used throughout (no real LLM calls in tests)
- Test coverage for fallback behavior: when `callLLM` is not provided, regex extraction runs and returns results

---

### Part 2: Commitments Service, CLI & Skill Updates

#### Step 4. Commitments data model & storage

Define the commitments schema and storage format. Store in `.arete/commitments.json`.

Schema:
```json
{
  "commitments": [{
    "id": "sha256-hash-64chars",
    "text": "Share Monday meeting slides",
    "direction": "they_owe_me",
    "personSlug": "dave-wiedenheft",
    "personName": "Dave Wiedenheft",
    "source": "2026-02-26-dave-john-11-technical-architecture-walkthrough.md",
    "date": "2026-02-26",
    "status": "open",
    "resolvedAt": null
  }]
}
```

**Files touched**: `packages/core/src/models/` (new types)

**AC**:
- Types defined: `Commitment`, `CommitmentStatus` (`'open' | 'resolved' | 'dropped'`), `CommitmentsFile`
- `Commitment` type includes `resolvedAt: string | null` (ISO date string, distinct from `date` which is the meeting date)
- StorageAdapter used for I/O (no direct fs)
- **Resolved/dropped items older than 30 days are pruned on write — pruning uses `resolvedAt`, not `date`**
- Note: `date` = when the meeting happened; `resolvedAt` = when the user marked it done. A commitment from 6 months ago resolved yesterday should not be immediately pruned.

#### Step 5. CommitmentsService

Core service with StorageAdapter for persistence. Constructor: `CommitmentsService(storage: StorageAdapter, workspaceRoot: string)` — resolves `.arete/commitments.json` path from `workspaceRoot` internally.

Methods:
- `listOpen(direction?, personSlugs?: string[])` — all open commitments, optionally filtered by direction and/or person slugs (array for multi-person queries)
- `listForPerson(personSlug)` — open commitments for a person
- `resolve(id, status?: 'resolved' | 'dropped')` / `bulkResolve(ids[], status?)` — mark as resolved or dropped with `resolvedAt` timestamp
- `sync(freshItems: Map<string, PersonActionItem[]>)` — merge extraction results with existing, preserve resolved/dropped state (so resolved items don't reappear from re-extraction)
- `reconcile(completedItems: { text: string, source: string }[])` — fuzzy-match completed external items against open commitments using normalized word-overlap Jaccard similarity (threshold ≥ 0.6, no external library), return `{ commitment, completedItem, confidence }[]` for user confirmation

**Files touched**: `packages/core/src/services/commitments.ts` (new), `packages/core/test/services/commitments.test.ts` (new)

**AC**:
- Fully tested with unit tests
- `sync()` preserves resolved/dropped state — re-extracting a resolved commitment does not reopen it
- `reconcile()` uses Jaccard word-overlap similarity (no external library); returns confidence scores; never auto-resolves
- Dedup by hash (same as existing action item dedup)
- **CommitmentsService wired into `factory.ts`: instantiated before EntityService, added to `AreteServices` type, exported from `packages/core/src/services/index.ts`**
- Factory wiring: `const commitments = new CommitmentsService(storage, workspaceRoot);` — included in `AreteServices` as `commitments: CommitmentsService`
- `listOpen()` accepts optional `personSlugs: string[]` to filter by multiple people in one call

#### Step 6. Person memory renders commitments as checkboxes with bidirectional sync

Update `renderPersonMemorySection()` to render commitments from CommitmentsService as `- [ ]` task items. During refresh, **before re-rendering**, read the current person file to detect user edits.

**Hash embedding**: The rendered format embeds the commitment hash as an HTML comment invisible in rendered markdown:
```
- [ ] Send architecture doc to Dave (2026-02-26) <!-- h:3f9a1b2c -->
- [x] Share Monday meeting slides (2026-02-26) <!-- h:abc12345 -->
```
The comment stores the first 8 chars of the commitment hash. The parser reads `<!-- h:XXXXXXXX -->` to recover the hash for CommitmentsService lookup.

**Refresh flow sequence** (must follow this order):
1. Read current person file content
2. Parse existing auto-section: extract all commitment lines with their `<!-- h:XXXXXXXX -->` comments
3. Detect checked (`- [x]`) and deleted lines (in CommitmentsService but not in file)
4. Call `commitments.bulkResolve(detectedHashes)` for all checked + deleted
5. Call `commitments.sync(freshItems)` with newly extracted items
6. Re-render from updated CommitmentsService state
7. Call `upsertPersonMemorySection()` with new content

**CommitmentsService access in EntityService**: CommitmentsService is passed via `RefreshPersonMemoryOptions`:
```ts
interface RefreshPersonMemoryOptions {
  callLLM?: LLMCallFn;
  commitments?: CommitmentsService;  // new
  dryRun?: boolean;
  // ... existing fields
}
```
All CommitmentsService calls are gated: `if (options.commitments) { ... }`. Without it, action items render as plain text (current behavior).

Rendered format:
```markdown
### Open Commitments (I owe them)
- [ ] Send architecture doc to Dave (2026-02-26) <!-- h:3f9a1b2c -->

### Open Commitments (They owe me)
- [ ] Share Monday meeting slides (2026-02-26) <!-- h:abc12345 -->
- [ ] Do Jira walkthrough (2026-02-26) <!-- h:def67890 -->
```

**Files touched**: `packages/core/src/services/person-memory.ts`, `packages/core/src/services/entity.ts` (refresh flow), tests

**AC**:
- Person file shows `- [ ] text (date) <!-- h:XXXXXXXX -->` format (HTML comment invisible in rendered markdown)
- Checking a box (`- [x]`) resolves the commitment on next refresh — detected by `<!-- h:XXXXXXXX -->` comment
- Deleting a line resolves the commitment on next refresh — detected by hash absence
- New commitments from extraction appear as unchecked items with hash comment
- Hash recovery: parser reads `<!-- h:XXXXXXXX -->` tag; full hash matched against CommitmentsService by prefix (8 chars sufficient for uniqueness)
- CommitmentsService access: via `RefreshPersonMemoryOptions.commitments?`; gated with `if (options.commitments)`
- Without `options.commitments`, action items render as plain text (no regression)
- Refresh flow follows the 7-step sequence above (read → detect → bulkResolve → sync → render → upsert)

#### Step 7. CLI exposure

Add `arete commitments` commands:

- `arete commitments list [--direction i_owe_them|they_owe_me] [--person <slug...>]`
- `arete commitments resolve <id> [--yes]`

**Files touched**: `packages/cli/src/commands/commitments.ts` (new), `packages/cli/src/index.ts` (registration: `import { registerCommitmentsCommand } from './commands/commitments.js'` + `registerCommitmentsCommand(program)`)

**AC**:

*`list` command*:
- Groups by direction ("I owe them" / "They owe me") with person names
- **Shows 8-char short ID prefix** (e.g. `3f9a1b2c`) in list output for use with `resolve`
- `--person` is **variadic** (`--person <slug...>`) — accepts one or more slugs; delegates to `commitments.listOpen({ personSlugs: [...] })`
- `--direction` filters by `i_owe_them` or `they_owe_me`
- Calls `findRoot()` — exits with JSON-aware error if not in workspace
- `--json` output: `{ success: true, commitments: [{ id, idShort, direction, personSlug, personName, text, date, resolvedAt }], count: N }`
- Error JSON: `{ success: false, error: "..." }`
- Uses `formatters.ts` helpers for human output (no raw chalk)

*`resolve` command*:
- Accepts **8-char prefix or full 64-char hash** — matches by `id.startsWith(prefix)`; errors if zero or multiple matches with message "No commitment found" or "Ambiguous id — N matches. Use more characters."
- Accepts optional `--status resolved|dropped` (default: `resolved`)
- `--yes` flag skips confirmation (for skill/automation use)
- Without `--yes`: shows commitment text + person + direction, uses `confirm()` from `@inquirer/prompts` with `default: false`
- On success: outputs commitment text, person, direction, resolved timestamp
- **Write command**: calls `loadConfig(services.storage, root)` after `findRoot()`, calls `refreshQmdIndex(root, config.qmd_collection)` before JSON/human return, uses `displayQmdResult()` from `lib/qmd-output.ts`
- `--skip-qmd` option (for testability)
- `--json` output: `{ success: true, resolved: { id, text, personName, direction, resolvedAt, status }, qmd: { indexed, skipped, warning? } }`
- Calls `findRoot()` — exits with JSON-aware error if not in workspace

*Registration*:
- `registerCommitmentsCommand` imported and called in `packages/cli/src/index.ts`
- Help text entry added for `commitments` command group

*Routing/discoverability*:
- Create tool definition with triggers: "commitments", "what I owe", "what they owe", "track commitment", "resolve commitment", "open commitments" so `arete route "what do I owe"` surfaces this command

*Prerequisite*: `services.commitments` must exist in `AreteServices` (factory.ts wired in Step 5). Verify with `grep -r 'CommitmentsService' packages/core/src/factory.ts` before starting CLI work.

#### Step 8. Update planning skills

Update skill SKILL.md files to reference CommitmentsService via CLI. Also update `process-meetings` as the primary skill-level producer.

**Files touched**:
- `packages/runtime/skills/daily-plan/SKILL.md`
- `packages/runtime/skills/meeting-prep/SKILL.md`
- `packages/runtime/skills/week-plan/SKILL.md`
- `packages/runtime/skills/week-review/SKILL.md`
- `packages/runtime/skills/process-meetings/SKILL.md`
- `packages/runtime/skills/PATTERNS.md`

**Canonical source clarification** (add to PATTERNS.md):
- `arete people show <slug> --memory` → use for **meeting-prep** (full relationship brief: stances, health, history + commitments inline)
- `arete commitments list` → use for **week-review and week-plan** (task-management resolution view)
- Do not call both in the same skill step — they overlap on commitment data

**PATTERNS.md `get_meeting_context` update**:
- Update step 6 to: "Run `arete commitments list --person <slug>` for each attendee. If results are empty (first-time user or no CommitmentsService data), fall back to: check meeting markdown for `## Action Items` sections and collect unchecked `- [ ]` items."
- Verify all callers of `get_meeting_context` before publishing: meeting-prep ✓, daily-plan ✓, prepare-meeting-agenda (inherits change — confirm this is acceptable)

**Per-skill changes**:

*`meeting-prep`*:
- In the per-attendee context step: call `arete people show <slug> --memory` (already done). Commitments now appear inline in the memory section (from Step 6). No separate `arete commitments list` call needed — `people show --memory` is the canonical source for meeting-prep.
- Update AC: "Commitments section populated from `arete people show --memory` output; no separate commitments CLI call"

*`daily-plan`*:
- Add "Open Commitments" section: run `arete commitments list` (unfiltered, all open). Filter results by today's meeting attendee names in agent context — **do not call `--person` per attendee** (avoids N×M calls with multiple meetings).
- Section is non-opinionated: surface the list, user decides what to action today.

*`week-plan`*:
- In the "Gather Context" step (step 1): add `arete commitments list` to the read list.
- Surface commitments in the existing "Commitments due this week" section (do not add a separate pick-and-promote interaction).
- If the user wants to elevate a commitment to a top outcome, they do so in step 3 when reviewing all inputs together — no forced interaction.

*`week-review`*:
- Add a new dedicated step after priority review: **Commitment Review**
- Step: Run `arete commitments list`. If non-empty, present the list. For each commitment, ask: done / carried to next week / dropped (no longer relevant).
- **This step is explicitly skippable**: include "Type 'skip' to skip this section" at the top.
- Resolution: agent runs `arete commitments resolve <id> --yes --status <resolved|dropped>` on user's behalf after per-item confirmation. User confirms per item (not per hash — the agent translates).
- "Dropped" = explicitly de-scoped, no longer a valid obligation. Maps to `status: 'dropped'` in CommitmentsService.
- Commitments marked "carried" remain open; they surface again next week.

*`process-meetings`*:
- After extracting action items from a meeting, write them to CommitmentsService: call `arete commitments list` to check for existing items, then call the person memory refresh flow which syncs via `commitments.sync()`.
- Alternatively: document that `arete people memory refresh` (run after `process-meetings`) is the write path. The skill should note: "Run `arete people memory refresh --person <slug>` after processing to sync extracted commitments to CommitmentsService."

**AC**:
- `meeting-prep` uses `arete people show --memory` for commitments (not a separate CLI call)
- `daily-plan` calls `arete commitments list` (unfiltered) once and filters by attendee context in agent — no per-person calls
- `week-plan` surfaces commitments in existing "Commitments due this week" section; no separate pick-promote interaction
- `week-review` has new "Commitment Review" step that is explicitly skippable; "dropped" state defined and handled; resolution is agent-mediated
- `process-meetings` documents the producer path (either inline sync or post-meeting refresh)
- PATTERNS.md `get_meeting_context` step 6 updated with fallback for empty CommitmentsService
- prepare-meeting-agenda impact evaluated: PATTERNS.md change inherits to it; confirm this is acceptable or add an explicit note
- Skills remain non-opinionated: surface commitments, user decides; `resolve` only called in week-review (never in daily-plan or week-plan)

---

## Out of Scope

- Task manager integrations (Notion databases, Linear, etc.) — reconciliation service is ready when those arrive
- Auto-resolution without user action — always requires check/delete/CLI/skill confirmation
- Reminder/notification system
- `arete commitments reconcile` CLI command — the service method exists for future integrations to use
- Auto-detecting completion from future meeting transcripts
- Bidirectional sync as a standalone user feature — it is Architect-facing infrastructure; meeting-prep commitments (Feature C) is the primary user-visible value

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM prompt doesn't reliably distinguish commitments from descriptions | High — garbage in, garbage out | Test prompt against 3-4 real transcripts before wiring up |
| CommitmentsService is empty on first run (no producer has written to it yet) | High — all `arete commitments list` calls return nothing | Document producer path explicitly: `arete people memory refresh` is the write path. process-meetings skill notes this. First-time experience: empty list with "Run `arete people memory refresh` to populate." |
| Bidirectional sync: user edits commitment text (not just checks/deletes) | Medium — hash-based matching breaks if text changes | HTML comment approach handles this: hash is embedded, text changes don't break lookup. Only complete line deletion (no comment) would fail — treat as deletion (resolve). |
| `callLLM` not configured — silent fallback to regex | Low — documented regression path | Explicit fallback to regex in Steps 1+2. Users without LLM get current behavior, not zero results. |
| PATTERNS.md change ripples to prepare-meeting-agenda | Medium — unexpected behavior in unplanned skill | Audit callers before shipping; add CommitmentsService-empty fallback to PATTERNS.md step 6 |
| LLM cost per refresh (action items now require LLM calls like stances) | Low — cached per meeting+person | Cache pattern prevents redundant calls. Same approach as stances. |
