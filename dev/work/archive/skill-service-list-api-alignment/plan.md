---
title: "SkillService.list() API Alignment with ToolService"
slug: skill-service-list-api-alignment
status: abandoned
size: small
tags: [refactor, core]
created: 2026-02-22T19:45:00Z
updated: 2026-02-22T19:45:00Z
completed: 2026-02-22T21:17:43Z
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# SkillService.list() API Alignment with ToolService

**Source**: Engineering lead review of router-fix-skill-rename PRD (2026-02-22)

## Problem

`SkillService.list(workspaceRoot)` hardcodes the skills directory path internally as `join(workspaceRoot, '.agents', 'skills')`, baking in workspace layout knowledge. `ToolService.list(toolsDir)` takes the resolved directory path from the caller, which is cleaner — the caller already has `WorkspacePaths` with the correct path.

The engineering lead noted: "ToolService's API is actually the better design. SkillService should eventually adopt this pattern."

## Suggested Direction

Refactor `SkillService` to match `ToolService`:
1. Change `list(workspaceRoot: string)` → `list(skillsDir: string)` 
2. Change `get(name: string, workspaceRoot: string)` → `get(name: string, skillsDir: string)`
3. Update all callers (CLI commands: route.ts, skill.ts, and any compat shims) to pass `paths.agentSkills` instead of `root`
4. Update tests

## Benefits

- Consistent API across ToolService and SkillService
- Services are workspace-layout-agnostic (caller resolves paths)
- Easier to test (pass any directory, no workspace structure needed)

## Constraints

- Must update all callers in `packages/cli/src/commands/` 
- Compat shims in `packages/core/src/compat/` may also call `skills.list()` — check
- Backward compatibility break (function signature change) — acceptable since it's internal

## References

- `packages/core/src/services/skills.ts` — current implementation
- `packages/core/src/services/tools.ts` — target pattern
- `packages/core/src/services/LEARNINGS.md` — documents the ToolService design rationale
