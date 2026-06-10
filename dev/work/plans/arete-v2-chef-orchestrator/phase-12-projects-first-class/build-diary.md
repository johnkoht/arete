# Build Diary — phase-12-projects-first-class

> Suborchestrator's running log. Written for John catching up over coffee: what happened, what was decided, why. Newest entries at the bottom.

---

## 2026-06-10T06:11Z — Ship started (Phase 0)

Suborchestrator online in worktree `agent-a4515b3b04126e6e0` (branch `worktree-agent-a4515b3b04126e6e0`). Verified worktree isolation (`git rev-parse --git-dir` → `.git/worktrees/...`, not plain `.git`).

**First surprise, resolved**: the worktree branch was cut at `74370a1e` — one commit before your amendment commit (`619b621c`). The plan I had was `status: draft` with no Amendment section. Fast-forward merged `619b621c` into the branch (shared object DB; main repo working tree untouched). Now have the approved plan + amendment + your rescue checklist.

Orientation reading done: AGENTS.md, ship SKILL + build-log-protocol + orchestrator.md, subagent-dispatch standard, learnings-protocol, review-plan SKILL, plan + amendment + pre-mortem, memory/MEMORY.md + collaboration.md.

**Execution-environment note (deviation from dispatch protocol, documented per its own rules)**: this harness has no `subagent()` tool (that's the pi environment; here I have Bash/Read/Edit/Write + `claude` CLI). Per `.pi/standards/subagent-dispatch.md` pre-flight, the sanctioned fallback is "continue as single agent" — but I can do better: I'll dispatch headless `claude -p` runs for the independent reviews (cross-model review, final review) so review eyes stay separate from builder hands, and execute development tasks directly myself with the full execute-prd discipline (per-task commits, typecheck + targeted tests per task, phantom-task detection, dark-code audit). Sequential only, per collaboration.md hard constraint. If headless dispatch proves flaky I fall back to self-review with the reviewer role prompt and say so here.

Build log initialized at `dev/executions/phase-12-projects-first-class/build-log.md`.

Scope locked from amendment: **Slices A+B+C only** (AC1, AC2, AC3, AC4, AC6, AC10, AC11, AC12). No AC5/AC7/AC8/AC9, no scaffolding for them. AC11 is the hard gate: glance-2-mvp brief section count 1 → 4+ or STOP.
