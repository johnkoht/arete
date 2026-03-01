---
title: Agent Experts
slug: agent-experts
status: idea
size: unknown
tags: []
created: 2026-03-01T05:01:42.408Z
updated: 2026-03-01T20:00:12.734Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 3
---

## Summary

Two-dimensional agent composition: **expertise profiles** (deep codebase knowledge) composed with **roles** (behavioral overlays like developer, reviewer, orchestrator). A **planner** agent is the default persona that routes to experts and synthesizes their feedback.

## Key Decision: Go All-In on `.pi/` (2026-03-01)

All BUILD mode infrastructure consolidates under `.pi/`:
- `.pi/agents/` — role definitions (already there)
- `.pi/skills/` — build skills (move from `.agents/skills/`, drop symlinks)
- `.pi/expertise/` — NEW expertise profiles (core, CLI, etc.)
- `.agents/sources/` — stays for AGENTS.md generation pipeline (open: could move)

Rationale: Build skills depend on pi's `subagent()` tool — no portability to preserve. The existing symlinks from `.agents/skills/` → `.pi/skills/` proved pi is the real consumer.

## Phased Approach

- **Phase 0**: Consolidate build infra in `.pi/` (move skills, remove symlinks)
- **Phase 1**: Create 2 expertise profiles (core + CLI) — test manually
- **Phase 2**: Restructure AGENTS.md as planner context (lighter)
- **Phase 3**: Role cleanup, composition model, execute-prd updates
- **Phase 4**: Deep maintenance triggers

## Open Questions

- Where does `.agents/sources/` end up? (stay, `.pi/sources/`, or `dev/`)
- Minimum content for a useful PROFILE.md?
- Cross-cutting work spanning multiple profiles?
- `.cursor/rules/` thinning strategy?

See `notes.md` for full exploration, artifact structure, and workflow examples.