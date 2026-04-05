---
name: plan-to-prd
description: Convert an approved plan into both prd.md and prd.json simultaneously, plus an optional EXECUTE.md handoff. Outputs all execution artifacts in one pass.
category: build
work_type: development
---

# Plan to PRD Skill

Convert an approved plan into a PRD (`prd.md`), structured task list (`prd.json`), and optional handoff prompt (`EXECUTE.md`) — all in one pass.

⚠️ **INTERNAL TOOLING** — For developing Areté itself, not for end users.

## When to Use

- User chose "Convert to PRD" when offered the PRD path in Plan Mode
- Ship Phase 2.2: converting plan artifacts to execution-ready PRD

## Prerequisites

- An approved plan is in context or at `dev/work/plans/{slug}/plan.md`
- You are in BUILDER mode (Areté development repo)

## Workflow

### 1. Derive Feature Name

From the plan title, derive a kebab-case slug (e.g. `slack-integration`, `search-provider-upgrade`). Use this as the directory name under `dev/work/plans/`.

### 2. Create prd.md

Create `dev/work/plans/{slug}/prd.md`:

- **Goal** — One or two sentences summarizing what this work achieves
- **Tasks** — One per plan step (group sub-steps where they naturally belong together)
- **Acceptance Criteria** — Explicit, testable criteria per task. If inferred from plan, flag: `<!-- inferred from plan -->`

Each task must have: clear title, description, at least one acceptance criterion.

**Reference format**: `dev/work/archive/intelligence-and-calendar/prd.md`

**Parsing tips**:
- One plan step → one task (or group small sub-steps into one task with multiple ACs)
- Look for "should", "must", "will" in step text for acceptance criteria
- If none: derive from step description and flag with `<!-- inferred -->`

### 3. Generate prd.json

**Immediately after creating prd.md**, generate `dev/work/plans/{slug}/prd.json` from the same internal representation — do NOT re-parse the markdown. The structured data (tasks, ACs, dependencies) is already in context.

Use this schema:

```json
{
  "name": "{slug}",
  "branchName": "feature/{slug}",
  "goal": "High-level goal from PRD",
  "userStories": [
    {
      "id": "task-1",
      "title": "Task title",
      "description": "Detailed description",
      "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
      "status": "pending",
      "passes": false,
      "attemptCount": 0
    }
  ],
  "metadata": {
    "createdAt": "{ISO timestamp}",
    "totalTasks": N,
    "completedTasks": 0,
    "failedTasks": 0
  }
}
```

**Validation before writing**:
- [ ] All tasks have unique IDs (kebab-case: `task-1`, `add-utility-function`, etc.)
- [ ] All tasks have at least one acceptance criterion
- [ ] All tasks have `status: "pending"`, `attemptCount: 0`
- [ ] `metadata.totalTasks` matches array length
- [ ] `branchName` follows `feature/{slug}` convention

> **Note**: `progress.md` is created by execute-prd at execution time. Do not create it here.

### 4. Create EXECUTE.md (Optional)

> Skip if using `/ship` — it handles execution via `/build` directly.

Create `dev/work/plans/{slug}/EXECUTE.md`:

```markdown
# Execute {slug} PRD

## Pi (preferred)

/plan open {slug}
/build

## Manual (fallback)

Load `.pi/skills/execute-prd/SKILL.md`. PRD at `dev/work/plans/{slug}/prd.md`, tasks at `dev/work/plans/{slug}/prd.json`.
```

### 5. Present Summary

```
✅ PRD artifacts created

Feature: {slug}
PRD:      dev/work/plans/{slug}/prd.md
Tasks:    dev/work/plans/{slug}/prd.json ({N} tasks)
Handoff:  dev/work/plans/{slug}/EXECUTE.md (optional)

Next step: /plan open {slug} then /build, or /ship for full automation.
```

## References

- **PRD example**: `dev/work/archive/intelligence-and-calendar/prd.md`
- **Schema**: `dev/autonomous/schema.ts`
- **Standalone JSON-only conversion**: `.pi/skills/prd-to-json/SKILL.md`
- **execute-prd**: `.pi/skills/execute-prd/SKILL.md`
