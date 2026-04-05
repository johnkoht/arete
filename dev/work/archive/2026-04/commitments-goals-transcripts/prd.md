# PRD: Phase 4 Commitments + Goals

## Overview

**Problem**: Commitments have `projectSlug` but goals are now the primary work unit (Phase 2). Users want to see which goal a commitment supports and link them during extraction.

**Solution**: Add `goalSlug` field to Commitment type, show in CLI, allow manual linking during extraction.

**Success Criteria**:
1. Commitments can have goalSlug field
2. CLI shows goal associations: `[Q1-2] Send proposal`
3. During `arete meeting approve`, users can link action items to goals

---

## Out of Scope

- Heuristic goal inference (manual is sufficient for v1)
- Web UI goal linking (CLI first)
- Transcript merging (separate validation needed)
- Project→goal explicit mapping

---

## Tasks

### Task 1: Add goalSlug to Commitment type
**Description**: Add optional goalSlug field to Commitment type and ensure persistence.

**Acceptance Criteria**:
1. Add `goalSlug?: string` field to `Commitment` type in entities.ts
2. Update `CommitmentsFile` type to include goalSlug in serialization
3. CommitmentsService persists and retrieves goalSlug
4. Existing commitments.json files remain valid (field is optional)
5. Unit test: goalSlug serializes/deserializes correctly

**Files**: `packages/core/src/models/entities.ts`, `packages/core/src/services/commitments.ts`, `packages/core/test/services/commitments.test.ts`

---

### Task 2: Update CLI commitments list
**Description**: Show goalSlug in CLI output when present.

**Acceptance Criteria**:
1. Update `arete commitments list` output format
2. When goalSlug present: `[Q1-2] Send proposal to Acme (@jane, i_owe_them, 3d)`
3. When goalSlug absent: output unchanged (no empty brackets)
4. Update table/list formatting for both modes
5. Unit test: output format with and without goalSlug

**Files**: `packages/cli/src/commands/commitments.ts`

---

### Task 3: Manual goal linking during extraction
**Description**: Allow users to link action items to goals during staged extraction approval.

**Acceptance Criteria**:
1. During `arete meeting approve`, after showing action items, offer goal selection
2. Show available goals from `goals/*.md` (active status only, parse frontmatter)
3. Selection UI: numbered list `[1] Q1-2 Ship enterprise [2] Q1-3 ... [n] None`
4. If no goals exist, skip goal linking with message: "No active goals found, skipping goal linking"
5. Store selected goalSlug on committed commitments
6. For 1-2 goals, use inline prompt: "Link to Q1-2? [y/N]"
7. Update backend approval workflow to pass goalSlug through pipeline

**Files**: `packages/cli/src/commands/meeting.ts`, `packages/apps/backend/src/routes/meetings.ts`, `packages/apps/backend/src/services/agent.ts`

---

## Pre-Mortem Risks

| Risk | Mitigation |
|------|------------|
| Empty goals state | Graceful skip with message |
| Breaking existing commitments.json | Field is optional, no migration |
| CLI UX confusion | Simple numbered list, default to "none" |
| Web vs CLI inconsistency | Document as CLI-first |

---

## Metadata

- **Created**: 2026-03-19
- **Size**: Small (3 tasks)
- **Risk**: Low (additive schema change)
- **Dependencies**: Phase 2 (goals exist)
