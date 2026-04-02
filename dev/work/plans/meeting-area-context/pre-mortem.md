# Pre-Mortem: Meeting Area Context Integration

## Summary

6-step plan touching core services, backend API, web UI, and runtime skills. Primary risks center on suggestion algorithm complexity, UI state management, and skill orchestration modifications.

---

### Risk 1: Over-engineered Suggestion Algorithm

**Problem**: Step 2 (area suggestion service) could grow complex trying to achieve high accuracy. Temptation to add NLP, embeddings, or multi-signal weighting before validating basic approach works.

**Mitigation**: Start with simplest viable approach:
1. Exact match: meeting title matches `recurring_meetings[].title`
2. Fuzzy match: area name appears in meeting title or summary
3. Return `null` if no match (let user pick manually)

Add complexity only after observing real failure modes. No LLM calls in V1 — pure string matching.

**Verification**: Suggestion service code uses only string operations (no AI dependencies). Service returns `null` rather than low-confidence guesses.

---

### Risk 2: UI State Confusion (Suggested vs Confirmed)

**Problem**: Step 4-5 introduce "suggested area" state that's distinct from "confirmed area" (saved to frontmatter). Users may not understand when area is persisted. Race conditions if user changes area in sidebar while Process modal is open.

**Mitigation**: 
- Area in sidebar is **read-only display** (suggested badge shown)
- Area selection **only happens in Process modal** — single source of truth for confirmation
- Sidebar shows "Suggested: X" before processing, "Area: X" after processing
- No PATCH endpoint for area alone — area saved atomically with process request

**Verification**: No `PATCH /area` endpoint in Step 3. Sidebar area field is non-editable (visual only). Only Process modal can set area.

---

### Risk 3: Agent Skill Orchestration Complexity

**Problem**: Step 6 modifies `daily-winddown` and `process-meetings` skills which already have complex orchestration logic (phases, checkpoints, parallel subagents). Adding area confirmation step could break existing flow or add race conditions.

**Mitigation**:
- Add area confirmation as a **discrete checkpoint** after sync, before processing
- Keep it synchronous: "I found 3 meetings. Here are my area suggestions: [list]. Confirm or adjust?"
- Do NOT interleave area confirmation with per-meeting processing
- Batch confirmation: one prompt for all meetings, not N prompts

**Verification**: Skill modification adds exactly one checkpoint. No new parallel branches. Confirmation happens before any `processMeeting()` calls.

---

### Risk 4: Backend Save Timing (Area Before Processing)

**Problem**: Step 3 says "save area to frontmatter before processing begins." But current process endpoint starts extraction immediately. If save fails, extraction runs without area context. If save succeeds but extraction fails, area is persisted for unprocessed meeting.

**Mitigation**:
- Process endpoint flow: validate area → save to frontmatter → start extraction
- If area save fails, return 400 (don't start processing)
- If extraction fails, area remains in frontmatter (acceptable — user can reprocess)
- Add `area` to process request body, not separate endpoint

**Verification**: Process endpoint handler: `saveAreaToFrontmatter()` before `runProcessingSession()`. Error from save returns early.

---

### Risk 5: Missing Test Coverage for Area Flow

**Problem**: New service, endpoints, and UI hooks need tests. `meeting-context.ts` has good tests but area suggestion is new. Could ship with gaps that cause regressions.

**Mitigation**:
- Step 1: Add tests for `buildMeetingContext` with explicit area field (fallback to title matching)
- Step 2: Unit tests for suggestion service (exact match, fuzzy match, no match cases)
- Step 3: Integration test for process endpoint with area param
- Follow existing patterns: `meeting-context.test.ts`, `meeting-extraction.test.ts`

**Verification**: Each step's PR includes tests. Test files: `area-suggestion.test.ts` (new), `meeting-context.test.ts` (updated), `meetings.test.ts` (backend).

---

### Risk 6: Frontend API/Hook Pattern Deviation

**Problem**: Web frontend has strict patterns (API functions in `src/api/`, hooks in `src/hooks/`, types in `src/api/types.ts`). Step 4-5 add new API calls and UI components. Deviation from patterns causes tech debt.

**Mitigation**:
- Add `suggestArea` and `processWithArea` to `src/api/meetings.ts` (existing file)
- Add types to `src/api/types.ts` (not inline)
- Extend existing `useProcessMeeting` hook, don't create new hook
- MetadataPanel changes: add field inline, don't extract new component

**Verification**: No new files in `src/api/` or `src/hooks/`. Check imports follow existing pattern (types from `types.ts`).

---

### Risk 7: Frontmatter Schema Evolution

**Problem**: Adding `area` field to meeting frontmatter. Existing meetings don't have it. Could cause parsing errors or undefined behavior if code assumes field exists.

**Mitigation**:
- `area` is optional (`area?: string`) in all types
- `buildMeetingContext` gracefully handles missing area (falls back to title matching — existing behavior)
- No migration needed — new field appears only on newly processed meetings

**Verification**: `MeetingForSave.area` is optional. `parseMeetingFile()` doesn't error on missing area. Existing meeting tests pass without modification.

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation Priority |
|------|-----------|--------|---------------------|
| Over-engineered suggestion | High | Medium | High (scope creep) |
| UI state confusion | Medium | High | High (user experience) |
| Skill orchestration breakage | Medium | High | High (existing feature) |
| Save timing issues | Low | Medium | Medium |
| Missing test coverage | Medium | Medium | Medium |
| Frontend pattern deviation | Low | Low | Low |
| Frontmatter schema | Low | Low | Low |

---

## Pre-Implementation Checklist

Before starting each step, verify:

- [ ] **Step 1**: Read `meeting-context.ts` and `meeting-context.test.ts` for existing area lookup
- [ ] **Step 2**: Read `area-parser.ts` for area matching patterns; keep suggestion simple
- [ ] **Step 3**: Read `meetings.ts` route for existing process endpoint; understand job/SSE flow
- [ ] **Step 4-5**: Read `MeetingDetail.tsx`, `MetadataPanel.tsx`, `types.ts` for UI patterns
- [ ] **Step 6**: Read full `daily-winddown/SKILL.md` and `process-meetings/SKILL.md` before modifying

---

## Summary

**7 risks identified** across: Scope Creep (1), Integration (3), Code Quality (2), Dependencies (1)

**Highest priority mitigations**:
1. Keep suggestion algorithm simple (string matching only)
2. Area confirmation in Process modal only (no sidebar editing)
3. Single checkpoint in skills (batch confirmation)

**Ready to proceed with these mitigations?**
