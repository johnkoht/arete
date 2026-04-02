# Review: Enhance Review Skill Plan

**Type**: Plan (pre-execution)
**Audience**: Builder (internal tooling for `.pi/skills/`)
**Reviewed**: 2026-04-01

## Concerns

1. **Completeness — Missing acceptance criteria per step**
   - The plan has 9 steps but no specific ACs for any of them. This is ironic given the plan is about enforcing strict ACs!
   - Suggestion: Add concrete ACs for at least the key steps (2, 3, 6, 7). Example: "Step 3: AC rubric includes at least 3 good/bad AC examples; rubric is a checklist the reviewer can mechanically apply."

2. **Completeness — No validation/test plan**
   - How will we verify the enhanced skill works? This is workflow documentation, not code, so traditional tests don't apply.
   - Suggestion: Add Step 10: "Test the enhanced skill by running `/review` on an existing plan and verifying each new section is applied."

3. **Scope — Step consolidation opportunity**
   - Steps 2-6 are sequential content additions to one file. Could be one "draft the enhanced skill" step with sub-bullets.
   - Suggestion: Consider whether 9 separate steps add value or just inflate the step count. The granularity is fine if each step is independently reviewable, but if they'll be done in one pass, consolidate.

4. **Patterns — LEARNINGS.md cross-reference missing**
   - `.pi/skills/LEARNINGS.md` documents profile section mapping (core vs cli profiles have different sections). The enhanced skill should reference this.
   - Suggestion: In Step 2 (expertise loading), explicitly reference `.pi/skills/LEARNINGS.md` learning #3 about profile-specific section mapping.

5. **Risk — Skill becomes too heavyweight**
   - Adding 7 new requirements (expertise loading, AC rubric, test requirements, quality gates, pre-mortem gating, LEARNINGS scan, two output modes) could make the skill feel like compliance rather than a thinking tool.
   - Suggestion: Consider a "quick review" path for tiny/small plans that skips some steps. The full workflow for medium+ plans only.

6. **Dependency — Plan-mode extension integration**
   - The plan says it's modifying the skill file, but `/review` is invoked via the plan-mode extension. Are there command-level changes needed?
   - Suggestion: Verify `.pi/extensions/plan-mode/` doesn't need updates. Add "Check plan-mode extension compatibility" as a verification step.

## Strengths

- **Problem is real and well-articulated** — Current skill is passive, this addresses specific gaps
- **Solution maps directly to problem** — Each enhancement addresses an identified weakness
- **Draws from proven patterns** — Expertise loading borrowed from execute-prd
- **Contained scope** — Single file affected, clear out-of-scope boundaries
- **Actionable output modes** — The "refine directly vs structured suggestions" choice is practical

## Devil's Advocate

**If this fails, it will be because...** the enhanced skill becomes too prescriptive and reviewers either skip steps or follow them mechanically without thinking. The current skill's simplicity means it gets used. The new skill's thoroughness might mean it gets resented. The devil's advocate section exists to force non-mechanical thinking — if we bury it under 6 mandatory preliminary steps, reviewers may not reach it with fresh mental energy.

**The worst outcome would be...** we create more process but less quality. Reviewers check boxes instead of thinking critically. The skill becomes something agents speed through to reach the verdict rather than a tool that genuinely improves plans. We'd have rigor theater instead of actual rigor.

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Address concerns before execution
- [ ] **Revise** — Major gaps require rework

**Complexity**: Large (9 steps)
**Recommendation**: Run `/pre-mortem` before building — this touches a core workflow skill.

## Suggestions Applied

After review, the following changes were incorporated into the plan:

1. ✅ Added ACs for key steps (3, 4, 5, 6)
2. ✅ Added validation step (Step 6: test on real plan)
3. ✅ Added "quick review" path for tiny/small plans
4. ✅ Referenced `.pi/skills/LEARNINGS.md` for profile section mapping
5. ✅ Consolidated steps 2-5 into drafting phase with sub-bullets
6. ✅ Added plan-mode extension compatibility check
