# PRD: INT-0 Service Normalization

**Date**: 2026-03-08
**Status**: Ready for Build
**Size**: Medium (4 tasks)
**Dependency**: AI Config (✅ AIService exists in core)

---

## Problem Statement

Meeting intelligence extraction has three fragmented implementations:
1. **Core** (`meeting-extraction.ts`) — Complete extraction logic, **unused**
2. **Backend** (`agent.ts`) — Different prompt, own formatting functions
3. **Skill** (`process-meetings/SKILL.md`) — Agent does extraction inline

This fragmentation means:
- Improving extraction quality requires updating 2+ places
- No CLI path for extraction
- Inconsistent validation across paths

---

## Solution

Normalize to: **Core owns extraction and formatting. CLI and Backend orchestrate.**

```
Core: extractMeetingIntelligence() + formatStagedSections() + updateMeetingContent()
  ↓
CLI: arete meeting extract (orchestrates core via AIService)
Backend: POST /process (orchestrates core via AIService)
Skill: Use CLI if available, agent fallback if not
```

---

## Success Criteria

1. [ ] One formatting implementation in core
2. [ ] CLI can extract from meeting files
3. [ ] Backend uses core formatting
4. [ ] Skill documents CLI-first path
5. [ ] All tests pass
6. [ ] No regression in extraction quality

---

## Tasks

### Task 1: INT-0.1 — Move Formatting Functions to Core

**Description**: Move `formatStagedSections()` and `updateMeetingContent()` from backend to core

**Acceptance Criteria**:
- [ ] `formatStagedSections(result: MeetingExtractionResult)` in `meeting-extraction.ts`
- [ ] `updateMeetingContent(content: string, stagedSections: string)` in same file
- [ ] Both exported from `@arete/core`
- [ ] Functions work with `MeetingIntelligence` type (structured `ActionItem[]`)
- [ ] Test: complete intelligence → all sections with correct IDs (ai_001, de_001, le_001)
- [ ] Test: empty sections omitted (no empty `## Staged Action Items`)
- [ ] Test: ActionItem formatting includes owner, direction, description
- [ ] Test: ID zero-padding (001, 010, 100)
- [ ] Test: no existing summary → appends at end
- [ ] Test: existing summary → replaces in place
- [ ] Test: preserves content after staged sections (other `##` headers)
- [ ] Test: idempotent (running twice = same result)

**Context**:
- Read: `packages/core/src/services/meeting-extraction.ts` (existing functions)
- Read: `packages/apps/backend/src/services/agent.ts` lines 73-130 (functions to move)
- Pattern: `packages/core/src/services/person-signals.ts` (similar formatting)

**Files to Modify**:
- `packages/core/src/services/meeting-extraction.ts`
- `packages/core/src/services/index.ts`
- `packages/core/src/services/meeting-extraction.test.ts`

**Depends on**: None

---

### Task 2: INT-0.2 — Create CLI Extraction Command

**Description**: Add `arete meeting extract` command using core extraction via AIService

**Acceptance Criteria**:
- [ ] `arete meeting extract <file>` outputs human-readable extraction
- [ ] `--json` outputs structured JSON
- [ ] `--stage` writes staged sections to meeting file
- [ ] `--dry-run` shows what would be written without writing
- [ ] `--skip-qmd` skips search index refresh
- [ ] Early check: if `aiService.isConfigured() === false`, error with: "No AI provider configured. Run `arete onboard` to set up."
- [ ] Uses `extractMeetingIntelligence()` from core
- [ ] Uses `formatStagedSections()` for output
- [ ] Uses `updateMeetingContent()` for `--stage`
- [ ] Test: happy path with mock AIService
- [ ] Test: no AI configured → clear error
- [ ] Test: invalid file → graceful error
- [ ] Test: `--json` produces valid JSON
- [ ] Test: `--stage` modifies file correctly
- [ ] Test: `--dry-run` doesn't write

**Context**:
- Read: `packages/cli/src/commands/meeting.ts` (existing commands)
- Read: `packages/cli/src/commands/people.ts` (similar pattern with `--json`)
- Read: `packages/core/src/services/ai.ts` (AIService interface)
- Pattern: `packages/cli/src/formatters.ts` (output formatting)

**Files to Modify**:
- `packages/cli/src/commands/meeting.ts`
- `packages/cli/src/commands/LEARNINGS.md` (update to reflect new architecture)

**Depends on**: Task 1

---

### Task 3: INT-0.3 — Backend Uses Core Functions

**Description**: Backend imports formatting from core instead of its own copies

**Acceptance Criteria**:
- [ ] Backend imports `formatStagedSections` from `@arete/core`
- [ ] Backend imports `updateMeetingContent` from `@arete/core`
- [ ] Type adapter: `adaptBackendExtractionToCore()` bridges `MeetingExtraction` → `MeetingIntelligence`
- [ ] Backend's duplicate `formatStagedSections()` deleted
- [ ] Backend's duplicate `updateMeetingContent()` deleted (if exists)
- [ ] `POST /api/meetings/:slug/process` output unchanged (snapshot test)
- [ ] All existing backend tests pass

**Context**:
- Read: `packages/apps/backend/src/services/agent.ts` (current implementation)
- Read: `packages/core/src/services/meeting-extraction.ts` (after Task 1)

**Files to Modify**:
- `packages/apps/backend/src/services/agent.ts`

**Depends on**: Task 1

---

### Task 4: INT-0.4 — Update Skill with CLI-First Path

**Description**: Update process-meetings skill to use CLI command when available

**Acceptance Criteria**:
- [ ] Skill documents `arete meeting extract` as preferred path
- [ ] Skill shows how to check for AI config: `arete credentials show --json`
- [ ] Skill keeps full agent extraction as fallback
- [ ] "Files this skill reads/writes" section updated

**Context**:
- Read: `packages/runtime/skills/process-meetings/SKILL.md` (current)
- Read: `packages/runtime/skills/PATTERNS.md` (skill patterns)

**Files to Modify**:
- `packages/runtime/skills/process-meetings/SKILL.md`

**Depends on**: Task 2

---

## Build Order

```
Task 1 (Core Formatters) ──► Task 2 (CLI Command) ──► Task 4 (Skill)
                          └──► Task 3 (Backend)
```

Tasks 2, 3, 4 can run in parallel after Task 1.

---

## Out of Scope

- Prompt consolidation (different in core vs backend — address in INT-1)
- Confidence scoring (INT-3)
- Quality tuning (INT-1)
- New extraction categories

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Type mismatch core/backend | Explicit adapter, don't unify types |
| Backend output regression | Snapshot test before/after |
| CLI LEARNINGS.md conflict | Explicitly update to reflect new architecture |
| AIService API mismatch | Verified: `call()`, `isConfigured()` exist |

---

## Testing Requirements

| Task | Tests Required |
|------|----------------|
| Task 1 | 8 unit tests for formatters |
| Task 2 | 12+ test cases for CLI command |
| Task 3 | Snapshot test for backend output |
| Task 4 | None (documentation only) |

**Quality Gate**: `npm run typecheck && npm test` must pass after each task.

---

## Definition of Done

- [ ] All 4 tasks complete
- [ ] All tests pass
- [ ] No typecheck errors
- [ ] LEARNINGS.md updated
- [ ] Skill updated
- [ ] Ready for INT-1 prompt consolidation
