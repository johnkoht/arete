# Pre-Mortem: Planning Flow Simplification (Phase 1)

## Overview

Refactoring week-plan and daily-plan skills to be simpler and more interactive. Four tasks, estimated 4-6 hours.

---

### Risk 1: Template Coordination Failure

**Problem**: Task 3 (daily-plan writes to week.md) depends on Task 1 (template update). If the template structure isn't finalized before daily-plan changes, the two could become incompatible. The section header (`## Today's Plan`) must match exactly.

**Mitigation**: 
- Execute Task 1 first, fully complete and verified
- Define exact section header in template: `## Today's Plan`
- Daily-plan skill references this exact header (not a variant)
- Add comment in template: `<!-- DO NOT RENAME - daily-plan depends on this header -->`

**Verification**: Before starting Task 3, confirm Task 1 template has `## Today's Plan` section with exact spelling.

---

### Risk 2: Backward Compatibility Regression

**Problem**: Existing week.md files in user workspaces don't have the `## Today's Plan` section. Running daily-plan could fail or corrupt the file if it expects the section to exist.

**Mitigation**:
- Daily-plan must detect section presence: `grep -q "## Today's Plan" now/week.md`
- If missing: append section at a logical position (after priorities, before tasks)
- Never overwrite content outside the `## Today's Plan` section
- Add explicit test case: "Old week.md without daily section → graceful upgrade"

**Verification**: Test with a week.md that lacks `## Today's Plan` — should add section, not fail.

---

### Risk 3: Overwrite Semantics Lose User Notes

**Problem**: User adds manual notes to `## Today's Plan` section during the day. Next morning, daily-plan runs and overwrites everything, including their notes.

**Mitigation**:
- Document clearly: "This section is auto-generated and will be replaced"
- Add a `## Progress Notes` subsection OUTSIDE Today's Plan for user notes
- Or: Before overwriting, check for user-added content (lines without standard format) and warn

**Verification**: Template includes comment explaining overwrite behavior. User notes have a designated section.

---

### Risk 4: week-review Breaks on New Format

**Problem**: week-review skill parses week.md and summarizes outcomes. If it doesn't expect `## Today's Plan` section, it might misinterpret it as outcomes or fail.

**Mitigation**:
- Task 4 explicitly updates week-review to recognize and skip/process `## Today's Plan`
- Add graceful handling: unknown sections are ignored, not errored
- Test: Run week-review on both old and new format week.md files

**Verification**: week-review handles both formats without error. New format produces sensible output.

---

### Risk 5: Stakeholder Watchouts Removal Surprise

**Problem**: User has grown dependent on stakeholder watchouts being auto-generated. Making it opt-in without notice could feel like a regression.

**Mitigation**:
- On first run post-change, agent mentions: "Stakeholder watchouts are now opt-in. Say 'add watchouts' to include them."
- Document change in skill changelog or release notes
- Don't remove the capability, just change the default

**Verification**: Skill workflow includes mention of watchouts opt-in when running week-plan.

---

### Risk 6: Night-Before Timing Edge Cases

**Problem**: User runs daily-plan at 5:30pm — is that "today" or "tomorrow"? Simple heuristics (after 6pm = tomorrow) could produce wrong results around edge times or for different user schedules.

**Mitigation**:
- Use clear heuristic: After 6pm local time = plan for next day
- But also: Ask user to confirm if ambiguous: "Planning for tomorrow (3/18)? Y/n"
- Calendar pull should use the appropriate date based on this

**Verification**: Test at 5pm, 6pm, 7pm — behavior is predictable. Confirmation prompt appears when needed.

---

### Risk 7: Context Gaps for Subagent Implementation

**Problem**: Developer subagent implementing Task 3 needs to understand: template format, section detection, overwrite semantics, timing logic. Fresh context may miss details.

**Mitigation**:
- In developer prompt, explicitly list files to read:
  - `packages/runtime/skills/daily-plan/SKILL.md` (current implementation)
  - `packages/runtime/skills/week-plan/SKILL.md` (template reference)
  - Updated template (after Task 1 complete)
- Include specific ACs in prompt, not just "make it work"

**Verification**: Check developer prompt includes file list and detailed ACs before spawning.

---

### Risk 8: Skill Testing is Manual

**Problem**: Skills are markdown workflow guides, not executable code. No automated tests exist. A change that "looks right" could fail in actual use.

**Mitigation**:
- After each task, run the skill manually in a test workspace
- Create test scenarios document with expected inputs/outputs
- Dogfood for 3-5 days before considering stable
- If skill behavior regresses, add to LEARNINGS.md

**Verification**: Manual test checklist completed for each task. No skill-level automated tests expected.

---

## Summary

| Risk | Severity | Mitigation |
|------|----------|------------|
| Template coordination | High | Execute Task 1 first, exact header match |
| Backward compatibility | High | Section detection + graceful append |
| Overwrite loses notes | Medium | Document behavior, add Progress Notes section |
| week-review breaks | Medium | Task 4 handles new format explicitly |
| Watchouts surprise | Low | Mention opt-in on first run |
| Timing edge cases | Low | Clear heuristic + confirmation prompt |
| Context gaps | Medium | File lists in prompts |
| Manual testing | Low | Test checklist, dogfood period |

**Total risks identified**: 8
**Categories covered**: Context Gaps, Integration, Scope Creep, Dependencies, State Tracking, Test Patterns

**Critical path**: Task 1 (template) must complete before Task 3 (daily-plan). Task 4 (week-review) should follow Task 3.

---

Ready to proceed with these mitigations?
