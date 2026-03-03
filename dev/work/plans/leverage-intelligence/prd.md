# PRD: Leverage Intelligence — Commitments Service

**Version**: 2.0 (regenerated after multi-reviewer review)
**Status**: Draft
**Date**: 2026-03-03
**Branch**: `feature/commitments-service`

---

## 1. Problem & Goals

### Problem

Action item extraction from meeting transcripts is regex-based and produces low-quality results. Raw transcript text gets captured as "commitments" when it's just someone explaining how something works. Example: a walkthrough meeting with Dave generated 10+ "they owe me" items, most of which were just him describing his company's architecture — not actual commitments.

Additionally:
- No cross-person view of "what do I owe people?" or "what do people owe me?"
- No way to resolve commitments as done
- No reconciliation against external task managers
- Planning skills (daily-plan, meeting-prep, week-plan, week-review) have no structured commitment data to draw from

### Goals

1. Replace regex action item extraction with LLM-based extraction that distinguishes genuine commitments from transcript noise
2. Introduce CommitmentsService as the single source of truth for all commitments
3. Render commitments as interactive checkboxes in person memory files with bidirectional sync
4. Expose commitments via CLI (`arete commitments list / resolve`)
5. Wire commitments into planning skills (meeting-prep, daily-plan, week-plan, week-review, process-meetings)

### Out of Scope

- Task manager integrations (Notion, Linear) — reconciliation method is ready but no CLI exposure
- Auto-resolution without user action
- Reminder/notification system
- Auto-detecting completion from future meeting transcripts
- `arete commitments reconcile` CLI command

---

## 2. Architecture

- **CommitmentsService** owns `.arete/commitments.json` — single source of truth
- **Person memory sections** are rendered projections (read-only view from CommitmentsService)
- **Bidirectional sync**: `<!-- h:XXXXXXXX -->` HTML comments embed hash in rendered checkboxes; detected on refresh
- **Producer path**: `arete people memory refresh` is the primary write path; `process-meetings` skill documents this path
- **callLLM DI pattern**: LLM extraction gated via options (not constructor); regex fallback when absent

---

## 3. Tasks

### Task 1: LLM-based commitment extraction

Replace `extractActionItemsForPerson()` in `packages/core/src/services/person-signals.ts` with LLM-based extraction following the `extractStancesForPerson()` DI pattern.

Create `buildActionItemPrompt(content, personName)` and `parseActionItemResponse(response)`.

The prompt must distinguish genuine commitments (promises, action items, deliverables) from descriptions, explanations, and general discussion. Classify direction: `i_owe_them` vs `they_owe_me`. Return clean, normalized descriptions.

**Acceptance Criteria**:
- Given the Dave walkthrough transcript, extracts ≤3 genuine items (share slides, Jira walkthrough, organize offsite) and rejects all transcript excerpts describing architecture
- Each item has a concise deliverable description (not raw transcript text)
- Function signature: `extractActionItemsForPerson(content, personName, source, date, callLLM?, ownerName?)` — `callLLM` is optional
- When `callLLM` is not provided: falls back to existing regex implementation — no silent zero-result regression
- Existing types (`PersonActionItem`, `ActionItemDirection`) unchanged
- Lifecycle functions (hash, stale, cap, dedup) unchanged
- `buildActionItemPrompt` and `parseActionItemResponse` are exported for testing

---

### Task 2: Wire LLM extraction into refresh pipeline

Update `refreshPersonMemory()` in `packages/core/src/services/entity.ts` to use LLM-based extraction when `callLLM` is provided, following the stance cache pattern.

**Acceptance Criteria**:
- `arete people memory refresh` uses LLM extraction for action items when `callLLM` is provided in options
- When `callLLM` is not provided, action item extraction falls back to regex (no behavioral regression from current behavior)
- Action item extraction cached per meeting+person using function-scoped `Map<string, PersonActionItem[]>` keyed by `resolve(root, meetingPath) + ':' + person.slug` (same pattern as stance cache)
- Existing lifecycle (30-day staleness, dedup, cap at 10 per direction) works as before
- `extractActionItemsForPerson` call is async (awaited) when `callLLM` provided; sync path falls back cleanly
- `RefreshPersonMemoryOptions` cache key uses consistent normalization with stance cache

---

### Task 3: Update tests for async LLM extraction

Update tests in `packages/core/test/services/person-signals.test.ts` and `packages/core/test/services/person-memory*.test.ts` for the async LLM-based extraction path.

**Acceptance Criteria**:
- All existing tests pass or are updated for the new async signature
- New tests cover: `buildActionItemPrompt` output structure, `parseActionItemResponse` for valid JSON, malformed JSON (returns []), missing fields (skips item), direction classification (`i_owe_them` vs `they_owe_me`), empty content (returns [])
- Mock `callLLM` used throughout — no real LLM calls in tests
- Test for fallback behavior: when `callLLM` is not provided to `extractActionItemsForPerson`, regex runs and returns results (regression guard)
- `npm run typecheck && npm test` pass

---

### Task 4: Commitments data model and storage types

Define the `Commitment` type and supporting types in `packages/core/src/models/`. No service logic — types and schema only.

Schema:
```json
{
  "commitments": [{
    "id": "sha256-64chars",
    "text": "Share Monday meeting slides",
    "direction": "they_owe_me",
    "personSlug": "dave-wiedenheft",
    "personName": "Dave Wiedenheft",
    "source": "2026-02-26-meeting.md",
    "date": "2026-02-26",
    "status": "open",
    "resolvedAt": null
  }]
}
```

**Acceptance Criteria**:
- Types defined in `packages/core/src/models/` (new file or added to existing `entities.ts`):
  - `Commitment`: `{ id: string; text: string; direction: 'i_owe_them' | 'they_owe_me'; personSlug: string; personName: string; source: string; date: string; status: CommitmentStatus; resolvedAt: string | null; }`
  - `CommitmentStatus`: `'open' | 'resolved' | 'dropped'`
  - `CommitmentsFile`: `{ commitments: Commitment[] }`
- `resolvedAt: string | null` — ISO date, distinct from `date` (meeting date). A commitment from 6 months ago resolved yesterday must NOT be immediately pruned.
- Types exported from `packages/core/src/models/index.ts`
- No service logic in this task — types only

---

### Task 5: CommitmentsService

Create `packages/core/src/services/commitments.ts` and wire it into the factory.

Constructor: `CommitmentsService(storage: StorageAdapter, workspaceRoot: string)` — resolves `.arete/commitments.json` path from `workspaceRoot` internally. No direct `fs` calls.

Methods:
- `listOpen(opts?: { direction?: ActionItemDirection; personSlugs?: string[] })` — open commitments, filtered by direction and/or person slug array
- `listForPerson(personSlug: string)` — convenience: open commitments for one person
- `resolve(id: string, status?: 'resolved' | 'dropped')` — marks resolved/dropped with `resolvedAt: new Date().toISOString()`
- `bulkResolve(ids: string[], status?: 'resolved' | 'dropped')` — batch resolve
- `sync(freshItems: Map<string, PersonActionItem[]>)` — merge extraction results; preserve resolved/dropped state (resolved items must NOT reappear)
- `reconcile(completedItems: { text: string; source: string }[])` — fuzzy-match via normalized word-overlap Jaccard similarity (threshold ≥ 0.6, no external library); returns `{ commitment: Commitment; completedItem: { text: string; source: string }; confidence: number }[]`; never auto-resolves

Pruning: on every write, remove resolved/dropped items where `resolvedAt` is older than 30 days. Uses `resolvedAt` not `date`.

**Acceptance Criteria**:
- `CommitmentsService` created in `packages/core/src/services/commitments.ts`
- **Wired into `packages/core/src/factory.ts`**: `const commitments = new CommitmentsService(storage, workspaceRoot);` — added to `AreteServices` type as `commitments: CommitmentsService`
- Exported from `packages/core/src/services/index.ts`
- `listOpen()` accepts optional `personSlugs: string[]` for multi-person filtering
- `sync()` preserves resolved/dropped state — re-extracting a resolved commitment does not reopen it
- `reconcile()` uses Jaccard word-overlap similarity; no `fuse.js`, `leven`, or other new dependencies; threshold 0.6; returns confidence scores; never auto-resolves
- Dedup: same hash as `computeActionItemHash(text, personSlug, direction)` from person-signals.ts
- Pruning: `resolvedAt` used (not `date`); 30-day window
- No direct `fs` calls — all I/O via `StorageAdapter`
- Unit tests in `packages/core/test/services/commitments.test.ts`: mock StorageAdapter, test all methods, test sync() idempotency, test reconcile() confidence scoring

---

### Task 6: Bidirectional sync via person memory checkboxes

Update `renderPersonMemorySection()` in `packages/core/src/services/person-memory.ts` to render commitments as interactive checkboxes with embedded hash comments. Update `refreshPersonMemory()` in `entity.ts` to detect and sync user edits before re-rendering.

**Rendered format**:
```markdown
### Open Commitments (I owe them)
- [ ] Send architecture doc to Dave (2026-02-26) <!-- h:3f9a1b2c -->

### Open Commitments (They owe me)
- [ ] Share Monday meeting slides (2026-02-26) <!-- h:abc12345 -->
```

HTML comment `<!-- h:XXXXXXXX -->` stores the first 8 chars of the commitment hash. Parser reads this comment to recover the hash without text parsing.

**Refresh flow (must follow this order)**:
1. Read current person file content
2. Parse existing auto-section: extract commitment lines with `<!-- h:XXXXXXXX -->` comments
3. Detect checked (`- [x]`) and deleted lines (in CommitmentsService but not in file)
4. `commitments.bulkResolve(detectedHashes)`
5. `commitments.sync(freshItems)`
6. Re-render from updated CommitmentsService state
7. `upsertPersonMemorySection()`

**CommitmentsService DI**: passed via `RefreshPersonMemoryOptions.commitments?: CommitmentsService`. All calls gated: `if (options.commitments) { ... }`. Without it, action items render as plain text (current behavior preserved).

**Acceptance Criteria**:
- Person file shows `- [ ] text (date) <!-- h:XXXXXXXX -->` format
- Checking a box (`- [x]`) resolves the commitment on next `arete people memory refresh` — detected via `<!-- h:XXXXXXXX -->` comment
- Deleting a line resolves the commitment on next refresh — detected by hash absence
- New commitments appear as unchecked items with hash comment
- `renderPersonMemorySection()` emits `<!-- h:XXXXXXXX -->` comments on all commitment lines
- Parser reads `<!-- h:XXXXXXXX -->` to recover hash — does not attempt text matching
- `RefreshPersonMemoryOptions` updated with `commitments?: CommitmentsService`
- Without `options.commitments`, rendering falls back to plain-text action items (no regression)
- Refresh follows the 7-step sequence above
- Tests: mock CommitmentsService; test checkbox detection, deletion detection, new-item appearance, hash comment rendering, and fallback (no CommitmentsService)

---

### Task 7: CLI — `arete commitments` commands

Create `packages/cli/src/commands/commitments.ts` with `registerCommitmentsCommand(program: Command)`. Register in `packages/cli/src/index.ts`.

**Commands**:
- `arete commitments list [--direction i_owe_them|they_owe_me] [--person <slug...>]`
- `arete commitments resolve <id> [--status resolved|dropped] [--yes] [--skip-qmd]`

**Acceptance Criteria**:

*`list`*:
- Groups by direction ("I owe them" / "They owe me") with person names
- Shows **8-char short ID prefix** (e.g. `3f9a1b2c`) in output for use with `resolve`
- `--person` is **variadic** (`--person <slug...>`) — accepts one or more slugs
- `--direction` filters by direction
- `findRoot()` guard — exits with JSON-aware error if not in workspace
- `--json` output: `{ success: true, commitments: [{ id, idShort, direction, personSlug, personName, text, date, resolvedAt }], count: N }`
- Error JSON: `{ success: false, error: "..." }`
- Output via `formatters.ts` helpers only (no raw chalk)

*`resolve`*:
- Accepts **8-char prefix or full 64-char hash** — matches by `id.startsWith(prefix)`; error if zero matches ("No commitment found") or multiple matches ("Ambiguous id — N matches. Use more characters.")
- `--status resolved|dropped` (default: `resolved`)
- `--yes` skips confirmation (for skill/automation use)
- Without `--yes`: `confirm()` from `@inquirer/prompts` with `default: false`, shows commitment text + person + direction
- **Write command**: `loadConfig()` after `findRoot()`, `refreshQmdIndex()` before return, `displayQmdResult()` from `lib/qmd-output.ts`
- `--skip-qmd` option for testability
- `--json` output: `{ success: true, resolved: { id, text, personName, direction, resolvedAt, status }, qmd: { indexed, skipped, warning? } }`
- `findRoot()` guard on both commands with JSON-aware error path

*Registration*:
- `registerCommitmentsCommand` imported and called in `packages/cli/src/index.ts`
- Help text entry added for `commitments` command group

*Routing*:
- Tool definition created with triggers: "commitments", "what I owe", "what they owe", "track commitment", "resolve commitment", "open commitments"

*Prerequisite check*: `services.commitments` must exist in `AreteServices` (wired in Task 5). Verify before starting this task.

---

### Task 8: Update planning skills

Update skill SKILL.md files to reference CommitmentsService via CLI. Add `process-meetings` as the documented producer path.

**Files**:
- `packages/runtime/skills/daily-plan/SKILL.md`
- `packages/runtime/skills/meeting-prep/SKILL.md`
- `packages/runtime/skills/week-plan/SKILL.md`
- `packages/runtime/skills/week-review/SKILL.md`
- `packages/runtime/skills/process-meetings/SKILL.md`
- `packages/runtime/skills/PATTERNS.md`

**PATTERNS.md `get_meeting_context` update**:
- Update step 6: "Run `arete commitments list --person <slug>` for each attendee. If results are empty (first-time user or no CommitmentsService data), fall back to: check meeting markdown for `## Action Items` sections and collect unchecked `- [ ]` items."
- Add canonical source note: use `arete people show <slug> --memory` for meeting-prep (full relationship brief); use `arete commitments list` for week-review/week-plan (task-management view). Do not call both in the same step — they overlap on commitment data.
- Verify all callers before publishing: meeting-prep ✓, daily-plan ✓, prepare-meeting-agenda (inherits change — confirm acceptable or add fallback note)

**Per-skill changes**:

`meeting-prep`: Use `arete people show <slug> --memory` (already in workflow). Commitments appear inline in memory section (from Task 6). No separate `arete commitments list` call.

`daily-plan`: Add "Open Commitments" section — run `arete commitments list` (unfiltered, all open). Filter by today's attendee names in agent context. Do NOT call `--person` per attendee (avoids N×M calls). Non-opinionated: surface list, user decides.

`week-plan`: Add `arete commitments list` to Gather Context step. Surface in existing "Commitments due this week" section — no separate pick-and-promote interaction. User elevates commitments to top outcomes organically in step 3.

`week-review`: Add new **Commitment Review** step after priority review:
- Run `arete commitments list`. If non-empty, present the list.
- **Explicitly skippable**: "Type 'skip' to skip this section" at top.
- For each commitment, ask: done / carried to next week / dropped (explicitly de-scoped, no longer relevant).
- Resolution is agent-mediated: agent runs `arete commitments resolve <id> --yes --status <resolved|dropped>` on user's behalf after per-item confirmation. User confirms per item, not per hash.
- Commitments marked "carried" remain open; surface again next week.

`process-meetings`: After extracting action items, note: "Run `arete people memory refresh --person <slug>` after processing to sync extracted commitments to CommitmentsService." Documents the producer path explicitly.

**Acceptance Criteria**:
- `meeting-prep` uses `arete people show --memory` for commitments — no separate commitments CLI call
- `daily-plan` calls `arete commitments list` (unfiltered) once, not per-attendee
- `week-plan` surfaces commitments in existing "Commitments due this week" section — no pick-promote interaction added
- `week-review` has new Commitment Review step; explicitly skippable; "dropped" state defined; resolution is agent-mediated
- `process-meetings` documents the producer path (`arete people memory refresh --person <slug>`)
- PATTERNS.md step 6 updated with fallback for empty CommitmentsService
- Canonical source distinction documented in PATTERNS.md
- Skills remain non-opinionated: `resolve` only called in week-review context
- prepare-meeting-agenda impact evaluated: PATTERNS.md change is acceptable (falls back gracefully) — note this in update

---

## 4. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM prompt doesn't reliably distinguish commitments from descriptions | High — garbage in, garbage out | Test prompt against 3-4 real transcripts before wiring up (Task 1) |
| CommitmentsService empty on first run — all `arete commitments list` calls return nothing | High — skills surface empty results | Document producer path; `process-meetings` notes `arete people memory refresh` as write path; empty list shows "Run `arete people memory refresh` to populate" |
| Bidirectional sync: user edits commitment text | Medium — hash lookup still works (embedded in HTML comment); text changes don't break it | HTML comment approach: hash embedded separately from text. Text edits are safe. Only full line deletion without comment fails — treat as deletion (resolve). |
| `callLLM` not configured — silent fallback to regex | Low — documented, no regression | Explicit fallback in Tasks 1+2. Users without LLM get current behavior, not zero results. |
| PATTERNS.md change ripples to prepare-meeting-agenda | Medium — unexpected behavior | Audit all callers before change; empty-CommitmentsService fallback in step 6 ensures graceful degradation |
| LLM cost per refresh | Low — cached per meeting+person | Same cache pattern as stance extraction |
