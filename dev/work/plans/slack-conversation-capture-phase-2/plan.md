---
title: Conversation Capture — Phase 2: People Modes & Improvements
slug: slack-conversation-capture-phase-2
status: planned
size: medium
tags: [feature]
created: 2026-02-19T00:00:00Z
updated: 2026-02-20T22:00:00Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 5
---

# Conversation Capture — Phase 2: People Modes & Improvements

Parent: `dev/work/plans/slack-conversation-capture/plan.md`

## Problem

Phase 1 captures conversations with insights extraction, including a `stakeholders` list. But there's no connection to Areté's people intelligence system — participants aren't resolved to person files, there's no `participant_ids` linking conversations to the people graph, and `findMentions` / `refreshPersonMemory` don't scan `resources/conversations/` at all.

Different users also have different needs: some want insights only, others want full people mapping. Without explicit modes, we either run people mapping for everyone or skip it for everyone.

## Solution

Add people-processing modes (off/ask/on) to conversation capture, reusing the existing `arete people intelligence digest` pipeline that `process-meetings` already uses.

**CLI confirmed generic**: `arete people intelligence digest --input <path>` accepts any JSON array of `PeopleIntelligenceCandidate[]` — not meeting-specific. Verified in `packages/cli/src/commands/people.ts`.

**No new abstraction needed**: `PeopleIntelligenceCandidate[]` → `EntityService.suggestPeopleIntelligence()` is already source-agnostic.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Default mode | `off` | Persona Council: Harvester (zero-friction user) rejects any mid-capture prompt |
| `ask` simplification | yes/no per-run only | No agent-writes-YAML in v1; "always/never" deferred until `arete config set` CLI exists |
| `participant_ids` initial value | `[]` in initial save, patched after mapping | Eliminates "add new field to existing YAML" failure mode in `updateConversationFrontmatter()` |
| Frontmatter patching strategy | String-level, not YAML round-trip | `yaml.stringify()` reformats key order/quoting, creating noisy diffs |
| `refreshPersonMemory` for conversations | Full body scan (no `participant_ids` dependency) | Consistent with meeting body scanning; avoids chicken-and-egg on first capture |
| EntityService step | Bundled with this phase | Zero dependency on other steps; could ship first — treat it as Task 1 in execution |

---

## Delivery Steps

### Step 1: `participantIds` in types + save + `updateConversationFrontmatter()` helper

Add `participantIds` to `ConversationForSave`, write `participant_ids: []` in initial save (patched after mapping), and add the helper for post-save writeback.

**Files to change:**
- `packages/core/src/integrations/conversations/types.ts` — add `participantIds?: string[]` to `ConversationForSave`
- `packages/core/src/integrations/conversations/save.ts`:
  - `renderConversationMarkdown()` — render `participant_ids: []` in frontmatter when `participantIds` is present (even if empty); omit field entirely when `participantIds` is `undefined`
  - Add `updateConversationFrontmatter(storage: StorageAdapter, filePath: string, participantIds: string[]): Promise<void>` — reads the saved file, replaces the `participant_ids` line using **string-level patching** (regex replace on the frontmatter block, not YAML round-trip). No-op if file doesn't exist. Never throws.
- `packages/core/src/integrations/conversations/index.ts` — export `updateConversationFrontmatter`

**`participant_ids` YAML format** (must match exactly — flow style, consistent with `attendee_ids` in meetings):
```yaml
participant_ids: [alice-smith, bob-jones]
```
Not block style. Test assertions must verify the exact rendered string, not just field presence.

**`updateConversationFrontmatter()` implementation notes:**
- Takes `StorageAdapter` (not direct `fs`) — required for testability, matches all other functions in `save.ts`
- String-level patch: find the line `participant_ids: [...]` in the frontmatter block and replace it; if not found, insert before closing `---`
- Preserve all other frontmatter fields and body content exactly

**AC:**
- `ConversationForSave` accepts optional `participantIds?: string[]`
- When `participantIds` is `undefined` → no `participant_ids` field in frontmatter (backward compatible)
- When `participantIds` is `[]` → `participant_ids: []` in frontmatter
- When `participantIds` is `['alice', 'bob']` → `participant_ids: [alice, bob]` in frontmatter (flow style)
- `updateConversationFrontmatter()`: file doesn't exist → no-op, no error thrown
- `updateConversationFrontmatter()`: file exists, no `participant_ids` → field inserted before closing `---`, all other content preserved byte-for-byte
- `updateConversationFrontmatter()`: file exists, `participant_ids` already present → field replaced, not duplicated
- `updateConversationFrontmatter()`: file has malformed/no frontmatter → graceful no-op, no crash
- `updateConversationFrontmatter()`: slug containing special chars → output is valid inline YAML
- Existing Phase 1 tests still pass (backward compatible)

**Test file:** Extend `packages/core/test/integrations/conversations/save.test.ts`

---

### Step 2: People-processing mode in workspace config

Add `settings.conversations.peopleProcessing` to `AreteConfig`, defaulting to `off`, always defined.

**Files to change:**
- `packages/core/src/models/workspace.ts` — extend `AreteConfig`:
  ```typescript
  settings: {
    memory: { ... };       // existing
    conversations: {       // new
      peopleProcessing: 'off' | 'ask' | 'on';
    };
  };
  ```
  Note: field is **required** (not optional) because `DEFAULT_CONFIG` always defines it — avoids `config.settings.conversations?.peopleProcessing` defensive chaining at every callsite.
- `packages/core/src/config.ts` — add to `DEFAULT_CONFIG.settings`:
  ```typescript
  conversations: {
    peopleProcessing: 'off',
  },
  ```

**Precedence** (via existing `deepMerge`):
1. Workspace `arete.yaml` → `settings.conversations.peopleProcessing`
2. System default → `'off'`

**AC:**
- `getDefaultConfig().settings.conversations.peopleProcessing === 'off'`
- `loadConfig()` with no workspace file → `conversations.peopleProcessing` is `'off'` (not `undefined`)
- `loadConfig()` with workspace `arete.yaml` setting `on` → resolves to `'on'`
- `deepMerge` with a workspace config that only sets `conversations` does not clobber `settings.memory`
- No existing config consumers break (calendar integration, memory settings unaffected)

**Test file:** Create `packages/core/test/config.test.ts` (no existing file).
Reference patterns:
- `packages/core/test/integrations/calendar.test.ts` — `getDefaultConfig()` usage
- `packages/core/test/services/workspace.test.ts` — `StorageAdapter` mocking, temp dir setup
- `packages/core/test/services/person-memory.test.ts` — `FileStorageAdapter` + `mkdtempSync` pattern

Cover: default value, workspace YAML override, sibling settings not clobbered, missing YAML file, malformed YAML.

---

### Step 3: EntityService — scan conversations

`EntityService` currently has no knowledge of `resources/conversations/`. Three changes needed.

**Files to change:**
- `packages/core/src/models/entities.ts` line 138:
  ```typescript
  // Before:
  export type MentionSourceType = 'context' | 'meeting' | 'memory' | 'project';
  // After:
  export type MentionSourceType = 'context' | 'meeting' | 'memory' | 'project' | 'conversation';
  ```
  No downstream exhaustiveness checks found (only exported via `models/index.ts`) — safe to add.

- `packages/core/src/services/entity.ts`:
  - `getSourceType()` (~line 349): add conversations branch before the `return 'context'` fallback:
    ```typescript
    const conversationsDir = join(paths.resources, 'conversations');
    if (filePath.startsWith(conversationsDir)) return 'conversation';
    ```
  - `findMentions()` (~line 875): add to `scanDirs`:
    ```typescript
    { dir: join(workspacePaths.resources, 'conversations'), recursive: false }
    ```
  - `refreshPersonMemory()` (~line 1155): add conversation file scanning alongside meetings. Use **full body scan** (same as meeting body scan — no `participant_ids` dependency, avoids chicken-and-egg on first capture). Add `scannedConversations: number` to the return value for observability.

**Note on signal quality:** `collectSignalsForPerson()` uses regex patterns tuned for meeting transcripts ("asked about X", "concerned about Y", speaker-turn patterns). Free-form conversation text will produce fewer signals — this is **expected, not a bug**. Zero signals from a conversation is correct behavior.

**AC:**
- `MentionSourceType` includes `'conversation'`
- `getSourceType()` returns `'conversation'` for a file under `resources/conversations/`
- `findMentions()` returns conversation files when a participant name appears in them
- `findMentions()` on an existing person still returns meeting files (no regression)
- `refreshPersonMemory()` scans conversation files for signals; `scannedConversations` in result
- `refreshPersonMemory()` with only meeting files still works (no regression)
- `collectSignalsForPerson()` unchanged — no new tests needed for it

**Test file:** Extend `packages/core/test/services/person-memory.test.ts` for `refreshPersonMemory` conversation scanning. Extend `packages/core/test/services/entity.test.ts` for `findMentions` + `getSourceType`. Use the `writeMeeting()` helper pattern from `person-memory.test.ts` to create a `writeConversation()` fixture helper.

---

### Step 4: Update capture-conversation skill with people-processing flow

Update SKILL.md to add people-processing after save, gated by mode.

**File to change:** `packages/runtime/skills/capture-conversation/SKILL.md`

**Skill flow addition** (insert after "7. Confirm to User", before closing):

#### Step 7 (revised): Confirm + optional tip
On save success, confirm to user. If mode is `off`, include the passive tip **inline in the confirmation message** (not as a separate step):
> "Saved to `resources/conversations/2026-02-20-api-discussion.md`. *(Tip: set `settings.conversations.peopleProcessing: on` in `arete.yaml` to map participants to your people directory.)*"

Do **not** show the tip if mode is `ask` or `on` (user already knows about the feature).

#### Step 8 (new): People processing (if mode is `ask` or `on`)
1. Read `settings.conversations.peopleProcessing` from `arete.yaml` (use `arete context` or read file directly)
2. If `off` → done (tip already shown in confirmation)
3. If `ask` → present participants + stakeholders list and ask: *"Map these people to your people directory? (yes/no)"* — no remember-choice in v1 (no agent-writes-YAML)
4. If `on` (or `ask` + yes):
   a. **Build candidates** from `participants` (display names from parser) + `stakeholders` (from insights):
      - Normalize names: lowercase + trim for dedup comparison
      - If same normalized name appears in both lists → keep one entry, prefer `participants` version (they spoke)
      - `source` field: `"conversation:participant"` for speakers, `"conversation:stakeholder"` for mentioned-only
      - `text` field: for participants, include a sample of their spoken lines; for stakeholders, include the sentence where they were mentioned
      - `email`: omit (Slack display names won't have email — low confidence is correct and expected)
   b. Write candidates JSON to a temp file (e.g. `/tmp/arete-candidates-{timestamp}.json`)
   c. Call `arete people intelligence digest --input <path> --json`
      - On non-zero exit or malformed JSON response → warn user, skip `participant_ids` writeback, **do not fail the capture**
   d. Process digest results: create/update person files, surface `unknown_queue` items for user review (same pattern as `process-meetings` skill)
   e. Call `updateConversationFrontmatter()` (via write tool) to replace `participant_ids: []` with resolved slugs
      - On failure → warn: *"⚠ Participants mapped but couldn't update participant_ids in {filename}."* Do not fail.

**AC:**
- Mode `off` → passive tip inline in save confirmation, no prompt, no mapping
- Mode `ask` → yes/no prompt only, no YAML writes by agent
- Mode `on` → mapping runs without prompting
- Candidate dedup: same name in participants + stakeholders → one candidate, not two
- Source attribution: `conversation:participant` vs `conversation:stakeholder`
- CLI failure is non-fatal; conversation file always stays saved
- `participant_ids` writeback failure surfaces a warning, doesn't fail the capture
- No regression on Phase 1 capture flow (paste → extract → review → save still works when mode is `off`)

---

### Step 5: End-to-end verification

**Commands to run and expected outcomes:**

```bash
# 1. Capture with mode off (default)
# Paste a conversation → save → confirm message includes inline tip → no participant_ids in file
arete context  # verify resources/conversations/YYYY-MM-DD-*.md exists
grep "participant_ids" resources/conversations/YYYY-MM-DD-*.md  # should be absent or []

# 2. Set mode on and capture again
# Add to arete.yaml: settings.conversations.peopleProcessing: on
# Capture a conversation with known participants (e.g. Alice, Bob)
grep "participant_ids" resources/conversations/YYYY-MM-DD-*.md  # should show resolved slugs

# 3. People created from conversation appear in people list
arete people list  # Alice and Bob appear

# 4. Conversation discoverable when searching for a participant
arete context --for "Alice"  # returns the conversation file

# 5. Person memory refresh picks up conversation signals
arete people memory refresh --person alice-smith
# Check alice-smith.md in people/ for updated Memory Highlights section

# 6. No regression on meeting flow
arete pull fathom --days 1  # or use an existing meeting file
arete people list  # meeting attendees still resolved correctly
```

**AC:**
- All 6 verification steps pass
- `npm run typecheck` passes (critical: `MentionSourceType` change must not break any consumers)
- `npm test` passes with no regressions
- `participant_ids` in flow-style YAML (`[slug1, slug2]`) not block-style

---

## Out of Scope

- Per-run CLI flag (`--people-mode`) — fast-follow if needed
- "Always/never" remember-choice in `ask` mode — needs `arete config set` CLI first
- Advanced people enrichment workflows
- Changes to `suggestPeopleIntelligence()` or `EntityService` classification logic

## Pre-Mortem

`dev/work/plans/slack-conversation-capture-phase-2/pre-mortem.md` — 6 risks, all mitigated.

## Review

Two cross-model reviewer passes completed. Key findings incorporated:
- `MentionSourceType` missing `'conversation'` (blocker — now in Step 3)
- `updateConversationFrontmatter()` must take `StorageAdapter`, use string-level patching
- Write `participant_ids: []` in initial save → eliminates add-new-field failure mode
- Participant/stakeholder dedup strategy and source attribution now specified in Step 4
- `refreshPersonMemory` uses full body scan for conversations (no `participant_ids` dependency)
- Config `DEFAULT_CONFIG` always defines `conversations` — no optional chaining needed at callsites
- Step 5 now has concrete commands and expected outputs
- Passive tip folded into save confirmation line, not a separate step
- CLI `--input` confirmed generic (not meeting-specific) — approach validated

## Related

- **Initiative**: `dev/work/plans/slack-conversation-capture/plan.md`
- **Phase 1 (archived)**: `dev/work/archive/slack-conversation-capture-phase-1/plan.md`
- **Phase 3**: `dev/work/plans/slack-conversation-capture-phase-3/plan.md` (BYO Slack App)
- **Process meetings skill**: `packages/runtime/skills/process-meetings/SKILL.md` (people pipeline pattern)
- **Entity service**: `packages/core/src/services/entity.ts` (`findMentions`, `refreshPersonMemory`, `getSourceType`)
- **Entities model**: `packages/core/src/models/entities.ts` (`MentionSourceType`)
- **Config**: `packages/core/src/config.ts`, `packages/core/src/models/workspace.ts`
- **People CLI**: `packages/cli/src/commands/people.ts` (`--input` format verified)
