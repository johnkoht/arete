---
name: plan-to-prd
description: Convert an approved plan into a PRD, prd.json, and handoff prompt for autonomous execution via execute-prd.
category: build
work_type: development
---

# Plan to PRD Skill

Convert an approved plan (from Plan Mode or a multi-step markdown plan) into a proper PRD, generate prd.json for the autonomous agent loop, and create a handoff prompt for a new agent to execute via execute-prd.

⚠️ **INTERNAL TOOLING** — For developing Areté itself, not for end users.

## When to Use

- User chose "Convert to PRD" when offered the PRD path in Plan Mode
- After the plan-pre-mortem rule offers the choice and user selects the PRD path

## Prerequisites

- An approved plan is in context (the markdown plan with steps)
- You are in BUILDER mode (Areté development repo)

## Workflow

### 1. Derive Feature Name

From the plan title or first step, derive a kebab-case feature name (e.g. `slack-integration`, `search-provider-upgrade`).

### 2. Create PRD File

Create `dev/prds/{feature-name}/prd.md` with this structure:

- **Goal** — One or two sentences summarizing what this work achieves (from the plan)
- **User Stories / Tasks** — One per plan step (or group related steps)
- **Acceptance Criteria** — For each task: explicit criteria. If inferred from the plan, add a note: `<!-- inferred from plan -->`

Reference `dev/prds/intelligence-and-calendar/prd.md` for format. Ensure each task has:
- Clear title
- Description
- At least one acceptance criterion

### 3. Run prd-to-json

Load `.agents/skills/prd-to-json/SKILL.md` and follow its workflow to convert the PRD to `dev/plans/{feature-name}/prd.json`. Use the PRD you just created at `dev/prds/{feature-name}/prd.md`.

### 4. Create Handoff File (Optional)

> **Note**: When using Pi with plan mode, you can use `/build` to start execution directly. The handoff file is optional — useful for manual execution or Cursor-based workflows.

Create `dev/prds/{feature-name}/EXECUTE.md` with this content (replace `{feature-name}`):

```markdown
# Execute {feature-name} PRD

## Pi (preferred)

Open the plan in plan mode and use `/build`:

```
/plan open {feature-name}
/build
```

## Manual (fallback)

Execute the {feature-name} PRD. Load the execute-prd skill from `.pi/skills/execute-prd/SKILL.md`. The PRD is at `dev/prds/{feature-name}/prd.md` and the task list is at `dev/plans/{feature-name}/prd.json`. Run the full workflow: pre-mortem → task execution loop → holistic review.
```

### 5. Present Summary to User

Output:

```
✅ PRD and execution artifacts created

**Feature**: {feature-name}
**PRD**: dev/prds/{feature-name}/prd.md
**Task list**: dev/plans/{feature-name}/prd.json
**Handoff prompt**: dev/prds/{feature-name}/EXECUTE.md (optional)

**Next step**: Use `/plan open {feature-name}` then `/build`, or start a new Pi session and invoke execute-prd manually.
```

## Parsing Tips

When converting plan steps to PRD tasks:

- **One step → one task**: If the plan has discrete steps, map each to a task
- **Group related steps**: Small sub-steps can be combined (e.g. "Add tests" + "Run typecheck" → one task with both as acceptance criteria)
- **Acceptance criteria**: Look for "should", "must", "will" in step text. If missing, derive from the step description and flag with `<!-- inferred -->`
- **Dependencies**: If steps clearly depend on each other, note in task descriptions; prd-to-json will create ordered tasks

## References

- **PRD example**: `dev/prds/intelligence-and-calendar/prd.md`
- **prd-to-json skill**: `.agents/skills/prd-to-json/SKILL.md`
- **execute-prd skill**: `.pi/skills/execute-prd/SKILL.md`
- **Schema**: `dev/autonomous/schema.ts` (may move in Phase 2)
