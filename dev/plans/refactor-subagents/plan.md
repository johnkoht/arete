---
title: Refactor Subagents
slug: refactor-subagents
status: draft
size: large
created: 2026-02-19T03:34:57.042Z
updated: 2026-02-20T00:49:07.001Z
completed: null
has_review: true
has_pre_mortem: true
has_prd: true
backlog_ref: null
steps: 2
---

Good news — the e2e validation passing means the system works end-to-end. 

The "small tweak left" is clear: **one stale `dev/autonomous/` reference in an active file**:

**`.pi/agents/developer.md` line 116:**
```
> **Important**: The orchestrator provides the execution state path in your task prompt under `**Execution State Path**`. Always use that path — do not write to `dev/autonomous/`.
```

The sentence correctly tells the developer agent to use the orchestrator-provided path, but the negative example still names `dev/autonomous/` — which is the old system. This should be cleaned up so the agent definition has zero legacy path references (Task 3 AC: "grep dev/autonomous .pi/agents/*.md returns zero hits").

---

**Plan:**

1. **Fix `.pi/agents/developer.md` line 116** — Remove the `dev/autonomous/` reference. Change to something like: `"Always use that path — never hardcode execution state paths."` (same instruction, no legacy path name).

2. **Verify** — grep `.pi/agents/*.md` for `dev/autonomous` → zero hits.

---

This is **tiny** (1 step + verify). Ready to execute directly when you `/plan` off.