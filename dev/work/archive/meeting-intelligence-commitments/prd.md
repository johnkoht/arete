# PRD: Phase 3 Agenda Lifecycle

## Overview

**Problem**: Daily-plan surfaces meetings but doesn't offer to create agendas. Agendas in `now/agendas/` stay there forever after meetings are processed. Incomplete workflow loop.

**Solution**: Daily-plan offers agenda creation for prep-worthy meetings. Process-meetings marks agendas as processed via frontmatter.

**Success Criteria**:
1. User runs daily-plan → sees agenda offers for prep-worthy meetings
2. User creates agenda → it appears linked in meeting list
3. User runs process-meetings → agenda is marked `status: processed`

---

## Out of Scope

- goalSlug on commitments (Phase 4)
- Goal inference during extraction (Phase 4)
- Transcript merging (Phase 4)
- File movement of agendas (using frontmatter instead)

---

## Tasks

### Task 1: Daily-plan offers agenda creation
**Description**: After listing meetings, identify prep-worthy ones and offer to create agendas inline.

**Acceptance Criteria**:
1. Detect prep-worthy meetings by title patterns: QBR, customer, leadership, review, partner, 1:1, planning, standup, sync
2. Check existence: Skip if agenda already exists matching `now/agendas/YYYY-MM-DD-*{title-slug}*`
3. Offer prompt: "Create agenda for [title]? [y/N]" — only for prep-worthy meetings without existing agendas
4. If yes, invoke prepare-meeting-agenda pattern with pre-filled context (date, title, attendees)
5. After agenda created, show link in meeting list: "→ [agenda](path)"
6. If all meetings have agendas or none are prep-worthy, skip the offer entirely

**Files**: `packages/runtime/skills/daily-plan/SKILL.md`

---

### Task 2: Archive agendas after processing
**Description**: In process-meetings, check if meeting has linked agenda and mark it as processed.

**Acceptance Criteria**:
1. Check meeting frontmatter for `agenda: path`
2. If agenda file exists, add to agenda file frontmatter: `status: processed`, `processed_at: YYYY-MM-DD`
3. Handle missing agenda gracefully (file deleted/moved manually) — log warning, continue
4. Output: "Archived N agendas" in process-meetings summary
5. No file movement — agenda stays in `now/agendas/`
6. If agenda already has `status: processed`, skip (idempotent)

**Files**: `packages/runtime/skills/process-meetings/SKILL.md`

---

## Pre-Mortem Risks

| Risk | Mitigation |
|------|------------|
| UX noise from agenda offers | Only offer for prep-worthy meetings |
| Data loss on archive | Frontmatter-only change, no file deletion |
| Conflict with existing agenda | Existence check before offering |
| Batch processing partial failure | Independent per-meeting processing |

---

## Metadata

- **Created**: 2026-03-19
- **Size**: Small (2 tasks)
- **Risk**: Low (skill markdown files only)
- **Dependencies**: `findMatchingAgenda()` exists for agenda linking
