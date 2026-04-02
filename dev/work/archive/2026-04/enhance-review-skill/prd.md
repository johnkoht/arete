# PRD: Enhance Review Skill for Rigor and Action

**Version**: 1.0  
**Status**: Ready for Execution  
**Date**: 2026-04-02  
**Branch**: `feature/enhance-review-skill`  
**Depends on**: plan-mode extension, execute-prd skill (for patterns)

---

## 1. Problem & Goals

### Problem

The current `/review` skill (`.pi/skills/review-plan/SKILL.md`) is **passive** — it flags concerns but doesn't enforce rigor or take action. Plans can pass review without:
- Solid, testable Acceptance Criteria
- Test coverage expectations
- Domain expertise informing the review
- Actionable refinements (just suggestions)

This leads to plans that look approved but have gaps that surface during execution.

### Goals

1. **Rigorous AC validation**: Enforce strict Acceptance Criteria standards with testable, specific criteria
2. **Domain-aware reviews**: Load expertise profiles for medium+ plans to validate against documented invariants
3. **Test coverage enforcement**: Require test expectations in plans that modify code
4. **Pre-mortem gating**: Ensure medium+ plans have risk analysis before approval
5. **Actionable output**: Provide concrete refinements (direct edit OR structured suggestions), not just advisory notes

### Out of Scope

- Changes to execute-prd skill (already has expertise loading)
- Changes to reviewer.md agent (already rigorous)
- Changes to pre-mortem skill (separate concern)
- Changes to plan-mode extension (skill file only)

### Key Design Decision

**Tiered review paths** to prevent the skill from becoming heavyweight compliance theater:
- **Quick review** (tiny/small plans, ≤3 steps): Streamlined checklist, skip expertise loading
- **Full review** (medium/large plans, ≥4 steps): Complete workflow with profiles, LEARNINGS.md scan, pre-mortem gating

---

## 2. Architecture Notes

### File Affected

Single file: `.pi/skills/review-plan/SKILL.md` (rewrite)

### Structural Patterns to Follow

- **Skill structure**: Match execute-prd format (frontmatter, When to Use, Workflow, Output Format, Examples)
- **Profile section mapping**: Use `.pi/skills/LEARNINGS.md` learning #3 (Core: Invariants/Anti-Patterns; CLI: Purpose/Command Architecture)
- **Feedback format**: Match `.pi/agents/reviewer.md` structured format (What's wrong | What to do | Where to fix)

### Pre-Mortem Mitigations to Apply

From `dev/work/plans/enhance-review-skill/pre-mortem.md`:
1. **Risk 1**: Verify all referenced sections exist before drafting
2. **Risk 2**: Follow execute-prd/hotfix skill structural patterns
3. **Risk 3**: Define explicit tiered path criteria with decision flowchart
4. **Risk 6**: Preserve existing output format (superset, not replacement)
5. **Risk 7**: Target ≤400 lines total

---

## 3. Tasks

### Task 1: Verify References and Pattern Audit

**Description**: Read the current review-plan skill and all referenced files. Verify section names exist. Check for other skills that reference review-plan to ensure consistency. Audit execute-prd and hotfix skill structures for patterns to follow.

**Acceptance Criteria**:
- [ ] Current review-plan skill structure documented
- [ ] All referenced files verified (profiles, LEARNINGS.md, build-standards.md, reviewer.md)
- [ ] Section names confirmed to exist (exact names for each profile type)
- [ ] Structural patterns from execute-prd and hotfix identified (heading hierarchy, section types)
- [ ] Plan-mode extension verified to not require changes

**Notes**: This is pre-mortem Risk 1 mitigation. Capture verified section names for use in Task 2.

---

### Task 2: Draft Enhanced Skill Structure

**Description**: Create the enhanced skill file with tiered review paths (quick vs full). Establish the workflow structure, preserve existing output format, add new sections as scaffolding.

**Acceptance Criteria**:
- [ ] Tiered path criteria defined explicitly:
  - Quick review: ≤3 steps AND ≤2 files AND no architectural decisions
  - Full review: ≥4 steps OR ≥3 files OR architectural decisions
- [ ] Decision flowchart or checklist for path selection in Step 1 of workflow
- [ ] Existing output format preserved (## Review:, Concerns, Strengths, Devil's Advocate, Verdict)
- [ ] New sections added as scaffolding (Expertise Loading, LEARNINGS.md Scan, AC Validation, etc.)
- [ ] Skill structure matches execute-prd pattern (frontmatter, When to Use, Workflow sections)

**Notes**: This is the core structural work. Content for each section added in Tasks 3-5.

---

### Task 3: Add AC Validation Rubric

**Description**: Create a strict Acceptance Criteria validation rubric with good/bad examples that reviewers can mechanically apply.

**Acceptance Criteria**:
- [ ] Rubric includes ≥3 good/bad AC example pairs showing:
  - Good: Specific, measurable, testable
  - Bad: Vague language ("should work", "properly handles")
- [ ] Rubric is a checklist reviewers can mechanically apply
- [ ] Rubric flags specific anti-patterns:
  - Vague language (list specific terms to avoid)
  - Untestable criteria
  - Missing edge cases
  - Compound criteria that should be split
- [ ] Examples use generic patterns (authentication, data validation), not Areté-specific features

**Notes**: Pre-mortem Risk 5 (examples staleness) — use timeless examples.

---

### Task 4: Add Test Coverage and Quality Gate Sections

**Description**: Add sections requiring test coverage expectations and quality gate verification in reviewed plans.

**Acceptance Criteria**:
- [ ] Test coverage requirements section references `.pi/standards/build-standards.md`
- [ ] Each task touching code must have test expectations (flag if missing)
- [ ] Quality gate checklist matches patterns from `.pi/agents/reviewer.md`
- [ ] For PRDs: guidance that each task should have quality gate in completion criteria
- [ ] Clear exception for documentation-only tasks (no tests required)

---

### Task 5: Add Pre-Mortem Gating and Output Modes

**Description**: Add complexity assessment, pre-mortem gating logic, and two actionable output modes.

**Acceptance Criteria**:
- [ ] Complexity assessment criteria defined:
  - Tiny: 1-2 steps, single file
  - Small: 3 steps or 2 files
  - Medium: 4-6 steps or 3+ files
  - Large: 7+ steps or architectural changes
- [ ] Pre-mortem gating logic with clear thresholds:
  - Tiny/Small: Pre-mortem optional (mention in verdict if skipped)
  - Medium: "Approve pending pre-mortem" verdict option
  - Large: Refuse "Approve" without pre-mortem
- [ ] Two output modes documented with concrete examples:
  - Mode A: Direct Refinement (ask permission, then edit plan.md)
  - Mode B: Structured Suggestions (concrete edits for orchestrator)
- [ ] Structured feedback format matches reviewer.md pattern:
  - What's wrong: Specific finding with location
  - What to do: Concrete instruction
  - Where to fix: File path or section reference
- [ ] Self-referential note added: "When reviewing changes to this skill itself, use the current version"

---

### Task 6: Validate and Finalize

**Description**: Validate the enhanced skill by reviewing its structure, checking line count, and ensuring all pre-mortem mitigations were applied.

**Acceptance Criteria**:
- [ ] Skill file ≤400 lines (pre-mortem Risk 7)
- [ ] All pre-mortem mitigations verified as applied (checklist in pre-mortem.md)
- [ ] Output format is superset of original (compare side-by-side)
- [ ] LEARNINGS.md created or updated in `.pi/skills/review-plan/` if gotchas discovered
- [ ] Skill file committed with message: `feat(skills): enhance review-plan with tiered paths and AC rigor`

**Notes**: This is not a "run /review" task since we can't use the skill we're modifying to review itself. Manual validation instead.

---

## 4. Dependencies

```
Task 1 (Verify References)
    ↓
Task 2 (Draft Structure)
    ↓
Task 3 (AC Rubric) ←→ Task 4 (Test/Quality) ←→ Task 5 (Gating/Output)
    ↓                       ↓                       ↓
                    Task 6 (Validate)
```

Tasks 3, 4, 5 can be done in parallel after Task 2.

---

## 5. Success Criteria

- [ ] Enhanced skill passes self-review (structure, completeness)
- [ ] Tiered path selection is mechanical (no judgment required)
- [ ] AC validation rubric catches the anti-patterns we identified
- [ ] Pre-mortem gating prevents approval of complex plans without risk analysis
- [ ] Output provides actionable next steps, not just advisory notes

---

## 6. References

- **Current skill**: `.pi/skills/review-plan/SKILL.md`
- **Pattern sources**: 
  - `.pi/skills/execute-prd/SKILL.md` (structure)
  - `.pi/agents/reviewer.md` (feedback format)
  - `.pi/skills/LEARNINGS.md` (profile section mapping)
- **Pre-mortem**: `dev/work/plans/enhance-review-skill/pre-mortem.md`
- **Review**: `dev/work/plans/enhance-review-skill/review.md`
