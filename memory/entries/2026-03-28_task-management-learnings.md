# Task Management System — Learnings

**PRD**: `dev/work/plans/task-management/prd.md`
**Executed**: 2026-03-27 to 2026-03-28
**Branch**: `feature/task-management`

## Metrics

| Metric | Value |
|--------|-------|
| Tasks | 18/18 |
| First-Attempt Success | 100% |
| Iterations | 0 |
| Tests Added | ~75 (tasks.ts + task-scoring.ts) |
| Files Changed | ~25 |

## What Was Built

Unified task and commitment management with:
- **TaskService**: GTD-style task CRUD across `now/tasks.md` and `now/week.md`
- **Task Scoring**: Pure scoring functions for intelligent task selection with transparency
- **Commitment-Task Linking**: `@from(commitment:id)` auto-resolution on completion
- **Review UI**: Web page for fast triage (<30s goal)
- **CLI Extensions**: `arete view --path /review --wait` for agent orchestration
- **Winddown Skills**: daily-winddown and weekly-winddown adapted for local-only operation

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Large scope (14 steps) | No | Phased execution | Yes |
| Skill migration | No | Attribution comments | Yes |
| Backward compatibility | No | Graceful section detection | Yes |
| File signal race conditions | No | Session ID validation | Yes |

**Surprises** (not in pre-mortem):
- Build stalled mid-execution with prd.json not updated — required status reconstruction from git commits

## What Worked Well

- **Function injection for circular dependencies**: `CommitmentsService.setCreateTaskFn()` cleanly breaks the cycle without complex DI
- **Pure scoring functions**: Stateless `scoreTask()` enables easy testing (40+ unit tests) and predictable behavior
- **Content-hash IDs**: Same 8-char sha256 pattern as CommitmentsService provides consistent, deterministic task IDs
- **Session file polling**: Simple `.arete/.review-session-{uuid}` approach works across CLI/backend boundary

## What Didn't Work

- **prd.json status tracking**: Build executed but prd.json wasn't updated, requiring manual status reconstruction
- **Verification gates as separate tasks**: Tasks 6/10/13 (verification gates) are really checkpoints, not work items

## Collaboration Patterns

- Build was autonomous until stall; continuation required state reconstruction
- Holistic review confirmed all ACs met with no blocking issues

## Recommendations

**Continue** (patterns to repeat):
- Function injection for cross-service dependencies
- Pure scoring functions with breakdown transparency
- Session file approach for cross-process coordination

**Stop** (patterns to avoid):
- Verification gate tasks — fold into previous phase's final task

**Start** (new practices to adopt):
- Update prd.json status atomically after each task completion
- Include state checkpoint commits mid-execution for recovery

## Documentation Updated

- [x] `packages/core/src/services/LEARNINGS.md` — TaskService + task-scoring documentation
- [x] `dev/catalog/capabilities.json` — TaskService, winddown skills, Review UI entries
- [x] `AGENTS.md` — daily-winddown and weekly-winddown in skills index

## Key Files

- `packages/core/src/services/tasks.ts` — TaskService
- `packages/core/src/services/task-scoring.ts` — Scoring algorithm
- `packages/core/src/models/tasks.ts` — Types
- `packages/runtime/skills/daily-winddown/SKILL.md`
- `packages/runtime/skills/weekly-winddown/SKILL.md`
- `packages/apps/web/src/pages/ReviewPage.tsx`
- `packages/apps/backend/src/routes/review.ts`
- `packages/cli/src/commands/view.ts` — --path, --wait flags
