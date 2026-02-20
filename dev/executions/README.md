# Execution State Directory

Per-run state for autonomous PRD execution via the `execute-prd` skill. Each execution gets its own subdirectory, isolated from other runs.

## Structure

```
dev/executions/
├── README.md           # This file (committed)
├── .gitkeep            # Keeps directory in git
└── <plan-slug>/        # One per execution run (gitignored)
    ├── prd.json        # Copied from dev/work/plans/<slug>/prd.json at start; updated during execution
    ├── status.json     # Run metadata and progress tracking
    └── progress.md     # Append-only log of task completions, learnings, reflections
```

## Lifecycle

1. **Builder** runs `/build` or invokes execute-prd manually
2. **Orchestrator** creates `dev/executions/<plan-slug>/` and copies `prd.json` from `dev/work/plans/<slug>/prd.json`
3. **Orchestrator** creates `status.json` (see schema below) and `progress.md`
4. **For each task**: Orchestrator dispatches to developer subagent → reviewer reviews → orchestrator updates `prd.json`, `status.json`, and `progress.md`
5. **On completion**: Orchestrator performs holistic review, updates `status.json` to `completed`, creates memory entry

## status.json Schema

```json
{
  "planSlug": "feature-x",
  "status": "queued | running | paused | blocked | completed | failed",
  "startedAt": "2026-02-19T10:00:00Z",
  "updatedAt": "2026-02-19T12:30:00Z",
  "currentTaskId": "task-3",
  "completedTasks": 2,
  "totalTasks": 5,
  "worktree": {
    "path": "/abs/path/to/worktree",
    "branch": "feature-x"
  }
}
```

### Status Values

| Status | Meaning |
|--------|---------|
| `queued` | Created but execution not yet started |
| `running` | Actively executing tasks |
| `paused` | Manually paused by builder |
| `blocked` | Blocked on external dependency or builder input |
| `completed` | All tasks done, holistic review passed |
| `failed` | Execution failed and was not recovered |

## prd.json Format

Same schema as `dev/autonomous/schema.ts` — unchanged from the existing format. The file is **copied** from `dev/work/plans/<slug>/prd.json` at execution start so the plan's source remains clean. Task statuses, commit SHAs, and attempt counts are updated in the execution copy only.

## progress.md

Append-only markdown log. Each entry records:
- Task ID and title
- What was done (implementation summary)
- Files changed
- Quality check results (typecheck, tests)
- Commit SHA
- Reflection (what helped, what was harder than expected, token estimate)

Format:
```markdown
# Progress Log — <plan-slug>

## Task <id>: <title>
**Status**: complete
**Commit**: abc1234

What was done:
- [Summary]

Files changed:
- path/to/file.ts (added/modified)

Quality checks:
- typecheck: ✓
- tests: ✓ (N passed)

Reflection:
[What helped, token estimate]

---
```

## Gitignore

Execution state directories (`dev/executions/*/`) are gitignored — they contain transient run state. Only `README.md` and `.gitkeep` are committed.

## End-to-End Workflow

```
1. Plan created          → dev/work/plans/<slug>/plan.md
2. PRD written           → dev/work/plans/<slug>/prd.md
3. Tasks generated       → dev/work/plans/<slug>/prd.json
4. /build or manual      → Orchestrator reads prd.json from dev/work/plans/<slug>/
5. Execution starts      → dev/executions/<slug>/ created with copied prd.json + status.json + progress.md
6. Tasks execute         → Developer subagents work in worktree cwd, commit to branch
7. State tracked         → prd.json + status.json + progress.md updated per task
8. Holistic review       → Orchestrator validates PRD goals met
9. Memory captured       → memory/entries/YYYY-MM-DD_<slug>-learnings.md
10. Cleanup              → Builder merges branch, optionally removes execution dir
```
