---
name: prd-to-json
description: Standalone converter — given an existing prd.md without a prd.json, parse it and emit the JSON task list. Use plan-to-prd instead when starting from a plan.
category: build
work_type: development
primitives: []
requires_briefing: false
---

# PRD to JSON Skill

Convert a standalone `prd.md` to `prd.json` for autonomous execution. Use this only when you already have a `prd.md` but no `prd.json`. For all new work, use `plan-to-prd` which emits both files simultaneously.

⚠️ **INTERNAL TOOLING** — For developing Areté itself, not for end users.

## When to Use

- You have a `prd.md` without a corresponding `prd.json`
- Recovering from a partial plan-to-prd run
- **Not** when starting from a plan — use `/plan-to-prd` instead

## Workflow

### 1. Locate and Read the PRD

Read `dev/work/plans/{slug}/prd.md`. Confirm it has tasks/user stories with acceptance criteria.

### 2. Parse and Emit prd.json

Extract tasks from the PRD and write `dev/work/plans/{slug}/prd.json` using this schema:

```json
{
  "name": "{slug}",
  "branchName": "feature/{slug}",
  "goal": "Goal statement from PRD",
  "userStories": [
    {
      "id": "task-1",
      "title": "Task title",
      "description": "Task description",
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

**Acceptance criteria**: look for "Acceptance Criteria", "Definition of Done", "MUST/SHOULD/WILL" lists, or `- [ ]` checkboxes. If none found, derive from task description and flag: `⚠️ Task X: criteria derived`.

**Task IDs**: kebab-case from title or sequential (`task-1`, `task-2`). Must be unique.

**Validation before writing**:
- [ ] All tasks have unique IDs
- [ ] All tasks have at least one AC
- [ ] `status: "pending"`, `attemptCount: 0` on all tasks
- [ ] `metadata.totalTasks` matches array length

### 3. Confirm

```
✅ prd.json created

Feature: {slug}
Tasks:   {N}
Output:  dev/work/plans/{slug}/prd.json
```

## References

- **Schema**: `dev/autonomous/schema.ts`
- **Full plan-to-PRD workflow**: `.pi/skills/plan-to-prd/SKILL.md`
