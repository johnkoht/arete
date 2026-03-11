---
title: Ship It
slug: ship-it
status: idea
size: unknown
tags: []
created: 2026-03-11T04:26:36.778Z
updated: 2026-03-11T04:31:51.925Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: true
steps: 3
---

Saved to `dev/work/plans/ship-it/notes.md`.

## Summary

**Ship It** — a mega-build skill that automates steps 3-9 of your workflow:

| Phase | What happens | Gate |
|-------|-------------|------|
| **Commit** | Save plan, pre-mortem, review, PRD → commit to main | CRITICAL risks or blockers pause |
| **Isolate** | Create worktree via `@zenobius/pi-worktrees` | onCreate runs `npm install` |
| **Build** | Open iTerm, execute-prd in worktree | Task failures pause |
| **Review** | Eng lead final review, wrap | Major issues pause |
| **Report** | Commit, leave as PR, report summary | Human merges |

**Cleanup**: `/ship cleanup <slug>` removes worktree after merge.

---

**Next steps to shape this into a formal plan:**

1. Should we install `@zenobius/pi-worktrees` now to explore its API?
2. Do you want cross-platform support (Linux/Windows) or macOS-only for V1?
3. Any changes to the gates before we formalize?

When you're ready, I can turn this into a numbered plan with acceptance criteria for `/approve` → `/prd` → `/build`.