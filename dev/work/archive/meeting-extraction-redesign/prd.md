# Meeting Extraction Redesign PRD

## Goal

Redesign meeting action item extraction to produce clean, structured commitments instead of garbage. Move extraction from per-person LLM calls on raw transcripts (current: produces garbage) to single extraction during meeting processing with user review, saving structured output to meeting files. Person memory refresh then parses structured sections instead of doing LLM extraction.

## Background

Current state: `person-signals.ts` runs LLM extraction per-person on raw transcripts during `people memory refresh`. Despite prompt instructions to produce "concise, normalized descriptions," models dump raw transcript excerpts as commitments — giant paragraphs of dialogue, conversational text ("Me: Yeah..."), and non-commitments.

Target state: Extract once during meeting processing → user reviews → save structured `## Action Items` section to meeting file → person refresh parses structured markdown → syncs to CommitmentsService.

## Tasks

### Task 1: Create Meeting Extraction Service & CLI

Create the core service for extracting meeting intelligence and expose it via CLI.

**Files:**
- `packages/core/src/services/meeting-extraction.ts` (new)
- `packages/cli/src/commands/meeting/extract.ts` (new)
- `packages/core/test/services/meeting-extraction.test.ts` (new)

**Context to read first:**
- `packages/cli/src/commands/people/memory.ts` (LLM access pattern)
- `packages/cli/src/commands/pull/fathom.ts` (meeting processing pattern)
- `packages/core/src/services/person-signals.ts` (existing extraction, types)

**Service exports:**
- `buildMeetingExtractionPrompt(transcript, attendees, ownerSlug)` - builds LLM prompt
- `parseMeetingExtractionResponse(response)` - parses JSON response with validation
- `MeetingIntelligence` type - { summary, actionItems, nextSteps, decisions, learnings }
- `ActionItem` type - { owner, ownerSlug, description, direction, counterpartySlug, due? }

**CLI command:** `arete meeting extract <file> [--json]`

**Acceptance Criteria:**
- [ ] Prompt includes JSON schema and few-shot examples (good: "John to send API docs to Sarah by Friday"; bad: "Me: Yeah, I'll look into that...", "So the way the system works is...")
- [ ] Parser rejects action items > 150 chars
- [ ] Parser rejects items starting with "Me:", "Them:", "Yeah", "I'm not sure"
- [ ] Parser rejects items with multiple sentences (more than one period)
- [ ] Parser handles malformed JSON gracefully (returns empty arrays, not throws)
- [ ] CLI outputs JSON with `--json` flag, human-readable otherwise
- [ ] Tests cover: prompt building, valid/malformed/empty responses, validation rejections

---

### Task 2: Create Action Item Parser for Meeting Files

Create parser to extract action items from structured `## Action Items` sections in meeting markdown.

**Files:**
- `packages/core/src/services/meeting-parser.ts` (new)
- `packages/core/test/services/meeting-parser.test.ts` (new)

**Context to read first:**
- `packages/core/src/services/person-signals.ts` (PersonActionItem type, direction logic)
- `packages/core/src/services/commitments.ts` (how items are consumed)

**Exports:**
- `parseActionItemsFromMeeting(content, personSlug, ownerSlug)` - extracts action items from `## Action Items` section
- Returns `PersonActionItem[]` compatible with existing types

**Acceptance Criteria:**
- [ ] Parses `@owner-slug → @counterparty-slug` notation for direction
- [ ] Handles notation variations: `→`, `->`, `-->`, `=>`
- [ ] Handles missing @ prefix: `john-koht → sarah-chen` works
- [ ] Fallback: items without arrow notation use owner-name heuristics for direction
- [ ] Handles checked `[x]` and unchecked `[ ]` items (returns both, marks completed)
- [ ] Returns only items relevant to given personSlug (as owner OR counterparty)
- [ ] Returns empty array if no `## Action Items` section found (not error)
- [ ] Tests cover: all notation variations, direction determination, fallback, filtering

---

### Task 3: Update process-meetings Skill

Rewrite the skill workflow to use the new extraction → review → save flow.

**Files:**
- `packages/runtime/skills/process-meetings/SKILL.md`

**Context to read first:**
- Current `packages/runtime/skills/process-meetings/SKILL.md` (existing workflow)
- `packages/runtime/skills/PATTERNS.md` (extract_decisions_learnings pattern for review UX)

**New workflow sections (4-6) inserted after existing step 3:**
- Step 4: Extract meeting intelligence via `arete meeting extract <file> --json`
- Step 5: User review - present extraction, allow approve/edit/skip per section
- Step 6: Save approved content to meeting file (append ## Summary, ## Action Items, ## Next Steps, ## Decisions, ## Learnings)

**Acceptance Criteria:**
- [ ] Workflow clearly documents the new steps 4-6
- [ ] User review UX follows existing skill-driven pattern (present, ask approve/edit/skip)
- [ ] Documents the action item format: `- [ ] {Owner} to {action} (@{owner-slug} → @{counterparty-slug})`
- [ ] Documents direction encoding: `@john → @sarah` = John owes Sarah
- [ ] Preserves existing steps 1-3 (gather context, people resolution, attendee_ids)
- [ ] Updates step ordering for existing steps 7+ (memory, person refresh)

---

### Task 4: Update Person Memory Refresh

Change action item extraction from LLM-based to parsing-based using Task 2's parser.

**Files:**
- `packages/core/src/services/entity.ts`
- `packages/cli/src/commands/people/memory.ts`
- `packages/core/test/services/entity.test.ts` (update)

**Context to read first:**
- `packages/core/src/services/entity.ts` (current refreshPersonMemory implementation)
- `packages/cli/src/commands/people/memory.ts` (CLI interface)
- Task 2's `meeting-parser.ts` (parser to use)

**Changes:**
- In `refreshPersonMemory`, replace LLM extraction with: find meetings where person is attendee → call `parseActionItemsFromMeeting()` for each → collect results
- Add guard in CommitmentsService sync: if incoming items empty AND existing items exist, log warning but don't wipe

**Acceptance Criteria:**
- [ ] No LLM calls for action item extraction from meetings
- [ ] Uses `parseActionItemsFromMeeting()` from meeting-parser.ts
- [ ] Only processes meetings with `## Action Items` section (skip others gracefully)
- [ ] Existing commitments preserved when meeting has no structured section
- [ ] Direction correctly determined from arrow notation
- [ ] Integration test: meeting with `## Action Items` → refresh → items appear in commitments
- [ ] Integration test: old meeting without section → refresh → existing commitments UNCHANGED

---

### Task 5: Update PATTERNS.md

Update the `get_meeting_context` pattern to reflect new primary path.

**Files:**
- `packages/runtime/skills/PATTERNS.md`

**Context to read first:**
- Current PATTERNS.md § get_meeting_context
- Grep for other skills/files that reference this pattern

**Acceptance Criteria:**
- [ ] Primary path: Parse structured `## Action Items` section from meeting files
- [ ] Fallback: `arete commitments list --person <slug>` for older meetings without structured sections
- [ ] Any referencing skills continue to work

---

### Task 6: Deprecate LLM Extraction in person-signals.ts

Mark the LLM-based action item extraction as deprecated.

**Files:**
- `packages/core/src/services/person-signals.ts`

**Acceptance Criteria:**
- [ ] `extractActionItemsForPerson` LLM path marked `@deprecated` with JSDoc explaining new flow
- [ ] `buildActionItemPrompt` marked `@deprecated`
- [ ] Regex fallback preserved for potential non-meeting sources
- [ ] No breaking changes to existing callers (function signatures unchanged)
- [ ] Comments explain: "For meetings, use meeting-parser.ts. This path is deprecated."

## Dependencies

- Task 3 depends on Task 1 (skill needs CLI command)
- Task 4 depends on Task 2 (refresh needs parser)
- Task 5 depends on Tasks 1-4 (documents the complete new path)
- Task 6 depends on Task 4 (deprecate after new path works)

## Out of Scope

- Migrating existing commitments.json (they auto-prune over 30 days)
- Retroactively processing old meetings
- Changes to commitment resolution/reconciliation
- Duplicate prevention during transition (expected, will auto-prune)

## Success Criteria

1. `arete commitments list` shows clean, concise action items (no raw transcript)
2. Meeting files contain structured ## Summary, ## Action Items, ## Next Steps, ## Decisions sections
3. User has opportunity to review extracted content before saving
4. Old meetings without structured sections don't break or lose existing commitments

## Pre-Mortem Reference

See `dev/plans/meeting-extraction-redesign/pre-mortem.md` for identified risks and mitigations. Key risks:
- LLM extraction garbage → aggressive validation in parser
- Breaking old meetings → skip gracefully, integration tests
- Arrow notation fragility → handle variations, fallback path
