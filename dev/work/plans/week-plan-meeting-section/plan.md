---
title: Week Plan Meeting Section
slug: week-plan-meeting-section
status: complete
size: large
tags: []
created: 2026-03-30T02:55:38.934Z
updated: 2026-03-30T06:01:00.961Z
completed: 2026-03-30T06:01:00.961Z
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 6
---

# Restore Key Meetings Section to Week Plan

## Problem

The week-plan skill has a broken user interaction: Step 2.5 asks users to confirm "key meetings this week" for memory search, but then **discards the confirmation**. The meetings evaporate — they're never written to `week.md`.

Meanwhile, we have `inferMeetingImportance()` that categorizes meetings as `important`, `normal`, or `light` based on organizer status, attendee count, and agenda presence. This is only used in Fathom/Krisp pulls — not in week planning.

**Core insight**: If you ask the user to confirm something, it should appear somewhere. Confirmation without output is wasted interaction.

## Solution

1. Expose meeting importance via `arete pull calendar --json`
2. Update Step 2.5 to auto-classify and capture confirmed meetings
3. Write a `## Key Meetings` section to `week.md`

The user sees prep-worthy meetings grouped by priority, confirms quickly, and gets them captured in their weekly plan.

## Success Criteria

- Users see key meetings grouped by importance level with clear "why" explanations
- Confirmed meetings appear in `week.md` with checkboxes for prep tracking
- Importance inference drives selection (not just title heuristics)
- `pullCalendar` has test coverage (currently zero)

---

Plan:

1. **Extract pullCalendar helper with test suite (TDD)**
   - Extract logic into testable helper function with dependency injection
   - Write tests simultaneously using mock calendar provider
   - Follow existing `pullNotion` pattern: `PullCalendarDeps` type with injectable provider
   - File: `packages/cli/src/commands/pull.ts`, `packages/cli/test/commands/pull.test.ts`
   - AC:
     - [ ] `pullCalendarHelper()` function exported with optional `deps` parameter
     - [ ] Test: `--json` returns success and events array structure
     - [ ] Test: event objects contain required fields (title, startTime, endTime, calendar, attendees)
     - [ ] Test: `--today` flag filters correctly
     - [ ] Test: calendar not configured returns JSON error
     - [ ] All tests use mock provider via dependency injection
     - [ ] Existing CLI behavior unchanged

2. **Add importance, organizer, and notes to JSON output**
   - Call `inferMeetingImportance()` for each event during calendar pull
   - Resolve `WorkspacePaths` and use `services.storage.list()` for agenda lookup
   - Surface all CalendarEvent fields in JSON
   - Document JSON output structure in code comment for Step 3 reference
   - Files: `packages/cli/src/commands/pull.ts`
   - AC:
     - [ ] JSON includes `importance: 'light' | 'normal' | 'important'` per event
     - [ ] JSON includes `organizer: { name, email, self } | null`
     - [ ] JSON includes `notes: string | null`
     - [ ] `hasAgenda` passed to inference when agenda file exists (via `services.storage.list()`)
     - [ ] `WorkspacePaths` resolved to find `now/agendas/` directory
     - [ ] Code comment documents JSON output structure for skill reference
     - [ ] Test: 1:1 (2 attendees) → `important`
     - [ ] Test: large meeting (5+ attendees, not organizer) → `light`
     - [ ] Test: event without organizer (ical-buddy) computes importance via attendee count
     - [ ] Test: event with matching agenda upgrades `light` → `normal`

3. **Update week-plan skill to capture key meetings**
   - Modify Step 2.5 to auto-classify using importance field from calendar JSON
   - Group meetings by priority level with "why" explanations
   - Store confirmed list in working state for Step 4 output
   - File: `packages/runtime/skills/week-plan/SKILL.md`
   - AC:
     - [ ] Meetings grouped: "High priority" (important) vs "Prep-worthy" (normal with agenda/external)
     - [ ] Each meeting shows *why* flagged: (1:1), (you organized), (has agenda), (external stakeholder)
     - [ ] User can add/remove/skip with quick confirmation
     - [ ] Explicit instruction: "Keep this confirmed list for Step 4 output"
     - [ ] If no key meetings: "No high-priority meetings this week — light calendar!"
     - [ ] `light` importance meetings hidden unless user asks

4. **Add Key Meetings section to week template and docs**
   - New section between Weekly Priorities and Today
   - Checkbox format for prep tracking
   - Link to agenda file when it exists
   - Update catalog with new capability
   - Files: `packages/runtime/skills/week-plan/templates/week-priorities.md`, `packages/runtime/skills/week-plan/LEARNINGS.md`, `dev/catalog/capabilities.json`
   - AC:
     - [ ] Template includes `## Key Meetings` section with format comments
     - [ ] Format: `- [ ] Day Time: Title (attendees) — prep: [link] or "prep needed"`
     - [ ] Section omitted if no prep-worthy meetings (no empty section)
     - [ ] LEARNINGS.md updated with section semantics and pre-edit checklist
     - [ ] `dev/catalog/capabilities.json` updated to document new JSON fields in calendar pull
     - [ ] Manual QA: run `arete pull calendar --json` and verify new fields appear
     - [ ] Manual QA: run week-plan end-to-end and verify Key Meetings appears in output file

---

## Example Output

After running week-plan:

```markdown
# Week — Mon Mar 24, 2026

## Weekly Priorities
1. POP ready for 3/31 launch [Q1-1]
2. CoverWhale through compliance [Q1-3]

## Key Meetings
- [ ] Tue 2:00pm: Lindsay 1:1 — prep needed
- [ ] Wed 3:00pm: CoverWhale QBR (Sarah, Jamie) — prep: [agenda](now/agendas/coverwhale-qbr.md)
- [ ] Fri 11:00am: UK Roadmap Review (Product team) — prep needed

## Today — Mon Mar 24
...
```

---

## Out of Scope

- Web UI changes for meeting prep tracking
- Changing importance inference rules (already well-designed)
- Auto-creating prep tasks (use `meeting-prep` skill instead)
- Deep agenda file integration beyond linking
- Versioning of JSON output format (fields are additive)

## Size Estimate

**Small** (4 steps) — Steps 1-2 are CLI changes with tests; Steps 3-4 are skill/template updates.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **R1**: ical-buddy has no `organizer` field | High | Medium | `inferMeetingImportance()` uses `?.` safely; falls back to attendee rules. Add explicit test. |
| **R2**: Refactoring pullCalendar breaks behavior | Medium | High | TDD approach: write tests while extracting helper. Run full suite after. |
| **R3**: Too many meetings flagged as "important" | Medium | Low | Only show `important` + `normal`-with-agenda; hide `light` entirely. |
| **R4**: Agenda file lookup slow | Low | Low | Use `services.storage.list()` once, build Set for O(1) lookup. |
| **R5**: Existing week.md files lack new section | Medium | Low | Section is additive; skill creates it on next run. |
| **R6**: Skill doesn't capture confirmed list | Medium | Medium | Explicit instruction in Step 3; manual QA in Step 4 to verify end-to-end. |

## Files to Modify

| File | Change |
|------|--------|
| `packages/cli/src/commands/pull.ts` | Extract helper, add importance/organizer/notes fields |
| `packages/cli/test/commands/pull.test.ts` | Add `describe('arete pull calendar')` test suite |
| `packages/runtime/skills/week-plan/SKILL.md` | Update Step 2.5 for grouped display and state capture |
| `packages/runtime/skills/week-plan/templates/week-priorities.md` | Add Key Meetings section |
| `packages/runtime/skills/week-plan/LEARNINGS.md` | Document section semantics |
| `dev/catalog/capabilities.json` | Document new calendar pull JSON fields |

## Test Strategy

| Test | Location | Covers |
|------|----------|--------|
| pullCalendar helper + existing behavior | `pull.test.ts` | TDD in Step 1 |
| pullCalendar with importance | `pull.test.ts` | New fields, provider-agnostic |
| inferMeetingImportance | Already exists (10 tests) | No changes needed |
| Provider edge cases (no organizer) | `pull.test.ts` | ical-buddy path |
| Manual QA | Step 4 | End-to-end verification |