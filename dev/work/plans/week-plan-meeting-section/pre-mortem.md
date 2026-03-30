# Pre-Mortem: Week Plan Meeting Section

## Summary

**Plan**: Restore Key Meetings section to week-plan skill using `inferMeetingImportance()`
**Steps**: 5 (CLI test infrastructure → refactor → add fields → skill update → template)
**Primary Risk Areas**: Test patterns (greenfield), Integration (CLI→Skill dependency), Provider differences

---

### Risk 1: No Existing Test Patterns for pullCalendar

**Problem**: `pull.ts` has zero test coverage for calendar functionality. Unlike `pullNotion` which has established patterns, there's no existing test infrastructure to follow. Steps 1-2 require creating test patterns from scratch, which could lead to inconsistent mocking approaches or tests that don't match the codebase style.

**Mitigation**:
- Before Step 1, read `packages/cli/test/commands/pull.test.ts` to understand existing Notion test patterns
- Follow the `PullNotionDeps` injection pattern exactly for `PullCalendarDeps`
- Use the same mock services setup (look for `createMockServices` or similar helpers)
- Reference `packages/core/test/integrations/meetings.test.ts` for calendar event fixture shapes

**Verification**: 
- [ ] Step 1 tests use same `describe`/`it` structure as Notion tests
- [ ] Mock provider follows same shape as real `CalendarProvider` interface
- [ ] All 4 test scenarios specified in ACs are implemented

---

### Risk 2: CLI→Skill Integration Gap

**Problem**: Steps 1-3 modify CLI JSON output. Step 4 modifies the skill to consume that output. If the JSON format doesn't match what the skill expects (e.g., field naming, null vs undefined, nested structure), the skill instructions will be wrong and agents will fail silently or produce incorrect output.

**Mitigation**:
- After Step 3 completes, document exact JSON output shape in a comment block
- In Step 4 skill update, explicitly reference the JSON field names and types
- Include example JSON snippet in SKILL.md showing what calendar pull returns
- Test manually: run `arete pull calendar --days 7 --json` and verify fields exist

**Verification**:
- [ ] Step 3 includes JSON output example in PR description
- [ ] Step 4 SKILL.md references exact field names (`importance`, `organizer`, `notes`)
- [ ] Manual test of `arete pull calendar --json` shows new fields

---

### Risk 3: Provider-Specific Behavior Untested

**Problem**: ical-buddy and Google Calendar have different data available. ical-buddy lacks `organizer.self`, which affects importance inference. Step 3 adds tests but may only test the "happy path" with full organizer data, missing the ical-buddy case where organizer is undefined.

**Mitigation**:
- Step 3 must include explicit test case: "event without organizer computes importance via attendee count"
- Create two mock event fixtures: `googleCalendarEvent` (with organizer) and `icalBuddyEvent` (without)
- Verify that `inferMeetingImportance()` handles `undefined` organizer gracefully (it does via `?.`)

**Verification**:
- [ ] Test file includes `describe('provider-agnostic handling')` block
- [ ] Test verifies 1:1 meeting without organizer still returns `important`
- [ ] Test verifies large meeting without organizer returns `light`

---

### Risk 4: Agenda Lookup Performance

**Problem**: Step 3 adds `hasAgenda` check by looking for matching files in `now/agendas/`. If done naively (one `fs.existsSync` per event), this adds I/O overhead. For a week with 30 meetings, that's 30 filesystem checks.

**Mitigation**:
- Read `now/agendas/` directory once at start of calendar pull
- Build a Set of existing agenda slugs
- Check event titles against the Set (O(1) lookup)
- Use `services.storage.list()` (StorageAdapter) not raw `fs`

**Verification**:
- [ ] Agenda lookup uses single directory read, not per-event file checks
- [ ] Uses StorageAdapter pattern, not direct `fs` import
- [ ] Performance acceptable for 50+ meetings (no visible delay)

---

### Risk 5: Skill "State" Concept Not Formalized

**Problem**: Step 4 AC says "Confirmed list passed to Step 4 for output" but skills are stateless prompt instructions — there's no formal "state" mechanism. The skill workflow implies the agent maintains context across steps, but this is implicit, not explicit.

**Mitigation**:
- Clarify in SKILL.md that the agent should keep the confirmed meetings list in working memory
- Use explicit language: "After user confirms, remember this list for Step 4"
- Don't introduce new state mechanisms — rely on conversation context
- Consider adding a "scratchpad" section approach if needed

**Verification**:
- [ ] Step 4 SKILL.md uses clear language about maintaining confirmed list
- [ ] No new state files or mechanisms introduced
- [ ] Manual test: run week-plan and verify confirmed meetings appear in output

---

### Risk 6: Template Section Ordering Conflicts

**Problem**: Step 5 adds `## Key Meetings` between Weekly Priorities and Today. If daily-plan or other skills also modify week.md, section ordering assumptions could conflict. The LEARNINGS.md documents section semantics but skills may not read it.

**Mitigation**:
- Update LEARNINGS.md section table with Key Meetings (as planned)
- Add Key Meetings to the section order invariant
- Check daily-plan SKILL.md for any week.md modification logic
- Verify no other skill assumes Today immediately follows Weekly Priorities

**Verification**:
- [ ] LEARNINGS.md section table includes Key Meetings row
- [ ] daily-plan SKILL.md doesn't hardcode section positions
- [ ] Template comments explain section order

---

### Risk 7: Empty Section Edge Case

**Problem**: Step 5 AC says "Section omitted if no prep-worthy meetings." But the template file must include the section for the skill to populate it. How does "omit" work when the template has the section? This could lead to an empty `## Key Meetings` section in output.

**Mitigation**:
- Template includes section with conditional comment: `<!-- Omit if empty -->`
- Skill instructions (Step 4) explicitly say: "If no prep-worthy meetings, do not write the Key Meetings section"
- This is a skill-level decision, not template-level — template provides format, skill decides inclusion

**Verification**:
- [ ] SKILL.md Step 4 includes explicit "omit if empty" instruction
- [ ] Template comment clarifies this is optional section
- [ ] Manual test: week-plan with no important meetings produces no Key Meetings section

---

### Risk 8: Refactor Breaks Existing Behavior (Step 2)

**Problem**: Step 2 refactors `pullCalendar` into a testable helper. Any refactor could accidentally change behavior — argument handling, error paths, output format. The existing CLI functionality must remain unchanged.

**Mitigation**:
- Step 1 tests must run and pass BEFORE Step 2 refactor begins
- Step 2 should be a pure extraction — no behavior changes, no new features
- Run full test suite after Step 2, before Step 3
- If any Step 1 test fails after Step 2, the refactor is wrong

**Verification**:
- [ ] Step 1 tests pass before Step 2 starts
- [ ] Step 2 commit is purely structural (no new logic)
- [ ] Same tests pass after Step 2 completes
- [ ] `npm run typecheck && npm test` green after Step 2

---

## Risk Summary

| # | Risk | Likelihood | Impact | Category |
|---|------|------------|--------|----------|
| 1 | No test patterns for pullCalendar | Medium | High | Test Patterns |
| 2 | CLI→Skill JSON format mismatch | Medium | High | Integration |
| 3 | Provider-specific behavior untested | Medium | Medium | Platform Issues |
| 4 | Agenda lookup performance | Low | Low | Code Quality |
| 5 | Skill state not formalized | Low | Medium | Integration |
| 6 | Template section ordering conflicts | Low | Medium | Integration |
| 7 | Empty section edge case | Medium | Low | Scope Creep |
| 8 | Refactor breaks existing behavior | Medium | High | Code Quality |

**Categories covered**: 6 of 8 (Test Patterns, Integration, Platform Issues, Code Quality, Scope Creep, State Tracking)

**Not applicable**: 
- Context Gaps (not using subagents)
- Multi-IDE Consistency (runtime skill, not IDE-specific)

---

## Execution Checklist

Before each step, review applicable mitigations:

| Step | Risks to Check |
|------|----------------|
| 1. Test infrastructure | R1 (test patterns) |
| 2. Refactor | R1, R8 (verify tests still pass) |
| 3. Add fields | R2, R3, R4 (JSON format, provider handling, agenda perf) |
| 4. Skill update | R2, R5, R7 (JSON consumption, state, empty handling) |
| 5. Template | R6, R7 (section ordering, empty case) |

---

**Total risks identified**: 8
**High-impact risks**: 3 (R1, R2, R8)
**Recommended mitigations**: All applied to respective step ACs

**Ready to proceed with these mitigations?**