# Plan: Meeting Extraction Redesign

## Problem Statement

The current commitment extraction from meetings is producing garbage data:
- Raw transcript excerpts being captured as commitments (entire paragraphs of dialogue)
- Non-commitments captured (conversational text like "Me: Yeah...")
- Giant wall-of-text entries that are clearly transcript, not action items

Root cause: The `person-signals.ts` LLM extraction runs per-person on raw transcripts during `people memory refresh`, and the model ignores prompt instructions to produce "concise, normalized descriptions."

## Proposed Solution

Redesign the meeting processing flow to extract intelligence once, with user review, and save structured output to the meeting file itself. Person refresh then parses structured sections instead of doing LLM extraction on raw transcripts.

### New Flow

1. User asks to process meeting
2. `process-meetings` skill invoked
3. People resolution (entity resolution, create/update people files)
4. Write `attendee_ids` to meeting frontmatter
5. **Extract Meeting Intelligence** (single LLM call or subagent):
   - Summary (2-3 paragraphs)
   - Action Items (structured: owner, description, direction)
   - Next Steps (non-commitment follow-ups)
   - Decisions made
   - Learnings/insights
6. **User Review** - present extracted content for approval/edit/skip
7. **Save to Meeting File** - append approved sections
8. **Update Memory** - write decisions/learnings to `.arete/memory/items/`
9. **Refresh Person Intelligence** - now parses structured `## Action Items` section

### Meeting File Format (After Processing)

```markdown
---
title: Weekly Sync with Sarah
date: 2026-03-04
attendees:
  - john-koht
  - sarah-chen
attendee_ids:
  - john-koht
  - sarah-chen
---

# Weekly Sync with Sarah

[Original transcript content...]

## Summary

Met to discuss Q2 roadmap priorities. Sarah's team has bandwidth concerns...

## Action Items

- [ ] John to send API documentation to Sarah (@john-koht → @sarah-chen)
- [ ] Sarah to review pricing proposal by Friday (@sarah-chen → @john-koht)
- [ ] John to schedule follow-up with engineering (@john-koht → @sarah-chen)

## Next Steps

- Reconvene Thursday to finalize roadmap
- Sarah to loop in her tech lead async

## Decisions

- Approved Q2 roadmap scope focusing on API-first
- Decided to use Postgres over MongoDB for new service

## Learnings

- Sarah's team prefers async standups over daily syncs
- Their deploy window is Tuesdays only
```

### Action Item Format

```
- [ ] {Owner} to {action} (@{owner-slug} → @{counterparty-slug})
```

Direction encoding:
- `@john-koht → @sarah-chen` = John owes Sarah (i_owe_them from John's perspective)
- `@sarah-chen → @john-koht` = Sarah owes John (they_owe_me from John's perspective)

## User Review UX

The user review step uses the **skill-driven review pattern** already established in other skills:

1. Skill presents extracted content in formatted markdown
2. Skill asks: "Does this look correct? You can: [A]pprove all, [E]dit, [S]kip all, or review individually"
3. If individual review: present each section (Summary → Action Items → Next Steps → Decisions → Learnings)
4. For action items specifically: checkboxes to include/exclude each item

This follows the existing pattern from `extract_decisions_learnings` in PATTERNS.md.

**No new CLI command for review** — the skill handles this interactively.

## CLI Command Exposure

The skill invokes extraction via a new CLI command:

```bash
arete meeting extract <file> [--json]
```

This exposes the meeting-extraction service. The skill calls this, receives JSON, presents for review, then writes approved content to the meeting file.

## Implementation Tasks

### Task 1: Create Meeting Extraction Service & CLI

**Dependencies:** None (foundation task)

**Files:** 
- `packages/core/src/services/meeting-extraction.ts`
- `packages/cli/src/commands/meeting/extract.ts`

**Service:**
- `buildMeetingExtractionPrompt(transcript, attendees, ownerSlug)` - builds the extraction prompt
- `parseMeetingExtractionResponse(response)` - parses LLM JSON response
- `MeetingIntelligence` type - summary, actionItems, nextSteps, decisions, learnings
- `ActionItem` type - owner, ownerSlug, description, direction, counterpartySlug, due?

**CLI Command:** `arete meeting extract <file> [--json]`

**Context to Read First:**
- `packages/cli/src/commands/people/memory.ts` (LLM access pattern)
- `packages/cli/src/commands/pull/fathom.ts` (meeting processing pattern)
- `packages/core/src/services/person-signals.ts` (existing extraction, types)

**Acceptance Criteria:**
- Prompt clearly instructs LLM on format (JSON schema)
- **Includes few-shot examples:**
  - Good: "John to send API docs to Sarah by Friday"
  - Bad: "Me: Yeah, I'll look into that thing we talked about..."
  - Bad: "So the way the system works is you first click on the..."
- Parser handles malformed responses gracefully
- Action items limited to <150 chars enforced in parsing
- Post-parsing validation rejects items that look like transcript (starts with "Me:", "Them:", contains "I'm not sure", etc.)
- CLI command outputs JSON for skill consumption

**Tests (included in this task):**
- `packages/core/test/services/meeting-extraction.test.ts`
- Test prompt building with attendees and owner
- Test response parsing: valid JSON, malformed JSON, empty response
- Test validation: rejects > 150 chars, rejects "Me:" prefix, rejects multiple sentences

### Task 2: Create Action Item Parser for Meeting Files

**Dependencies:** None (can run parallel with Task 1)

**File:** `packages/core/src/services/meeting-parser.ts`

- `parseActionItemsFromMeeting(content, personSlug)` - extracts action items from `## Action Items` section
- Returns `PersonActionItem[]` with direction correctly determined from arrow notation
- Handles both checked `[x]` and unchecked `[ ]` items
- **Fallback parsing:** items WITHOUT arrow notation are still extracted (graceful degradation)

**Context to Read First:**
- `packages/core/src/services/person-signals.ts` (PersonActionItem type, direction logic)
- `packages/core/src/services/commitments.ts` (how items are consumed)

**Acceptance Criteria:**
- Parses the `@owner-slug → @counterparty-slug` notation
- Handles notation variations: `→`, `->`, `-->`, `=>`
- Handles missing @: `john-koht → sarah-chen` works
- Fallback: items without arrow notation default to direction based on owner name heuristics
- Returns only items relevant to the given personSlug
- Works with existing `PersonActionItem` type from person-signals.ts

**Tests (included in this task):**
- `packages/core/test/services/meeting-parser.test.ts`
- Test arrow notation parsing (all variations)
- Test direction determination from notation
- Test fallback path (no arrow notation)
- Test filtering by personSlug

### Task 3: Update process-meetings Skill

**Dependencies:** Task 1 (needs CLI command)

**File:** `packages/runtime/skills/process-meetings/SKILL.md`

Rewrite workflow to new flow:
1. Gather context (existing)
2. People resolution (existing)
3. Write attendee_ids (existing)
4. **NEW:** Extract meeting intelligence (call `arete meeting extract <file> --json`)
5. **NEW:** User review step (skill-driven review pattern)
6. **NEW:** Save to meeting file
7. Update memory (decisions/learnings)
8. Refresh person intelligence

**Acceptance Criteria:**
- Skill document clearly describes new workflow
- Includes user review/confirmation step with approve/edit/skip options
- Documents the meeting file format with action item arrow notation

### Task 4: Update Person Memory Refresh

**Dependencies:** Task 2 (needs parser)

**Files:**
- `packages/core/src/services/entity.ts`
- `packages/cli/src/commands/people/memory.ts`

Change action item extraction from LLM-based to parsing-based:
- Find meetings where person is an attendee (via `attendee_ids` frontmatter)
- Parse `## Action Items` sections from those meetings
- Extract items where person is owner or counterparty
- Sync to CommitmentsService

**Context to Read First:**
- `packages/core/src/services/entity.ts` (current refreshPersonMemory)
- `packages/cli/src/commands/people/memory.ts` (CLI interface)
- Task 2's meeting-parser.ts (parser to use)

**Acceptance Criteria:**
- No more LLM calls for action item extraction from meetings
- Correctly parses arrow notation for direction
- Only processes meetings with structured `## Action Items` section
- Maintains backward compatibility (meetings without the section are skipped, not errored)
- **Regression protection:** existing commitments from old meetings remain unchanged
- Guard in sync: if incoming items empty AND existing items exist, don't wipe

**Tests (included in this task):**
- Update `packages/core/test/services/entity.test.ts`
- Integration test: meeting with `## Action Items` → parse → sync → appears in commitments
- Integration test: old meeting without section → refresh → existing commitments UNCHANGED
- Direction correctness: verify notation produces correct `i_owe_them` / `they_owe_me`

### Task 5: Update PATTERNS.md

**Dependencies:** Tasks 1-4

**File:** `packages/runtime/skills/PATTERNS.md`

Update `get_meeting_context` pattern:
- Primary path: Parse structured `## Action Items` section from meeting files
- Fallback: `arete commitments list --person <slug>` for older meetings

**Acceptance Criteria:**
- Pattern reflects new primary path (structured sections)
- Fallback documented for backward compatibility

### Task 6: Deprecate LLM Extraction in person-signals.ts

**Dependencies:** Task 4 (after new path works)

**File:** `packages/core/src/services/person-signals.ts`

- Mark `extractActionItemsForPerson` LLM path as deprecated
- Keep regex fallback for potential non-meeting sources
- Update `buildActionItemPrompt` to note it's deprecated
- Add JSDoc comments explaining the new flow

**Acceptance Criteria:**
- Clear deprecation notices
- No breaking changes to existing callers
- Comments explain migration path

## Dependencies

- No external dependencies
- Internal: Uses existing CommitmentsService, PersonActionItem types

## Risks

1. **Migration of existing meetings** - Old meetings won't have `## Action Items` sections
   - Mitigation: Person refresh skips meetings without structured sections
   
2. **LLM extraction quality** - New prompt might still produce bad output
   - Mitigation: User review step catches issues; length limits in parser
   
3. **Breaking existing workflows** - Someone might depend on current behavior
   - Mitigation: Deprecate, don't remove; maintain backward compat

## Out of Scope

- Migrating existing commitments.json (they stay as-is, will get resolved/pruned over time)
- Retroactively processing old meetings
- Changes to commitment resolution/reconciliation
- **Duplicate prevention during transition**: Old commitments have hashes from LLM-extracted text; new commitments will have hashes from user-reviewed text. Same logical commitment won't dedupe — duplicates are expected and will auto-prune via the 30-day resolved window.

## Success Criteria

1. Running `arete commitments list` shows clean, concise action items
2. No raw transcript excerpts in commitments
3. Meeting files contain structured Summary/Action Items/Next Steps/Decisions sections
4. User has opportunity to review before saving
