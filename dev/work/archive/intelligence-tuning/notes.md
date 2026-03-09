# Areté Intelligence Tuning Plan

## Overview

This plan addresses **AI extraction quality** issues and **architectural normalization** for meeting processing.

**Status**: In Progress
**Size**: Large (6 items: INT-0 through INT-5)

---

## Architecture Context (Confirmed)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         @arete/core                                  │
│                                                                      │
│  AIService (from AI Config plan - assumed complete)                  │
│    - call(task, prompt) → string                                     │
│    - isConfigured() → boolean                                        │
│                                                                      │
│  Meeting Extraction Functions (existing + new)                       │
│    - buildMeetingExtractionPrompt()     ← existing                   │
│    - parseMeetingExtractionResponse()   ← existing                   │
│    - extractMeetingIntelligence()       ← existing                   │
│    - formatStagedSections()             ← move from backend          │
│    - updateMeetingContent()             ← move from backend          │
└─────────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│      CLI        │  │     Backend     │  │  Cursor Agent   │
│                 │  │                 │  │                 │
│ arete meeting   │  │ POST /process   │  │ process-meetings│
│   extract       │  │                 │  │ skill           │
│                 │  │                 │  │                 │
│ Uses core funcs │  │ Uses core funcs │  │ Uses own LLM    │
│ via AIService   │  │ via AIService   │  │ (skill fallback)│
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

**Key principle**: Core has all AI integration. CLI and Backend are orchestrators that proxy to core.

---

## INT-0: Service Normalization (Foundation)

**Dependency**: Requires AI Config plan (AI-1 through AI-5) to be complete

### INT-0.1: Move Formatting Functions to Core

**Goal**: Move `formatStagedSections()` + `updateMeetingContent()` from backend to core

**Engineering Lead Feedback Incorporated**:
- ✅ Keep existing DI pattern (`buildPrompt() → callLLM() → parseResponse()`)
- ✅ Do NOT create `MeetingExtractionService` class
- ✅ `'extraction'` AITask already exists in core
- ✅ Move both formatting functions together (they're a pair)
- ✅ Adapt to `MeetingIntelligence` type (structured `ActionItem[]`)

**Tasks**:
1. Move `formatStagedSections()` to `packages/core/src/services/meeting-extraction.ts`
2. Move `updateMeetingContent()` to same file
3. Adapt both to work with `MeetingIntelligence` type (not backend's `MeetingExtraction`)
4. Export from `@arete/core`
5. Add 8 tests per eng lead requirements

**Acceptance Criteria**:
- [ ] `formatStagedSections(result: MeetingExtractionResult)` exported from core
- [ ] `updateMeetingContent(content: string, stagedSections: string)` exported from core
- [ ] Tests: complete intelligence → all sections with correct IDs
- [ ] Tests: empty sections omitted
- [ ] Tests: ActionItem formatting (owner, direction, description)
- [ ] Tests: ID zero-padding (001, 010, 100)
- [ ] Tests: no existing summary → appends at end
- [ ] Tests: existing summary → replaces in place
- [ ] Tests: preserves content after staged sections
- [ ] Tests: idempotent (running twice = same result)

**Files**:
- `packages/core/src/services/meeting-extraction.ts` (add functions)
- `packages/core/src/services/index.ts` (export)
- `packages/core/src/services/meeting-extraction.test.ts` (add tests)

---

### INT-0.2: Create CLI Extraction Command

**Goal**: `arete meeting extract` command that uses core functions via AIService

**Engineering Lead Feedback Incorporated**:
- ✅ This is now valid with AI Config plan in place
- ✅ `--write` → rename to `--stage` (clearer meaning)
- ✅ Graceful error when no AI configured
- ✅ Update CLI LEARNINGS.md (the old removal note is superseded)

**Command Signature**:
```bash
arete meeting extract <file>              # Extract from meeting file
arete meeting extract <file> --json       # Output as JSON
arete meeting extract <file> --stage      # Write staged sections to file
arete meeting extract <file> --dry-run    # Show what would be written
```

**Tasks**:
1. Add `extract` subcommand to `meeting.ts`
2. Check `aiService.isConfigured()` early, error if not
3. Load meeting file, parse frontmatter for attendees
4. Call `extractMeetingIntelligence()` with AIService
5. Output results (human-readable, JSON, or staged markdown)
6. Optionally write staged sections to meeting file
7. Refresh qmd index after writes

**Acceptance Criteria**:
- [ ] `arete meeting extract <file>` outputs extraction summary
- [ ] `--json` flag outputs structured JSON
- [ ] `--stage` appends staged sections to meeting file
- [ ] `--dry-run` shows what would be written
- [ ] Clear error when no AI configured: "No AI provider configured. Run `arete onboard` to set up."
- [ ] `--skip-qmd` option works
- [ ] 12-18 test cases covering happy path, errors, flags

**Files**:
- `packages/cli/src/commands/meeting.ts` (add extract subcommand)
- `packages/cli/src/commands/LEARNINGS.md` (update to reflect new architecture)

---

### INT-0.3: Backend Uses Core Functions

**Goal**: Backend imports formatting functions from core

**Engineering Lead Feedback Incorporated**:
- ✅ Type mismatch: backend uses `string[]` for actionItems, core uses `ActionItem[]`
- ✅ Keep backend's extraction prompt (acceptable divergence for now)
- ✅ Just import formatting functions, don't change extraction logic

**Tasks**:
1. Import `formatStagedSections`, `updateMeetingContent` from `@arete/core`
2. Create adapter: `adaptBackendExtractionToCore()` to bridge types
3. Delete backend's duplicate functions
4. Keep extraction prompt in backend (different from core's — will consolidate in INT-1)

**Acceptance Criteria**:
- [ ] Backend imports `formatStagedSections` from core
- [ ] Backend imports `updateMeetingContent` from core
- [ ] Type adapter bridges `MeetingExtraction` → `MeetingIntelligence`
- [ ] `POST /api/meetings/:slug/process` still works
- [ ] No regression in output format

**Files**:
- `packages/apps/backend/src/services/agent.ts` (refactor)

---

### INT-0.4: Update Skill with CLI-First Path

**Goal**: Skill documents CLI command as primary, agent as fallback

**Tasks**:
1. Add "Preferred: CLI" path before agent extraction instructions
2. Check for AI config via `arete credentials show --json`
3. Keep existing extraction instructions as fallback
4. Update "Files this skill reads/writes" section

**Acceptance Criteria**:
- [ ] Skill documents `arete meeting extract` as primary path
- [ ] Skill provides full agent fallback for no-API-key case
- [ ] Cursor agents with API key use CLI
- [ ] Cursor agents without API key use agent extraction

**Files**:
- `packages/runtime/skills/process-meetings/SKILL.md` (update)

---

## INT-1 through INT-5

(See original plan - unchanged)

---

## Build Order

```
AI Config (prerequisite) ──► INT-0.1 (Core) ──► INT-0.2 (CLI) ──┐
                                                                 │
                             INT-0.3 (Backend) ◄─────────────────┤
                                                                 │
                             INT-0.4 (Skill) ◄───────────────────┘
                                    │
                                    ▼
              INT-1 (Quality) ──► INT-2 (Notes) ──► INT-3 (Confidence)
                                                          │
                                                          ▼
                                              INT-4 (Priority) ──► INT-5 (Reconcile)
```

---

## Engineering Lead Reviews Summary

### Core Expertise Review:
- ✅ Keep DI function pattern (don't create class)
- ✅ `extraction` AITask already registered
- ✅ Move both formatting functions together
- ⚠️ Type mismatch between core and backend (mitigated with adapter)
- ❌ Don't add confidence scoring in INT-0 (defer to INT-3)

### CLI Expertise Review:
- ⚠️ Previous removal of `arete meeting extract` was based on old architecture
- ✅ With AI Config plan, CLI can use AIService
- ✅ Rename `--write` to `--stage`
- ✅ Update CLI LEARNINGS.md to reflect new architecture

---

## Out of Scope for INT-0

- Confidence scoring (INT-3)
- User notes auto-merge (INT-2)
- Quality tuning prompts (INT-1)
- New extraction categories
- Prompt consolidation (INT-1)
