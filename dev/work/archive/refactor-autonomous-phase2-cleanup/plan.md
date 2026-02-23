---
title: Refactor Autonomous Phase2 Cleanup
slug: refactor-autonomous-phase2-cleanup
status: abandoned
size: unknown
tags: [improvement]
created: 2026-02-20T03:47:16Z
updated: 2026-02-20T03:47:16Z
completed: 2026-02-22T21:17:43Z
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Refactor: Phase 2 — Migrate dev/autonomous/ static assets

**Status**: Backlog
**Effort**: Small
**Source**: PRD refactor-subagents, Phase 2 — deferred during execution to keep scope tight

## What

After the subagent refactor (Phase 1), `dev/autonomous/` still contains static assets referenced by active skills:

**Templates** (referenced by run-pre-mortem, review-plan, plan-pre-mortem.mdc):
- `dev/autonomous/templates/PRE-MORTEM-TEMPLATE.md`

**Reference docs** (referenced by plan-pre-mortem.mdc):
- `dev/autonomous/PRE-MORTEM-AND-ORCHESTRATION-RECOMMENDATIONS.md`

**Schema** (referenced by prd-to-json, plan-to-prd, execute-prd):
- `dev/autonomous/schema.ts`

**Other legacy files** (no longer referenced by active skills):
- `dev/autonomous/prd-task-agent.md` (deprecated — replaced by `.pi/agents/developer.md`)
- `dev/autonomous/README.md` (deprecated)
- `dev/autonomous/prd.json.example`
- `dev/autonomous/progress.txt.template`
- `dev/autonomous/QUICK-START-ORCHESTRATION.md`
- `dev/autonomous/TEST-EXECUTE-PRD-PROMPT.md`
- `dev/autonomous/test-prd.md`
- `dev/autonomous/TESTING.md`
- `dev/autonomous/archive/`

## Why

- `dev/autonomous/` is deprecated but still partially live due to template/schema refs
- Confusing for agents and contributors — directory is marked deprecated but files in it are required
- Clean separation: execution state → `dev/executions/`, planning → `dev/plans/`, templates → `dev/templates/` (or similar)

## Suggested Direction

1. Move `dev/autonomous/templates/` → `dev/templates/` (or `.agents/templates/`)
2. Move `dev/autonomous/schema.ts` → `dev/templates/prd-schema.ts` (or keep alongside prd-to-json skill)
3. Update all references (4 skills + 1 rule file — use grep inventory)
4. Archive or delete remaining legacy files in `dev/autonomous/`
5. Remove `dev/autonomous/` directory entirely

## Grep Inventory (references to update)

```bash
grep -rn "dev/autonomous" .agents/skills/ .pi/agents/ .cursor/rules/ .agents/sources/ --include="*.md" --include="*.mdc" --include="*.ts"
```

Current hits (as of 2026-02-19):
- `.agents/skills/run-pre-mortem/SKILL.md` (3 refs — templates)
- `.agents/skills/review-plan/SKILL.md` (1 ref — templates)
- `.agents/skills/execute-prd/SKILL.md` (1 ref — schema.ts)
- `.agents/skills/prd-to-json/SKILL.md` (2 refs — schema.ts)
- `.agents/skills/plan-to-prd/SKILL.md` (1 ref — schema.ts)
- `.cursor/rules/plan-pre-mortem.mdc` (3 refs — templates + recommendations)
- `.agents/sources/builder/conventions.md` (1 ref — templates)
- `.pi/agents/developer.md` (1 ref — negative guidance, remove after migration)
