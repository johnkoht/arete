# Rollback — phase-14-project-write-back (AC9)

Every surface this phase added is independently revertible; nothing phase-12/13 shipped depends on any of it.

## Code + prose (git revert)

Reverting the phase-14 build commits removes, cleanly and completely:

| Surface | Commits (this branch) | Coupling |
|---|---|---|
| PATTERNS.md `propose-edits-back-to-source-doc` entry | `1202b771` | none — appended section |
| `project-topics.ts` + `WikiMatch.score` + `Project.topics?` read-model + barrel exports | `9b97f844`, `09dbb4d1` | `score` is additive on WikiMatch (no consumer branches); read-model fields optional |
| `arete project refresh-topics` CLI verb + subprocess tests | `6654fc31` | registered subcommand only; `open`/`backfill-area` untouched |
| `/update-project` SKILL.md + `/project` pointer line + prose tests | `9ba1661f` | skill is new (revert removes whole, MC2); /project pointer is one sentence |
| june-fixation integration test | `66f29803` | test-only |
| finalize-project retro step + tests | `25cb4d9a` | prose-only addition to an old skill (revert restores prior text verbatim) |
| docs (cli-commands.md, capabilities.json) | `78c8421d` | doc-only |

`git revert` of these in reverse order (or a single revert of the merge commit) restores the phase-13 surface exactly. MC2 honored: update-project (whole-skill revert), finalize-project (prose revert), refresh-topics (verb revert) are mutually independent.

## Workspace data (user-side, no code needed)

- **`topics:` + `topics_refreshed:` frontmatter + ownership comment**: removable by deleting the two keys and the comment line from any README — NO consumer depends on them (R10; enforced by the behavioral brief-equality test + source tripwire in `project-topics.test.ts`). After code revert, stale cache fields are inert decoration.
- **Retro entries** (`## Closed project: …` in `items/decisions.md`): ordinary memory items — delete the section to remove; `arete memory refresh` re-converges area memory pointers on the next run.
- **Applied `/update-project` README edits**: ordinary git-tracked workspace changes, revertible per-diff in the workspace repo.

## Spot-verification (performed 2026-06-11)

- `git diff 24b0f816..HEAD -- packages/core/test/services/project-area.test.ts packages/cli/test/commands/project.test.ts` → 0 lines: the phase-12 surfaces this phase must not regress were never edited, so a revert cannot orphan them.
- R10 no-consumer guards green (`project-topics.test.ts`): deleting `topics:` from a README provably changes no brief output.
- The retro format-contract test (`closed-project-retro.test.ts`) exercises only pre-existing machinery (`parseMemoryItemEntries`) — reverting phase 14 leaves that machinery untouched and the test file goes with the revert.
