# Phase 4: Commitments + Goals (Refined)

## Problem Statement

**Gap**: Commitments have `projectSlug` but goals are now the primary work unit (Phase 2). Users want to see which goal a commitment supports and link them during extraction.

## Key Findings from Reviews

1. **Cut heuristic inference** — No project→goal mapping exists, manual linking is fast enough for 3-5 goals
2. **Split from transcripts** — Transcript merge is unrelated problem for different user segment
3. **Validate transcripts separately** — Check if dual-source users exist before building

## Current State

- `Commitment` type has `projectSlug?: string` but no goal association
- Action item extraction doesn't offer goal linking
- CLI `commitments list` doesn't show goal context

## Target State

- `Commitment` type has `goalSlug?: string` (additive)
- Manual goal selection during staged extraction (pick from list)
- CLI shows goal associations: `[Q1-2] Send proposal to Acme`

---

## Plan (3 Tasks)

### Task 1: Add goalSlug to Commitment type
**Description**: Add optional goalSlug field to Commitment type and ensure persistence.

**Acceptance Criteria**:
1. Add `goalSlug?: string` field to `Commitment` type in entities.ts
2. Update `CommitmentsFile` type to include goalSlug
3. Update CommitmentsService to persist goalSlug
4. Existing commitments.json files remain valid (field is optional)
5. Unit test: goalSlug serializes/deserializes correctly

**Files**: `packages/core/src/models/entities.ts`, `packages/core/src/services/commitments.ts`

---

### Task 2: Update CLI commitments list
**Description**: Show goalSlug in CLI output when present.

**Acceptance Criteria**:
1. Update `arete commitments list` output format
2. When goalSlug present: `[Q1-2] Send proposal to Acme (@jane, i_owe_them, 3d)`
3. When goalSlug absent: `Send proposal to Acme (@jane, i_owe_them, 3d)` (unchanged)
4. Update table/list formatting for both modes (with/without goals)
5. Unit test: output format with and without goalSlug

**Files**: `packages/cli/src/commands/commitments.ts`

---

### Task 3: Manual goal linking during extraction
**Description**: Allow users to link action items to goals during staged extraction approval.

**Acceptance Criteria**:
1. During `arete meeting approve`, offer goal selection for each action item
2. Show available goals from `goals/*.md` (active status only)
3. Selection UI: numbered list or "none" option
4. If no goals exist, skip goal linking step with message
5. Store selected goalSlug on committed commitments
6. Update backend approval workflow to pass goalSlug through

**Files**: `packages/cli/src/commands/meeting.ts`, `packages/apps/backend/src/routes/meetings.ts`

---

## Out of Scope

- **Heuristic goal inference** — Manual is sufficient for v1, defer to Phase 5 if needed
- **Web UI goal linking** — CLI first, web UI in future iteration
- **Transcript merging** — Separate validation needed, defer to Phase 5
- **Project→goal mapping** — No explicit mapping in current model

---

## Size: Small (3 tasks)
## Risk Level: Low (additive schema change, CLI updates)

## Pre-Mortem Risks

| Risk | Mitigation |
|------|------------|
| Empty goals state | Skip goal linking with message |
| Breaking existing commitments.json | Field is optional, no migration |
| UX confusion | Simple numbered list selection |
| CLI vs web inconsistency | Document CLI-first, web later |

---

## Phase 5 Backlog (Deferred)

1. **Validate transcript merge use case**: Check dual-source user count
2. **Web UI goal linking**: Add goal dropdown to meeting triage
3. **Heuristic goal inference**: Only if users request it with usage data
4. **Project→goal explicit mapping**: If needed for inference
