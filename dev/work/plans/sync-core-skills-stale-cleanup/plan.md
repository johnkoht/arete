---
title: "syncCoreSkills Stale Directory Cleanup"
slug: sync-core-skills-stale-cleanup
status: idea
size: small
tags: [improvement, install]
created: 2026-02-22T19:45:00Z
updated: 2026-02-22T19:45:00Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# syncCoreSkills Stale Directory Cleanup

**Source**: Engineering lead review of router-fix-skill-rename PRD (2026-02-22)

## Problem

`syncCoreSkills()` in `packages/core/src/services/workspace.ts` copies skills from source → target but **never removes stale target directories** that no longer exist in source. When a skill is renamed (e.g., `onboarding` → `getting-started`), `arete update` creates the new directory but leaves the old one behind. Users end up with both, and the router sees both in the candidate pool.

Currently mitigated by disambiguation tests (the stale skill doesn't win over the renamed one), but the stale directory is confusing and wastes disk space.

## Suggested Direction

Add stale detection to `syncCoreSkills()`:
1. After copying source → target, identify target directories that exist but have no corresponding source directory
2. Filter out community/user-installed skills (check `.arete-meta.yaml` sidecar or override set)
3. For remaining stale dirs: either auto-remove or log a warning via `arete status`
4. Must NOT delete user customizations — only skills that were originally core and are no longer shipped

## Constraints

- Must preserve community skills installed via `arete skill install`
- Must preserve user overrides (skills in the override set)
- Should be safe by default (warn, don't delete, unless `--prune` flag is passed)

## References

- `packages/core/src/services/workspace.ts` L470-510 (`syncCoreSkills`)
- `packages/runtime/tools/LEARNINGS.md` — documents the gap
- `memory/entries/2026-02-22_router-fix-skill-rename.md` — origin of this backlog item
