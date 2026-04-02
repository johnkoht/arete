---
title: Enhance Review Skill
slug: enhance-review-skill
status: building
size: large
tags: []
created: 2026-04-02T02:45:38.702Z
updated: 2026-04-02T03:16:24.959Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: false
steps: 6
---

# Enhance Review Skill for Rigor and Action

## Problem

The current `/review` skill (`.pi/skills/review-plan/SKILL.md`) is **passive** — it flags concerns but doesn't enforce rigor or take action. Plans can pass review without:
- Solid, testable Acceptance Criteria
- Test coverage expectations
- Domain expertise informing the review
- Actionable refinements (just suggestions)

This leads to plans that look approved but have gaps that surface during execution.

## Solution

Enhance the review skill to be a **rigorous quality gate** that:
1. Loads domain expertise profiles based on files touched
2. Enforces strict Acceptance Criteria standards
3. Requires test coverage expectations in the plan
4. Verifies quality gates are included
5. Gates pre-mortem for medium+ plans
6. Outputs actionable refinements (direct edit OR structured suggestions)

**Key design decision**: Include a "quick review" path for tiny/small plans (skip expertise loading, reduced checklist) vs full workflow for medium+ plans. This prevents the skill from becoming heavyweight compliance theater.

## Key Enhancements

### 1. Tiered Review Paths
- **Quick review** (tiny/small plans): Streamlined checklist, skip expertise loading, focus on core quality
- **Full review** (medium/large plans): Complete workflow with expertise profiles, LEARNINGS.md scan, pre-mortem gating

### 2. Expertise Profile Loading (medium+ only)
- Determine what packages the plan touches
- Load `.pi/expertise/{domain}/PROFILE.md` for each (core, cli, backend, web)
- Use profile-specific section mapping per `.pi/skills/LEARNINGS.md` learning #3
- Validate architectural decisions against documented invariants

### 3. LEARNINGS.md Scan
- Check for LEARNINGS.md in affected directories
- Verify plan doesn't violate documented gotchas/invariants

### 4. Strict AC Validation Rubric
- Each AC must be independently verifiable
- No vague language ("should work", "properly handles", "as expected")
- Testable assertions (input → expected output)
- Edge cases explicitly listed
- Provide examples of good vs bad ACs

### 5. Test Coverage Requirements
- Each task touching code must have test expectations
- Specify unit vs integration test needs
- Reference `.pi/standards/build-standards.md` test requirements
- Flag tasks that modify code without corresponding test plans

### 6. Quality Gate Verification
- Plan must include `npm run typecheck && npm test` verification steps
- For PRDs: each task should have quality gate in completion criteria

### 7. Pre-Mortem Gating
- Assess plan complexity (tiny/small/medium/large)
- For medium+ plans: verdict can be "Approve pending pre-mortem"
- For large plans: refuse "Approve" without pre-mortem

### 8. Actionable Output Modes
- **Mode A: Direct Refinement** — Ask permission, then edit plan.md directly
- **Mode B: Structured Suggestions** — Concrete edits for orchestrator to apply
- Use structured feedback format: "What's wrong | What to do | Where to fix"

## Files Affected

- `.pi/skills/review-plan/SKILL.md` — Primary skill file (rewrite)

## Out of Scope

- Changes to execute-prd (already has expertise loading)
- Changes to reviewer.md agent (already rigorous)
- Changes to pre-mortem skill (separate concern)
- Changes to plan-mode extension (skill file only)

Plan:
1. Read current skill and verify plan-mode extension compatibility (no command changes needed)
2. Draft enhanced skill structure with tiered review paths (quick vs full)
3. Add strict AC validation rubric with good/bad examples
   - AC: Rubric includes ≥3 good/bad AC example pairs
   - AC: Rubric is a checklist reviewers can mechanically apply
   - AC: Rubric flags specific anti-patterns (vague language, untestable criteria)
4. Add test coverage and quality gate sections
   - AC: Test requirements reference `.pi/standards/build-standards.md`
   - AC: Quality gate checklist matches existing patterns from reviewer.md
5. Add pre-mortem gating and actionable output modes
   - AC: Gating logic has clear thresholds (tiny/small skip, medium recommend, large require)
   - AC: Both output modes have concrete examples
   - AC: Structured feedback format matches reviewer.md pattern
6. Validate enhanced skill by running `/review` on this plan
   - AC: All new sections are exercised
   - AC: Tiered path selection works correctly
   - AC: Output is actionable, not just advisory