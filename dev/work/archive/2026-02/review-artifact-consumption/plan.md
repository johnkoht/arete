---
title: Review & Pre-Mortem Artifact Consumption in Build Handoff
slug: review-artifact-consumption
status: idea
created: 2026-02-22T00:00:00Z
updated: 2026-02-22T00:00:00Z
---

# Review & Pre-Mortem Artifact Consumption in Build Handoff

## Problem

Plan-mode gates correctly generate and track `review.md` and `pre-mortem.md` (`has_review`, `has_pre_mortem`), but `/build` handoff only references:
- `prd.md`
- `prd.json`

As a result, review concerns and pre-mortem insights are not reliably consumed during execution unless manually copied into PRD/ACs.

## Why This Matters

Recent execution learnings show strong value from:
- reviewer pre-work sanity checks,
- explicit pre-mortem mitigations,
- ACs that incorporate known risks/concerns.

Current flow stores these artifacts but does not consistently wire them into execution context.

## Scope (future)

1. **Build handoff context**
   - Include artifact paths/content hints for `review.md` and `pre-mortem.md` in `/build` execution prompt when present.

2. **PRD conversion flow**
   - Ensure `plan-to-prd` explicitly reads `review.md` (if present) and incorporates material concerns into PRD tasks/ACs.

3. **Execution skill guidance**
   - Update `execute-prd` instructions to consume existing review/pre-mortem artifacts when available, not only run a fresh pass.

4. **Template/structure alignment**
   - Normalize PRD structure expectations so pre-mortem and quality gates are consistently positioned and easy for orchestrators to apply.

## Evidence / References

- Plan-mode `/build` currently sends PRD + task list only (`.pi/extensions/plan-mode/commands.ts`)
- `review.md` is generated and tracked but not referenced by default execution handoff
- `qmd-improvements` is a positive example where review concerns were explicitly incorporated into ACs
- Relevant memory entries:
  - `memory/entries/2026-02-20_plan-backlog-unification-learnings.md`
  - `memory/entries/2026-02-21_krisp-integration.md`
  - `memory/entries/2026-02-15_monorepo-intelligence-refactor-learnings.md`

## Suggested Outcome

Make review and pre-mortem artifacts first-class execution inputs so gates influence implementation quality consistently, not optionally.
