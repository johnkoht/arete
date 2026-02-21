---
title: Conversation Capture — Phase 2: People Modes & Improvements
slug: slack-conversation-capture-phase-2
status: planned
size: medium
tags: [feature]
created: 2026-02-19T00:00:00Z
updated: 2026-02-20T21:30:00Z
completed: null
execution: null
has_review: false
has_pre_mortem: true
has_prd: false
steps: 5
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

### Persona Council Decision (hypothesis — not validated)

Default is `off`. The Harvester (zero-friction user) would be harmed by `ask` as default — any mid-capture prompt is fatal for them. The Architect will discover and enable `on` via config. The Preparer's payoff is too indirect to pre-commit. Feature is optional and discoverable.

## Delivery Steps

### Step 1: Add `participantIds` to conversation types and save

Add optional `participantIds` field to `ConversationForSave`, render as `participant_ids` in YAML frontmatter, and add `updateConversationFrontmatter()` helper for post-save participant_ids writeback.

**Files to change:**
- `packages/core/src/integrations/conversations/types.ts` — add `participantIds?: string[]` to `ConversationForSave`
- `packages/core/src/integrations/conversations/save.ts` — render `participant_ids` in frontmatter when non-empty; add `updateConversationFrontmatter(filePath, participantIds)` helper that reads the saved file, injects/updates `participant_ids` in frontmatter, and writes back
- `packages/core/src/integrations/conversations/index.ts` — export `updateConversationFrontmatter`

**AC:**
- `ConversationForSave` accepts optional `participantIds: string[]`
- When `participantIds` is present and non-empty, saved file includes `participant_ids: [slug1, slug2]` in YAML frontmatter
- When absent or empty, frontmatter has no `participant_ids` field (no empty array)
- `updateConversationFrontmatter()` reads an existing saved file, adds/replaces `participant_ids`, preserves all other content
- `updateConversationFrontmatter()` is a no-op if file doesn't exist (graceful failure)
- Existing Phase 1 tests still pass (backward compatible)
- New unit tests: frontmatter with participantIds, without participantIds, updateConversationFrontmatter happy path, updateConversationFrontmatter with missing file

**Test file:** `packages/core/test/integrations/conversations/save.test.ts` (extend existing)

### Step 2: Add people-processing mode to workspace config

Add `conversations.peopleProcessing` preference to `AreteConfig` defaulting to `off`.

**Files to change:**
- `packages/core/src/models/workspace.ts` — extend `AreteConfig.settings` with `conversations?: { peopleProcessing?: 'off' | 'ask' | 'on' }`
- `packages/core/src/config.ts` — add `conversations: { peopleProcessing: 'off' }` to `DEFAULT_CONFIG.settings`

**Precedence rules:**
1. Workspace `arete.yaml` (`settings.conversations.peopleProcessing`)
2. System default (`off`)

**AC:**
- `AreteConfig` type includes `settings.conversations?.peopleProcessing`
- `getDefaultConfig()` returns `off` for `settings.conversations.peopleProcessing`
- `loadConfig()` correctly resolves workspace override via `deepMerge`
- Type-safe: only `'off' | 'ask' | 'on'` accepted
- No regression in existing config consumers (calendar integration, memory settings)

**Test file:** Create `packages/core/test/config.test.ts` (no existing file — must create).
Pattern reference: `packages/core/test/integrations/calendar.test.ts` (uses `getDefaultConfig()`), `packages/core/test/services/workspace.test.ts` (StorageAdapter mocking).
Cover: default value, workspace YAML override, deepMerge nesting, invalid/missing YAML.

### Step 3: Update EntityService to scan conversations

`EntityService` currently doesn't know about `resources/conversations/`. Two methods need updating.

**Files to change:**
- `packages/core/src/services/entity.ts`:
  - `findMentions()` (~line 875): add `{ dir: join(workspacePaths.resources, 'conversations'), recursive: false }` to `scanDirs`
  - `refreshPersonMemory()` (~line 1155): add `resources/conversations/` scan alongside `resources/meetings/` — reuse same `collectSignalsForPerson()` call (already content-based, source-agnostic)
  - `getSourceType()` (~line 350): add `conversations` branch — return `'conversation'` for paths under `resources/conversations/`; update `MentionSourceType` in models if needed

**AC:**
- `findMentions()` returns conversation files when a participant name appears in them
- `refreshPersonMemory()` picks up signals (asks, concerns) from conversation files
- `getSourceType()` returns correct source type for conversation paths
- No regression on meeting-based `findMentions` or `refreshPersonMemory` (run existing tests)
- New unit tests for each updated method with conversation fixtures

**Note on signal quality:** `collectSignalsForPerson()` uses regex matching for "asked about", "concerned about" patterns. Free-form conversation text may produce fewer signals than structured meeting transcripts — this is acceptable and expected. Low signal ≠ bug.

**Test file:** `packages/core/test/services/entity.test.ts` (extend or create if missing)

### Step 4: Update capture-conversation skill with people-processing flow

Update SKILL.md to add people-processing step after save, gated by mode.

**File to change:**
- `packages/runtime/skills/capture-conversation/SKILL.md`

**Skill flow addition (after save confirmation, before closing):**
1. Read `settings.conversations.peopleProcessing` from workspace config via `arete context` or by reading `arete.yaml` directly
2. **If `off`**: Add passive note to confirmation: *"Tip: To map participants to your people directory, set `settings.conversations.peopleProcessing: on` in `arete.yaml`."* (show once, not on every capture — check if people directory is empty as a proxy for first-time users)
3. **If `ask`**: Present participants + stakeholders list and ask: *"Map these people to your people directory? (yes/no)"* — no remember-choice in v1 (too complex, requires agent writing YAML)
4. **If `on`** (or `ask` + user said yes):
   a. Build `PeopleIntelligenceCandidate[]` from conversation `participants` + insights `stakeholders` — deduplicate by name, source = `"conversation"`
   b. Write candidates JSON to a temp file
   c. Call `arete people intelligence digest --input <path> --json`
   d. Process digest: create/update person files, surface `unknown_queue` items for user review
   e. Call `updateConversationFrontmatter()` (via write tool) to add `participant_ids` to the saved file

**AC:**
- Mode `off` skips all people mapping, shows passive tip (not on every capture)
- Mode `ask` prompts yes/no, no YAML writes by the agent
- Mode `on` runs people mapping without prompting
- People mapping failure (CLI error, no candidates) does not affect the already-saved conversation file
- `participant_ids` written back only on success
- Skill references correct config key and CLI command
- No regression on existing Phase 1 capture flow

### Step 5: End-to-end verification

Verify the full flow and that conversations integrate with the people graph.

**Verification checklist:**
- Capture with mode `off` → saves cleanly, passive tip shown, no `participant_ids`
- Capture with mode `on` → participants mapped, person files created/updated, `participant_ids` in frontmatter
- `arete people list` shows people created/updated from conversations
- `arete context --for "person-name"` finds conversations they participated in
- `arete people memory refresh` picks up signals from conversation files
- No regression: meeting-based people flow still works end-to-end

## Out of Scope

- Per-run CLI flag override (`--people-mode`) — can add in a follow-up
- "Always"/"never" remember-choice in `ask` mode — requires agent writing YAML, defer until `arete config set` CLI exists
- Advanced people enrichment workflows
- Mandatory people graph updates (people mapping is always non-blocking)

## Pre-Mortem Summary

Full pre-mortem: `dev/work/plans/slack-conversation-capture-phase-2/pre-mortem.md`

Key mitigations incorporated:
- EntityService gaps (findMentions + refreshPersonMemory) now explicit in Step 3
- Default changed from `ask` to `off` (Persona Council: Harvester rejects blocking prompts)
- `updateConversationFrontmatter()` helper explicit in Step 1 (post-save patch approach)
- `ask` mode simplified — no agent-writes-YAML in v1
- No existing config tests → Step 2 must create `packages/core/test/config.test.ts`

## Related

- **Initiative**: `dev/work/plans/slack-conversation-capture/plan.md`
- **Phase 1 (archived)**: `dev/work/archive/slack-conversation-capture-phase-1/plan.md`
- **Phase 3**: `dev/work/plans/slack-conversation-capture-phase-3/plan.md` (BYO Slack App)
- **Process meetings skill**: `packages/runtime/skills/process-meetings/SKILL.md` (people pipeline pattern)
- **Entity service**: `packages/core/src/services/entity.ts` (findMentions, refreshPersonMemory)
- **Config**: `packages/core/src/config.ts`, `packages/core/src/models/workspace.ts`
