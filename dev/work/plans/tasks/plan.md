---
title: Tasks
slug: tasks
status: idea
size: medium
tags: [primitives, core, primary-tool]
created: 2026-03-08T22:16:00.000Z
updated: 2026-03-09T03:18:35.185Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

Saved to the Tasks plan:

**Files created:**
- `dev/work/plans/tasks/plan.md` — full plan with design, success criteria, open questions
- `dev/work/plans/tasks/notes.md` — discussion context and decision points

---

**Summary of what's captured:**

| Section | Content |
|---------|---------|
| Problem | No primitive for personal work items (non-relational) |
| Strategic context | The "primary tool" bet — why Task is needed |
| Task vs Commitment | The spectrum from relational to personal |
| Proposed design | Lean properties: text, status, due, project |
| Storage | Structured (`.arete/tasks.yaml`) — matches Commitments |
| Cmd+K integration | "add task: X" vs "add commitment: send Sarah X" |
| Sync story | Future Linear/Asana/Notion sync |
| Out of scope | Subtasks, priorities, labels, recurring |
| Size | Medium (4-5 steps) — recommend `/pre-mortem` |

---

**Open questions still to resolve:**
1. File vs YAML storage (leaning YAML)
2. Where in web app (new Tasks page vs Dashboard integration)
3. Relationship to scratchpad (capture → triage?)
4. Due date semantics (soft vs hard)

Want to continue refining, or park this and come back to it?