# PRD: Planning Flow Simplification (Phase 1)

**Version**: 1.0  
**Status**: Ready for Execution  
**Date**: 2026-03-17  
**Branch**: `feature/planning-flow-simplification`  
**Depends on**: None (self-contained skill refactor)

---

## 1. Problem & Goals

### Problem

The current week-plan and daily-plan skills in Areté generate overwhelming output. They include stakeholder watchouts, extensive meeting context, person memory refreshes, and multi-section templates — machinery that doesn't match the user's actual workflow.

The user wants:
- **Interactive weekly planning**: Shape priorities through conversation, not just receive a generated draft
- **Minimal daily entries**: A compact "Today's Plan" section embedded in the week file, not separate documents
- **Lighter feel**: Less output, faster planning, focused content

Current pain points:
- Week-plan generates too much before asking what the user actually wants to focus on
- Daily-plan creates elaborate standalone output when the user just wants a quick focus check
- Stakeholder watchouts are auto-generated when often not needed
- Daily planning creates a separate file instead of updating the week file

### Goals

1. **Interactive week-plan**: Gather context first, then ask the user for their top 3-5 priorities before generating the template
2. **Embedded daily-plan**: Write a compact `## Today's Plan` section directly into `now/week.md` instead of separate files
3. **Merge-aware updates**: When daily-plan overwrites, detect and preserve user-added notes
4. **Opt-in complexity**: Stakeholder watchouts become opt-in (default: skip)
5. **Backward compatibility**: Existing week.md files work without migration

### Out of Scope (Phase 2)

- Agenda auto-creation from daily-plan (defer to Phase 2)
- Moving agendas after meeting processing
- Goals refactor (separate initiative)
- Transcript/recorder integration with process-meetings
- Commitments tied to goals instead of projects

---

## 2. Success Criteria

| Criterion | Measurement |
|-----------|-------------|
| Week plan takes ≤5 exchanges before file written | Count user prompts in conversation |
| Daily plan output is ≤20 lines | Line count of `## Today's Plan` section |
| Agent asks 2-3 priority questions | Skill workflow includes question step |
| Stakeholder watchouts are opt-in | Only generated when user requests |
| Existing week.md files work | Test with legacy format, no errors |
| User notes preserved on re-run | Merge prompt appears, notes kept |

---

## 3. User Stories / Tasks

### Task 1: Update Week Template with Daily Block Section

**Description**: Add a `## Today's Plan` section placeholder to the week.md template that daily-plan will populate. Document the expected structure and ensure template resolution works.

**Files to modify**:
- `packages/runtime/skills/week-plan/templates/week-priorities.md` (or create if doesn't exist)
- `packages/runtime/skills/week-plan/SKILL.md` (update template reference if needed)

**Acceptance Criteria**:
- [ ] Template includes `## Today's Plan` section with placeholder structure showing: Focus items, Meeting list format, Progress notes area
- [ ] Template includes HTML comment: `<!-- This section is auto-updated by daily-plan. User notes in ### Notes subsection are preserved. -->`
- [ ] `arete template resolve --skill week-plan --variant week-priorities` returns template with the new section
- [ ] Template structure documented in skill's workflow section

---

### Task 2: Refactor Week-Plan Skill for Interactive Shaping

**Description**: Change the week-plan workflow from "gather context → generate draft" to "gather context → ask priorities → confirm → generate". Make stakeholder watchouts opt-in.

**Files to modify**:
- `packages/runtime/skills/week-plan/SKILL.md`

**Acceptance Criteria**:
- [ ] Workflow step "Guide to Top 3–5 Outcomes" now ASKS user for priorities rather than suggesting based on context
- [ ] After context gathering, agent says: "Based on your calendar and goals, what are your top 3-5 priorities this week?"
- [ ] User's verbatim priorities are captured before template is written
- [ ] Stakeholder watchouts section (Step 5) is opt-in: "Would you like stakeholder watchouts? (default: no)"
- [ ] Works for both "plan next week" (Friday evening) and "plan this week" (Monday morning) — timing handled in step 1
- [ ] Skill workflow explicitly limits exchanges before file write (target: ≤5)

---

### Task 3: Refactor Daily-Plan Skill to Write Inside Week.md

**Description**: Change daily-plan to write a compact `## Today's Plan` section directly into `now/week.md` instead of creating separate files. Implement merge-aware updates that preserve user notes.

**Files to modify**:
- `packages/runtime/skills/daily-plan/SKILL.md`

**Acceptance Criteria**:
- [ ] Daily plan writes to `## Today's Plan` section in `now/week.md`, not to `now/today.md`
- [ ] Output format is compact (≤20 lines): Focus statement, meeting list with times, key commitments
- [ ] Merge-aware update: Before overwriting, checks for user-added content in the section
- [ ] If user content detected, prompts: "You have notes in Today's Plan. Keep notes and update meetings, or replace everything?"
- [ ] User notes in a `### Notes` subsection are always preserved
- [ ] "Night before" timing works: After 6pm, plans for tomorrow's date
- [ ] If `## Today's Plan` section doesn't exist in week.md, appends it gracefully
- [ ] Legacy `now/today.md` documented as deprecated in workflow notes

---

### Task 4: Update Week-Review to Handle Daily Blocks

**Description**: Update week-review skill to recognize and process the new `## Today's Plan` section in week.md. Ensure backward compatibility with old format.

**Files to modify**:
- `packages/runtime/skills/week-review/SKILL.md`

**Acceptance Criteria**:
- [ ] Week-review recognizes `## Today's Plan` section if present
- [ ] If present, summarizes: "Daily plans were tracked for N days"
- [ ] If absent (old format), proceeds normally without error
- [ ] Review output doesn't duplicate daily content in weekly summary
- [ ] Test case: Old week.md without `## Today's Plan` → week-review works as before
- [ ] Test case: New week.md with `## Today's Plan` → week-review produces sensible summary

---

## 4. Pre-Mortem Risks & Mitigations

### Risk 1: Template Coordination Failure
**Problem**: Task 3 depends on Task 1's template structure. Mismatch causes errors.  
**Mitigation**: Execute Task 1 first. Daily-plan references exact header `## Today's Plan`.  
**Verification**: Before Task 3, confirm template has the section.

### Risk 2: Backward Compatibility Regression
**Problem**: Old week.md files without `## Today's Plan` cause daily-plan to fail.  
**Mitigation**: Daily-plan detects section presence; if missing, appends section gracefully.  
**Verification**: Test with legacy week.md.

### Risk 3: Overwrite Loses User Notes
**Problem**: User adds notes, re-runs daily-plan, notes lost.  
**Mitigation**: Merge-aware update prompts user. `### Notes` subsection always preserved.  
**Verification**: Test scenario with user notes, confirm preservation.

### Risk 4: Week-Review Breaks
**Problem**: Week-review doesn't expect new section, misinterprets content.  
**Mitigation**: Task 4 adds explicit handling.  
**Verification**: Test both old and new formats.

### Risk 5: Context Gaps for Implementation
**Problem**: Developer subagent lacks sufficient context.  
**Mitigation**: Include explicit file paths and patterns in prompts.  
**Verification**: Check prompt includes file list before spawning.

---

## 5. Task Dependencies

```
Task 1 (template) → Task 2 (week-plan) can be parallel
                 → Task 3 (daily-plan) depends on Task 1
                 → Task 4 (week-review) depends on Task 3
```

**Recommended order**: Task 1 → Task 2 (parallel) → Task 3 → Task 4

---

## 6. Testing Strategy

Skills are markdown workflow guides, not executable code. Testing is manual:

| Scenario | Input | Expected |
|----------|-------|----------|
| Fresh start | No week.md exists | week-plan creates new file with all sections |
| Legacy upgrade | Old week.md without `## Today's Plan` | daily-plan appends section gracefully |
| Normal daily | Run daily-plan on existing week.md | Today's Plan replaced, other sections untouched |
| User notes preserved | Add notes to Today's Plan, re-run | Merge prompt appears, notes kept |
| Night before | Run at 7pm | Plans for tomorrow's date |
| Week review old format | Old week.md | Works as before |
| Week review new format | Week.md with daily section | Includes daily summary |

**Post-ship validation**: Dogfood for 5 days before considering stable.

---

## 7. References

- **Current skills**: `packages/runtime/skills/week-plan/SKILL.md`, `packages/runtime/skills/daily-plan/SKILL.md`, `packages/runtime/skills/week-review/SKILL.md`
- **Template resolution**: `arete template resolve --skill <name> --variant <type>`
- **Pre-mortem**: `dev/work/plans/planning-flow-simplification/pre-mortem.md`
- **Review**: `dev/work/plans/planning-flow-simplification/review.md`
