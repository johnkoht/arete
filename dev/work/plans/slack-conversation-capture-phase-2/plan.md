---
title: Conversation Capture — Phase 2: People Modes & Improvements
slug: slack-conversation-capture-phase-2
status: planned
size: small
tags: [feature]
created: 2026-02-19T00:00:00Z
updated: 2026-02-20T15:55:00Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

# Conversation Capture — Phase 2: People Modes & Improvements

Parent: `dev/work/plans/slack-conversation-capture/plan.md`

## Problem

Phase 1 captures conversations with insights extraction, including a `stakeholders` list. But there's no connection to Areté's people intelligence system — participants aren't resolved to person files, and there's no `participant_ids` linking conversations to the people graph.

Different users also have different needs: some just want insights (summary, decisions, actions), while others want full people mapping. Without explicit modes, we either run people mapping for everyone or skip it for everyone.

## Solution

Add people-processing modes (off/ask/on) to conversation capture, reusing the existing `arete people intelligence digest` pipeline that `process-meetings` already uses. No new abstraction needed — `PeopleIntelligenceCandidate[]` → `EntityService.suggestPeopleIntelligence()` is already source-agnostic.

### Engineering Lead Assessment

> "The architecture is already right. `EntityService` is the abstraction. What looks like duplication between the skills is actually domain-specific mapping that belongs in each skill. Go with minimal wiring. Revisit when the third consumer shows up."

## Delivery Steps

### Step 1: Add `participantIds` to conversation types and save

Add optional `participantIds` field to `ConversationForSave` and render it as `participant_ids` in YAML frontmatter when present. Follows the same pattern as `attendee_ids` in meetings.

**Files to change:**
- `packages/core/src/integrations/conversations/types.ts` — add `participantIds?: string[]` to `ConversationForSave`
- `packages/core/src/integrations/conversations/save.ts` — render `participant_ids` in frontmatter when array is non-empty
- `packages/core/src/integrations/conversations/index.ts` — no change expected (re-exports types)

**AC:**
- `ConversationForSave` accepts optional `participantIds: string[]`
- When `participantIds` is present and non-empty, saved markdown includes `participant_ids: [slug1, slug2]` in YAML frontmatter
- When `participantIds` is absent or empty, frontmatter is unchanged (no empty field)
- Existing tests still pass (backward compatible)
- New unit tests for frontmatter rendering with and without `participantIds`

### Step 2: Add people-processing mode to workspace config

Add `conversations.peopleProcessing` preference to `AreteConfig` with values `off | ask | on`, defaulting to `ask`.

**Files to change:**
- `packages/core/src/models/workspace.ts` — extend `AreteConfig.settings` with `conversations?: { peopleProcessing?: 'off' | 'ask' | 'on' }`
- `packages/core/src/config.ts` — add default value (`ask`) to `DEFAULT_CONFIG.settings`

**Precedence rules:**
1. Workspace `arete.yaml` setting (`settings.conversations.peopleProcessing`)
2. System default (`ask`)

**AC:**
- `AreteConfig` type includes `settings.conversations.peopleProcessing`
- Default config returns `ask` when no workspace override
- Config resolution correctly reads from `arete.yaml`
- Type-safe: only `'off' | 'ask' | 'on'` accepted
- Unit tests for config resolution with and without workspace override

### Step 3: Update capture-conversation skill with people-processing flow

Update the `capture-conversation` SKILL.md to add a people-processing step after save, gated by the mode setting.

**Files to change:**
- `packages/runtime/skills/capture-conversation/SKILL.md` — add people-processing workflow between save and confirm steps

**Skill flow addition (after save, before final confirm):**
1. Read mode from workspace config (`arete.yaml` → `settings.conversations.peopleProcessing`)
2. If `off` → skip, go to confirm
3. If `ask` → present participants/stakeholders list, ask user: "Map these people to your people directory? (yes/no/always/never)"
   - "always" → set mode to `on` in config, proceed
   - "never" → set mode to `off` in config, skip
4. If `on` (or user confirmed) →
   a. Build `PeopleIntelligenceCandidate[]` from conversation participants + stakeholders (source: `"conversation"`, include any available context as `text`)
   b. Write candidates to temp JSON file
   c. Call `arete people intelligence digest --input <path> --json`
   d. Process digest results — create/update person files, present unknown_queue for user review
   e. Write `participant_ids` back to the saved conversation file's frontmatter

**AC:**
- Skill instructions include people-processing flow with mode check
- Mode `off` skips people mapping entirely
- Mode `ask` prompts user with remember-choice options ("always"/"never")
- Mode `on` runs people mapping without prompting
- People mapping uses existing `arete people intelligence digest` CLI — no new commands
- Failed/timed-out people mapping does not prevent conversation save (save happens first)
- Skill references correct config path and CLI commands

### Step 4: Verify end-to-end and context discoverability

Verify the full flow works and that conversations with `participant_ids` are properly linked in the people graph.

**Verification steps:**
- Capture a conversation with people mode `on` → participants resolved → person files created/updated → `participant_ids` in frontmatter
- Capture with mode `off` → no people mapping, no `participant_ids`
- `arete people list` shows people created from conversations
- `arete context --for "person-name"` finds conversations they participated in (via `participant_ids` or body mentions)
- Person memory refresh (`arete people memory refresh`) picks up conversation signals (same as meeting signals)

**AC:**
- Full flow: paste → extract → save → people mapping → participant_ids written
- People created from conversations appear in `arete people list`
- Conversations discoverable when searching for a participant
- No regression on existing meeting-based people flow

## Out of Scope

- Per-run CLI flag override (`--people-mode`) — can add later if needed
- Advanced people enrichment workflows
- Mandatory people graph updates (people mapping is always non-blocking)
- Changes to EntityService or people intelligence pipeline (already generic)

## Risks

- `ask` mode friction if prompted too often → Mitigated by "always"/"never" remember-choice
- Conversation participants may lack email (Slack usernames) → Already handled: `email` is optional in `PeopleIntelligenceCandidate`, confidence scores will be lower (correct behavior)
- Frontmatter update after save requires re-reading the file → Low risk, small I/O

## Related

- **Initiative**: `dev/work/plans/slack-conversation-capture/plan.md`
- **Phase 1**: `dev/work/plans/slack-conversation-capture-phase-1/plan.md`
- **Phase 3**: `dev/work/plans/slack-conversation-capture-phase-3/plan.md` (BYO Slack App)
- **Process meetings skill**: `packages/runtime/skills/process-meetings/SKILL.md` (pattern reference)
- **Entity service**: `packages/core/src/services/entity.ts` (people intelligence pipeline)
