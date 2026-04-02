# Pre-Mortem: Enhance Review Skill

**Date**: 2026-04-01
**Plan**: Enhance Review Skill for Rigor and Action
**Size**: Medium (6 steps)

---

## Risk 1: Referenced Sections Don't Exist

**Category**: Context Gaps / Dependencies

**Problem**: The enhanced skill will reference specific sections from multiple files:
- `.pi/expertise/{domain}/PROFILE.md` — needs `## Invariants`, `## Anti-Patterns` sections
- `.pi/skills/LEARNINGS.md` — learning #3 about profile section mapping
- `.pi/standards/build-standards.md` — test requirements section
- `.pi/agents/reviewer.md` — structured feedback format

If these sections don't exist, have different names, or have different structures, the skill's instructions will be wrong.

**Mitigation**: Before drafting the skill (Step 2), read ALL referenced files and verify:
- Exact section names that exist
- Profile-specific differences (core has Invariants, CLI has Purpose & Boundaries)
- Use section mapping from `.pi/skills/LEARNINGS.md` learning #3

**Verification**: Step 2 draft explicitly uses verified section names, not assumed ones.

---

## Risk 2: Structural Inconsistency with Other Skills

**Category**: Code Quality / Patterns

**Problem**: Other skills (execute-prd, run-pre-mortem, hotfix) have established structural patterns: frontmatter, "When to Use", "Workflow" sections, output formats, examples. If the enhanced review-plan skill doesn't follow these patterns, it becomes the odd one out and harder to maintain.

**Mitigation**: Before drafting, read the structure of 2-3 other skills to identify common patterns:
- `.pi/skills/execute-prd/SKILL.md` (most complex)
- `.pi/skills/hotfix/SKILL.md` (simpler)
- Note: section ordering, heading levels, example formats

**Verification**: Compare draft structure against execute-prd — same heading hierarchy and section types.

---

## Risk 3: Tiered Path Boundary Confusion

**Category**: Integration / Scope Creep

**Problem**: The skill will have "quick review" (tiny/small) vs "full review" (medium/large) paths. If the boundary isn't crisp, agents will:
- Guess wrong about which path to use
- Apply full review to tiny plans (overkill)
- Apply quick review to complex plans (insufficient)

**Mitigation**: Define explicit, mechanical criteria:
- **Quick review**: Plan has ≤3 steps AND touches ≤2 files AND no architectural decisions
- **Full review**: Everything else (≥4 steps OR ≥3 files OR architectural decisions)
- First step of skill workflow: determine path with a decision tree, not judgment

**Verification**: Skill includes a decision flowchart or checklist for path selection in Step 1 of workflow.

---

## Risk 4: Self-Referential Loop

**Category**: Integration

**Problem**: What happens when someone runs `/review` on a plan that modifies the review skill itself? The skill would be reviewing its own replacement. This could cause:
- Confusion about which version applies
- Circular reasoning
- Meta-review paralysis

**Mitigation**: This is an edge case, not a blocker. Add a note in the skill:
> "When reviewing changes to this skill itself, use the current skill version. The enhanced skill takes effect after deployment."

**Verification**: Skill includes this guidance note.

---

## Risk 5: Examples Become Stale

**Category**: State Tracking

**Problem**: The AC validation rubric will include good/bad examples. These examples could become stale as conventions evolve, making the skill misleading over time.

**Mitigation**: 
- Use timeless examples (basic logic, not domain-specific)
- Add a "last reviewed" date to the examples section
- Note in skill: "Update examples when conventions change"

**Verification**: Examples use generic patterns (authentication, data validation) not Areté-specific features.

---

## Risk 6: Breaking Existing Agent Behavior

**Category**: Backward Compatibility

**Problem**: Agents (including execute-prd orchestrator, engineering-lead) are trained on the current skill structure. A major restructure could cause them to:
- Skip new sections they don't recognize
- Follow old patterns that no longer exist
- Produce reviews that don't match expected format

**Mitigation**:
- Preserve existing output format (## Review:, Concerns, Strengths, Devil's Advocate, Verdict)
- Add new sections WITHIN existing structure, not replacing it
- Keep the same verdict options (Approve / Approve with suggestions / Revise)

**Verification**: After drafting, compare output format with current skill — must be superset, not replacement.

---

## Risk 7: Skill Becomes Too Long

**Category**: Scope Creep

**Problem**: Adding 8 enhancements (tiered paths, expertise loading, AC rubric, test requirements, quality gates, pre-mortem gating, output modes, LEARNINGS scan) could make the skill file unwieldy. Execute-prd is ~600 lines; if review-plan exceeds that, something is wrong.

**Mitigation**:
- Set a target: enhanced skill should be ≤400 lines (current is ~180)
- Each new section should be ≤50 lines
- If hitting limits, move examples to a separate reference file

**Verification**: After completing draft, run `wc -l` on the file. If >400, refactor.

---

## Summary

| # | Risk | Category | Severity |
|---|------|----------|----------|
| 1 | Referenced sections don't exist | Dependencies | High |
| 2 | Structural inconsistency | Patterns | Medium |
| 3 | Tiered path confusion | Integration | High |
| 4 | Self-referential loop | Integration | Low |
| 5 | Examples become stale | State Tracking | Low |
| 6 | Breaking agent behavior | Backward Compat | Medium |
| 7 | Skill becomes too long | Scope Creep | Medium |

**Total risks identified**: 7
**Categories covered**: Dependencies, Patterns, Integration, State Tracking, Backward Compatibility, Scope Creep

---

## Mitigations to Apply by Step

| Step | Mitigations to Apply |
|------|---------------------|
| 1 | Risk 1 (verify referenced sections exist) |
| 2 | Risk 2 (follow structural patterns), Risk 3 (define path criteria), Risk 4 (add self-referential note), Risk 6 (preserve output format) |
| 3 | Risk 5 (timeless examples) |
| 4 | Risk 1 (use verified section names) |
| 5 | Risk 3 (explicit thresholds) |
| 6 | Risk 7 (check line count) |

---

**Ready to proceed with these mitigations?**
