# PRD: Restore Key Meetings Section to Week Plan

## Goal

Restore a `## Key Meetings` section to the week-plan skill output by exposing `inferMeetingImportance()` in the calendar pull JSON and updating the skill workflow to capture and display prep-worthy meetings. Users will see key meetings grouped by importance level with "why" explanations, captured in `week.md` with checkboxes for prep tracking.

## Background

The week-plan skill has a broken user interaction: Step 2.5 asks users to confirm "key meetings this week" but then discards the confirmation. The meetings evaporate — they're never written to `week.md`.

Meanwhile, `inferMeetingImportance()` exists in `packages/core/src/integrations/meetings.ts` with 10 tests, but it's only used during Fathom/Krisp pulls — not in week planning.

**Core insight**: If you ask the user to confirm something, it should appear somewhere. Confirmation without output is wasted interaction.

## Memory Context

From recent builds and LEARNINGS.md:

1. **Follow `PullNotionDeps` pattern** — Use dependency injection for testability. See `pull.ts` and `packages/cli/src/commands/LEARNINGS.md`.
2. **`inferMeetingImportance()` is well-tested** — 10 tests, handles missing organizer gracefully via `?.`
3. **Explicit file paths with line numbers** — Helps subagents hit the ground running
4. **Pre-work sanity checks are mandatory** — Reviewer must verify task clarity before developer starts

## Pre-Mortem Risks

Reference: `dev/work/plans/week-plan-meeting-section/pre-mortem.md`

| Risk | Mitigation |
|------|------------|
| R1: No test patterns for pullCalendar | Follow `PullNotionDeps` pattern exactly |
| R2: CLI→Skill JSON format mismatch | Document JSON output shape in code comment |
| R3: Provider-specific behavior untested | Explicit ical-buddy test case (no organizer) |
| R8: Refactor breaks existing behavior | Tests pass before AND after refactor |

---

## Task 1: Extract pullCalendar Helper with Test Suite (TDD)

**Description**: Extract the `pullCalendar` function into a testable helper with dependency injection, and write tests simultaneously using a mock calendar provider.

**Files to modify**:
- `packages/cli/src/commands/pull.ts` — Extract `pullCalendarHelper()` function
- `packages/cli/test/commands/pull.test.ts` — Add `describe('arete pull calendar')` test suite

**Context to read**:
- `packages/cli/src/commands/pull.ts` L150-250 (current pullCalendar implementation)
- `packages/cli/test/commands/pull.test.ts` (existing Notion tests for pattern reference)
- `packages/cli/src/commands/LEARNINGS.md` (CLI command patterns, dependency injection)

**Pattern to follow**:
- `PullNotionDeps` type at `pull.ts` L30-40 — use same pattern for `PullCalendarDeps`
- Mock provider pattern from `pullNotion` tests

**Pre-mortem mitigations**: R1 (test patterns), R8 (refactor safety)

**Acceptance Criteria**:
- [ ] `PullCalendarDeps` type exported with `getCalendarProviderFn` and `loadConfigFn`
- [ ] `pullCalendarHelper()` function exported with optional `deps` parameter
- [ ] Test: `--json` returns `{ success: true, events: [...] }` structure
- [ ] Test: event objects contain required fields (title, startTime, endTime, calendar, attendees)
- [ ] Test: `--today` flag filters to today's events only
- [ ] Test: calendar not configured returns JSON error with helpful message
- [ ] All tests use mock provider via dependency injection
- [ ] Existing CLI behavior unchanged (run `arete pull calendar --json` manually to verify)

---

## Task 2: Add Importance, Organizer, and Notes to JSON Output

**Description**: Call `inferMeetingImportance()` for each calendar event and add `importance`, `organizer`, and `notes` fields to the JSON output. Include `hasAgenda` check by looking for matching files in `now/agendas/`.

**Files to modify**:
- `packages/cli/src/commands/pull.ts` — Import `inferMeetingImportance`, add fields to JSON

**Context to read**:
- `packages/core/src/integrations/meetings.ts` L1-50 (`inferMeetingImportance` function signature and rules)
- `packages/core/src/integrations/calendar/types.ts` (`CalendarEvent` interface)
- `packages/cli/src/commands/pull.ts` (current JSON output mapping around L200)

**Pattern to follow**:
- `enrichedEvents` mapping at `pull.ts` L190-220 — extend with new fields

**Pre-mortem mitigations**: R2 (JSON format), R3 (provider handling), R4 (agenda lookup)

**Acceptance Criteria**:
- [ ] JSON output includes `importance: 'light' | 'normal' | 'important'` per event
- [ ] JSON output includes `organizer: { name, email, self } | null`
- [ ] JSON output includes `notes: string | null`
- [ ] `WorkspacePaths` resolved to find `now/agendas/` directory
- [ ] `hasAgenda` passed to `inferMeetingImportance()` when agenda file exists for event
- [ ] Use `services.storage.list()` for agenda lookup (not direct `fs`)
- [ ] Code comment documents JSON output structure for skill reference:
  ```typescript
  // JSON Output Structure (for skill consumption):
  // { success: true, events: [{ title, startTime, endTime, calendar, location,
  //   isAllDay, attendees, importance, organizer, notes }] }
  ```
- [ ] Test: 1:1 meeting (2 attendees) outputs `importance: 'important'`
- [ ] Test: large meeting (5+ attendees, not organizer) outputs `importance: 'light'`
- [ ] Test: event without organizer (ical-buddy) computes importance via attendee count
- [ ] Test: event with matching agenda file upgrades `light` → `normal`

---

## Task 3: Update Week-Plan Skill to Capture Key Meetings

**Description**: Modify the week-plan skill's Step 2.5 to use the `importance` field from calendar JSON, group meetings by priority level, and capture the confirmed list for output in Step 4.

**Files to modify**:
- `packages/runtime/skills/week-plan/SKILL.md` — Update Step 2.5 and Step 4

**Context to read**:
- `packages/runtime/skills/week-plan/SKILL.md` (current Step 2.5 "Surface Key Meetings")
- `packages/runtime/skills/week-plan/LEARNINGS.md` (section semantics)

**Acceptance Criteria**:
- [ ] Step 2.5 updated to parse `importance` field from `arete pull calendar --json` output
- [ ] Meetings grouped: "🔴 High priority" (`important`) vs "🟡 Prep-worthy" (`normal` with agenda/external)
- [ ] Each meeting shows *why* flagged: (1:1), (you organized), (has agenda), (external stakeholder)
- [ ] User can add/remove/skip meetings with quick confirmation
- [ ] Explicit instruction added: "Keep this confirmed list for Step 4 output"
- [ ] Step 4 updated to write `## Key Meetings` section using confirmed list
- [ ] Empty state handled: "No high-priority meetings this week — light calendar!"
- [ ] `light` importance meetings hidden unless user explicitly asks
- [ ] Fallback: if calendar JSON lacks `importance` field, fall back to title matching (QBR, customer, 1:1)

---

## Task 4: Add Key Meetings Section to Week Template and Documentation

**Description**: Add the `## Key Meetings` section to the week template, update LEARNINGS.md with section semantics, and update the capability catalog.

**Files to modify**:
- `packages/runtime/skills/week-plan/templates/week-priorities.md` — Add Key Meetings section
- `packages/runtime/skills/week-plan/LEARNINGS.md` — Document section semantics
- `dev/catalog/capabilities.json` — Update calendar pull capability with new JSON fields

**Context to read**:
- `packages/runtime/skills/week-plan/templates/week-priorities.md` (current template structure)
- `packages/runtime/skills/week-plan/LEARNINGS.md` (Section Semantics table)
- `dev/catalog/capabilities.json` (existing calendar entries)

**Acceptance Criteria**:
- [ ] Template includes `## Key Meetings` section between Weekly Priorities and Today
- [ ] Section format with comments:
  ```markdown
  ## Key Meetings
  <!-- Prep-worthy meetings this week. Check off when prep is complete. -->
  <!-- Format: - [ ] Day Time: Title (attendees) — prep: [link] or "prep needed" -->
  <!-- Omit this section if no key meetings this week. -->
  ```
- [ ] LEARNINGS.md section table updated with Key Meetings row:
  - Purpose: Prep-worthy meetings flagged by importance inference
  - Format: Checkboxes with day/time/title/attendees/prep status
  - Populated by: week-plan skill (Step 2.5 → Step 4)
- [ ] LEARNINGS.md pre-edit checklist updated to include Key Meetings parsing check
- [ ] `dev/catalog/capabilities.json` updated with new calendar pull JSON fields (importance, organizer, notes)
- [ ] Manual QA: run `arete pull calendar --json` and verify new fields appear
- [ ] Manual QA: run week-plan end-to-end and verify Key Meetings appears in output file

---

## Success Criteria

1. `arete pull calendar --json` includes `importance`, `organizer`, `notes` fields
2. Week-plan skill surfaces key meetings grouped by importance with "why" explanations
3. Confirmed meetings appear in `week.md` with checkboxes for prep tracking
4. All new code has test coverage
5. Documentation updated (LEARNINGS.md, capabilities.json)

## Out of Scope

- Web UI changes for meeting prep tracking
- Changing importance inference rules
- Auto-creating prep tasks (use `meeting-prep` skill instead)
- Deep agenda file integration beyond linking
