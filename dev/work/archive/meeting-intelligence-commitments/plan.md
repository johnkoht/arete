---
title: Agenda Lifecycle (Phase 3)
slug: meeting-intelligence-commitments
status: complete
archived: 2026-03-23
size: small
tags: [meetings, agendas, lifecycle]
created: 2026-03-18T00:00:00.000Z
completed: 2026-03-18T00:00:00.000Z
---

# Phase 3: Agenda Lifecycle (Refined)

## Problem Statement

**Gap**: Daily-plan surfaces meetings but doesn't offer to create agendas. Agendas in `now/agendas/` stay there forever after meetings. Users must manually manage the agenda lifecycle.

**Impact**: Incomplete workflow loop. Users create agendas that never get linked to meetings or archived.

## Key Findings from Reviews

1. **Task 2 already exists** — `findMatchingAgenda()` in `packages/core/src/integrations/meetings.ts` already links agendas to meetings at sync time
2. **Don't move files** — Archive via frontmatter `status: processed`, not file movement
3. **Defer commitments/transcripts** — Phase 4 scope

## Current State

- `prepare-meeting-agenda` creates agendas in `now/agendas/YYYY-MM-DD-*.md`
- `findMatchingAgenda()` links agendas to meetings during Fathom/Krisp sync
- Daily-plan shows meetings but doesn't offer agenda creation
- Agendas remain indefinitely, no archival

## Target State

- Daily-plan offers to create agendas for prep-worthy meetings
- Agendas are marked `status: processed` after meeting is processed
- Complete workflow: create → use → archive

---

## Plan

### Task 1: Daily-plan offers agenda creation

**Description**: After listing meetings in daily-plan, identify which ones benefit from prep and offer to create agendas inline.

**Acceptance Criteria**:
1. Detect prep-worthy meetings by title patterns: QBR, customer, leadership, review, partner, 1:1, planning
2. Check existence: Skip if agenda already exists matching `now/agendas/YYYY-MM-DD-*{title-slug}*`
3. Offer: "Create agenda for [title]? [y/N]" — only for prep-worthy meetings without existing agendas
4. If yes, invoke prepare-meeting-agenda with pre-filled context (date, title, attendees from calendar)
5. After agenda created, show link in meeting list: "→ [agenda](path)"

**Files**: `packages/runtime/skills/daily-plan/SKILL.md`

---

### Task 2: Archive agendas after processing

**Description**: In process-meetings, check if meeting has linked agenda and mark it as processed.

**Acceptance Criteria**:
1. Check meeting frontmatter for `agenda: path`
2. If agenda exists, add to agenda file frontmatter:
   - `status: processed`
   - `processed_at: YYYY-MM-DD`
3. Handle missing agenda gracefully (file deleted/moved manually) — log warning, continue
4. Output: "Archived N agendas" in process-meetings summary
5. No file movement — agenda stays in `now/agendas/`

**Files**: `packages/runtime/skills/process-meetings/SKILL.md`

---

## Out of Scope (Deferred to Phase 4)

- **goalSlug on commitments** — Schema change, useful but not urgent
- **Goal inference during extraction** — Needs clearer strategy, heuristic-only
- **Transcript merging** — Power user feature, already partially implemented
- **Agenda display filtering** — `--include-processed` flag for listing agendas

---

## Size: Small (2 tasks)
## Risk Level: Low

Both tasks are skill-level changes (markdown files). No code changes, no migrations, no data model changes.

## Pre-Mortem Risks

| Risk | Mitigation |
|------|------------|
| UX noise from agenda offers | Only offer for prep-worthy meetings |
| Data loss on archive | Frontmatter-only change, no file movement |
| Conflict with existing agenda | Existence check before offering |
| Batch processing partial failure | Independent per-meeting processing |

---

## Dependencies

- Phase 2 complete (goals exist for future linking)
- `findMatchingAgenda()` already implemented (Task 2 of original plan was cut)

## Success Criteria

1. User runs daily-plan → sees agenda offers for prep-worthy meetings
2. User creates agenda → it appears linked in daily-plan meeting list
3. User runs process-meetings → agenda is marked `status: processed`
4. Complete lifecycle without manual file management
