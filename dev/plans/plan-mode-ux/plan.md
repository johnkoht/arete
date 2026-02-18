---
title: Plan Mode Ux
slug: plan-mode-ux
status: completed
size: medium
created: 2026-02-18T04:36:21.546Z
updated: 2026-02-18T05:39:56.000Z
completed: 2026-02-18T05:39:56.000Z
blocked_reason: null
previous_status: null
has_review: true
has_pre_mortem: true
has_prd: true
backlog_ref: null
steps: 5
---

Great — thanks for the context dump. Based on latest commits, this is a **medium-sized UX refactor** (state + widget + execution progress source + tests), not a tiny tweak.

### Do we need pre-mortem or PRD?

- **Pre-mortem:** **Yes, recommended** (not strictly mandatory), because we’re changing execution UX/state and could regress plan-mode behavior.
- **PRD:** **Not required** unless you want to run this through the autonomous PRD pipeline. I’d skip PRD for this and do direct execution.

---

## Plan:

1. **Define UX contract (single source of truth + role labels)**
   - Finalize compact status format:
     - `Role: <role> · PRD: X/Y complete · Current: #N <title> · Status: <state>`
   - Define role mapping:
     - plan mode default → `PM`
     - pre-mortem/build → `EM`
     - review → `Reviewer`
     - fallback when unknown → `Agent`
   - Define when to show PRD progress vs legacy todo progress.

2. **Add PRD progress reader (from `dev/autonomous/prd.json`)**
   - Add a pure helper to parse:
     - total tasks
     - completed tasks
     - current in-progress/pending task title + id
   - Include safe fallback behavior if file missing/invalid.
   - Keep legacy `todoItems` path for non-PRD build flow.

3. **Refactor status/widget rendering to compact mode**
   - Update footer/widget rendering to prefer one-line compact status during `/build` with PRD.
   - Hide full checkbox list by default in PRD execution mode.
   - Keep detailed list available via explicit command (`/build status` full output).

4. **Surface active persona cleanly**
   - Add/derive `activeRole` from `activeCommand` (and optionally execution context).
   - Render role badge/text in the same compact status line.
   - Ensure only one role is shown at a time to avoid EM/Developer confusion.

5. **Tests + validation**
   - Add/update tests for:
     - PRD parsing helper (valid/missing/invalid/edge cases)
     - compact status rendering (role/progress/current task)
     - fallback to todo mode when no PRD
   - Run quality gates:
     - `npm run typecheck`
     - `npm test`

---

If you want, next I can run a quick **pre-mortem-only pass** on this plan (risks + mitigations, 5–10 min), then implement.