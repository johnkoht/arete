# Phase 12 (slices A+B+C) — Rollback (AC12)

## Code + skill prose

All changes land as per-task commits on this branch; `git revert` of the
build commits (or reverting the merge commit with `git revert -m 1 <sha>`)
removes everything:

| Commit | Scope |
|---|---|
| 77e10373 | AC1 read-path parser (core) |
| a15f9c69 | AC6 visible message + R9 warning (core) |
| 116f5e18 | AC1 creation-time proposal prose (3 skills) |
| 65b6b768 | AC2 backfill CLI + project-area core helpers |
| 8f759add | AC4 topic-aware brief (core) |
| 88a790a8 | AC3 open flow (cli + core what's-new) |
| 17c1f87f | /project skill + prose tests |
| (wrap) | docs (cli-commands.md, AGENTS.md), dist rebuild |

No schema migration to unwind. No data files are touched by the merge itself.

## Workspace data (live, post-merge — John-operated)

- `arete project backfill-area --apply` is reversible at any time via
  `arete project backfill-area --reset` — it clears `area:`/`area_set_by:`
  ONLY where `area_set_by: backfill` (creation/manual provenance untouched).
  Spot-verified by tests (`project.test.ts` reset case, `project-area.test.ts`).
- `area:` written by the creation-time skill proposal can simply be deleted
  from the README frontmatter — the read path degrades to the prose line or
  the honest AC6 message.
- `/project` open writes nothing (proven by zero-write tests), so there is
  nothing to roll back for the open flow.

## Out-of-scope fields

No `topics:`/`topics_refreshed:` cache exists in this build (AC5 deferred) —
nothing depends on those keys.
