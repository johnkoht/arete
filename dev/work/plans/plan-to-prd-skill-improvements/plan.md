---
title: Plan To Prd Skill Improvements
slug: plan-to-prd-skill-improvements
status: idea
size: unknown
tags: [improvement]
created: 2026-02-20T03:47:16Z
updated: 2026-02-20T03:47:16Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Improvement: plan-to-prd Skill Gaps

**Status**: Backlog
**Effort**: Small
**Source**: PRD plan-mode-skills-integration — discovered during plan-to-prd execution in plan mode (2026-02-16)

## What

Five issues found while following the plan-to-prd skill workflow:

### 1. Stale path in EXECUTE.md template
The handoff template references `dev/skills/execute-prd/SKILL.md` — a path that no longer exists after the dev-cleanup reorganization. Should be `.agents/skills/execute-prd/SKILL.md`.

### 2. No build memory check before PRD creation
prd-to-json (Step 1) says "Read `memory/MEMORY.md`" but plan-to-prd doesn't include this step. The PRD itself could miss context (recent architectural decisions, established patterns) that memory would surface. Memory check should happen before creating the PRD, not only during JSON conversion.

### 3. PRD template too minimal
The skill says to include Goal, User Stories/Tasks, and Acceptance Criteria. But the exemplar PRD (`dev/prds/intelligence-and-calendar/prd.md`) has a much richer structure: Problem & Goals, Architecture, Dependencies, Testing Strategy, Risks, Success Criteria, Out of Scope. The skill should reference the full exemplar format or provide a more complete template.

### 4. Plan mode incompatibility not addressed
When invoked from plan mode (where write is disabled), the skill's "Create PRD File" step will fail. The skill should note either: (a) exit plan mode first, or (b) the calling extension should handle the mode transition.

### 5. Inline prd-to-json invocation ambiguity
Step 3 says "Load `.agents/skills/prd-to-json/SKILL.md` and follow its workflow." In Cursor this works (agent reads the file). In Pi, the natural invocation is `/skill:prd-to-json`. The skill should note both paths for multi-IDE compatibility.

## Why

These gaps cause friction during the plan-to-prd workflow — especially the stale path (broken handoff) and missing memory check (missed context). Fixing them improves reliability of the PRD pipeline.

## Suggested Direction

1. Fix EXECUTE.md template path: `dev/skills/` → `.agents/skills/`
2. Add Step 1.5: "Read `memory/MEMORY.md` and recent entries for architectural context"
3. Expand Step 2 to reference exemplar PRD structure or add a comprehensive template
4. Add compatibility note: "If in plan mode, exit plan mode before creating files"
5. Add multi-IDE note: "In terminal agents, use `/skill:prd-to-json`; in IDE agents, read and follow the skill file"
