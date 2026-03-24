# Pre-Mortem: Phase 3 Meeting Intelligence

**Date**: 2026-03-19
**Plan**: `meeting-intelligence-commitments/plan.md`
**Risk Level**: Medium

---

## Key Findings from Reviews

### PM Review Findings

1. **Task 2 may already exist** — `findMatchingAgenda()` in meetings.ts
2. **Phase 3A (Agenda Lifecycle) is highest value** — completes meeting workflow loop
3. **Task 5 (goal inference) is speculative** — no clear inference strategy
4. **Recommend shipping 3A alone** — defer 3B/3C to Phase 4

### Engineering Review Findings

1. **Task 2 IS ALREADY IMPLEMENTED** — Remove from PRD
2. **Task 3 should archive via frontmatter** — Don't move files
3. **Task 5 should be heuristic-only** — No LLM for v1
4. **Transcript merging format exists** — Just needs merge logic

---

## Refined Scope

### Phase 3 (Agenda Lifecycle Only)

| Task | Description | Status |
|------|-------------|--------|
| ~~Task 2~~ | Link agendas to meetings | ❌ CUT (already exists) |
| Task 1 | Daily-plan offers agenda creation | ✅ Keep |
| Task 3 | Archive agendas after processing | ✅ Keep (via frontmatter, not move) |

### Deferred to Phase 4

| Task | Reason |
|------|--------|
| Task 4 | goalSlug schema — useful but not urgent |
| Task 5 | Goal inference — speculative, needs clearer strategy |
| Tasks 6-7 | Transcript merging — power user feature, low priority |

---

## Risk Analysis (Refined Scope)

### 1. Daily-plan UX Disruption
**Category**: User Experience
**Severity**: Medium
**Likelihood**: Medium

**Scenario**: Adding "Would you like to create agendas?" prompt after every meeting list feels noisy. Users who never create agendas get friction.

**Mitigation**:
- [ ] Only offer for "prep-worthy" meetings (QBR, customer, leadership)
- [ ] Skip prompt if all meetings already have agendas
- [ ] Make offer skippable with "never ask again" option

---

### 2. Agenda Archive Data Loss
**Category**: Data Integrity
**Severity**: High
**Likelihood**: Low

**Scenario**: User processes a meeting, agenda is archived. They want to reference the agenda later but can't find it.

**Mitigation**:
- [ ] Archive via frontmatter `status: processed`, not file move
- [ ] Keep agenda file in place
- [ ] Agenda link in meeting frontmatter remains valid

---

### 3. Agenda Already Exists Conflict
**Category**: Implementation
**Severity**: Medium
**Likelihood**: Medium

**Scenario**: User runs daily-plan, it offers to create agenda, but an agenda already exists from yesterday. What happens?

**Mitigation**:
- [ ] Check `now/agendas/YYYY-MM-DD-*` before offering
- [ ] If exists, show "Agenda exists → [link]" instead of create offer
- [ ] If user wants to recreate, prompt confirmation

---

### 4. Meeting File Doesn't Exist
**Category**: Implementation
**Severity**: Medium
**Likelihood**: Medium

**Scenario**: User creates agenda in morning, but meeting file isn't created until they run `arete pull fathom` after the meeting. How do we link them?

**Mitigation**:
- [ ] `findMatchingAgenda()` already handles this at sync time
- [ ] Agenda filename includes date + title slug for matching
- [ ] Document: "Agendas are auto-linked when meetings are synced"

---

### 5. Process-Meetings Batch Partial Failure
**Category**: Implementation
**Severity**: Low
**Likelihood**: Low

**Scenario**: User processes 5 meetings, 2 have agendas, 3 don't. Archive logic must handle partial set.

**Mitigation**:
- [ ] Process each meeting independently
- [ ] Archive only agendas for successfully processed meetings
- [ ] Log: "Archived N agendas"

---

## Summary

| # | Risk | Severity | Mitigation Required |
|---|------|----------|---------------------|
| 1 | UX noise | Medium | Yes — smart filtering |
| 2 | Data loss | High | Yes — frontmatter archive |
| 3 | Conflict | Medium | Yes — existence check |
| 4 | Missing meeting | Medium | Documented (already works) |
| 5 | Batch failure | Low | Yes — independent processing |

**Mitigations Required**: 4 (Risks 1-3, 5)
**Mitigations Already Handled**: 1 (Risk 4)

---

## Revised Task List

### Phase 3: Agenda Lifecycle (2 tasks)

**Task 1: Daily-plan offers agenda creation**
- Add step after meeting list
- Only offer for prep-worthy meetings (QBR, customer, leadership)
- Skip if agenda already exists
- Delegate to prepare-meeting-agenda pattern

**Task 2: Archive agendas after processing**
- In process-meetings, check for linked agenda
- Add `status: processed` to agenda frontmatter
- Log "Archived N agendas"
- No file movement

### Acceptance Criteria Refinements

**Task 1 ACs**:
1. Prep-worthy meeting detection: titles containing QBR, customer, leadership, 1:1, standup
2. Existence check: `now/agendas/YYYY-MM-DD-*` pattern matching
3. Offer prompt: "Create agenda for [title]? [y/N]"
4. If yes, invoke prepare-meeting-agenda with pre-filled context (date, title, attendees)

**Task 2 ACs**:
1. Check meeting frontmatter for `agenda: path`
2. Add `status: processed` to agenda file frontmatter
3. Add `processed_at: YYYY-MM-DD` timestamp
4. Handle missing agenda gracefully (file deleted/moved manually)
