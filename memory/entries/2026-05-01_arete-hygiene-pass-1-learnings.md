# Areté Hygiene Pass 1 — Learnings

**Date**: 2026-05-01
**Branch**: worktree-arete-hygiene-pass-1
**PRD**: dev/work/plans/arete-hygiene-pass-1/{plan,prd,pre-mortem,review,final-review}.md
**Scope**: ~2.7K LOC removed. packages/core (5 services touched + 1 type alias), packages/cli (3 commands), repo root (`src/`, `test/`, `tsconfig.test.json`), 3 LEARNINGS.md files updated, 1 expertise profile updated.

## What Changed

First simplification pass after the 2026-04-27 review session. Six self-contained tasks landed in pinned T1→T6 order, each independently bisectable:

- **T1** — Deleted pre-monorepo legacy `/src/` (13 files), `/test/` (4 files), `tsconfig.test.json`, and one stale doc reference. None were in any active build path.
- **T2** — Deleted four zero-caller `@deprecated` symbols: `extractKeywords` (area-memory), `findMatchingCompletedItem` (meeting-processing), `getDocument` (krisp/client), `PRODUCT_RULES_ALLOW_LIST` (workspace-structure). Krisp test count: 30 → 29.
- **T3** — Deleted the `person-signals.ts` action-item LLM cluster (`buildActionItemPrompt`, `parseActionItemResponse`, `extractActionItemsForPerson`, plus `RawActionItemResult` type, `VALID_ACTION_ITEM_DIRECTIONS` const, and the orphaned regex fallback). Superseded by `parseActionItemsFromMeeting` in meeting-parser.ts. 51 tests removed; 1148 LOC gone.
- **T4** — Deleted unused `ContextService.getContextForSkill` + doc reference.
- **T5** — Converted `ToolService` class to free `listTools` / `getTool` functions. 4 production call sites + factory + barrel + 2 test files migrated. Discovered worktree's wholesale `node_modules` symlink-to-main bypassed `@arete/core` resolution; replaced with proper local install.
- **T6** — Extracted module-private `buildTopicWikiContext` helper from `meeting-context.ts:978–1025` into a 47-line block → 4-line caller. Refactor backlog item flagged by wiki-leaning team. Helper returns `{ context?, warning? }` with the caller assigning conditionally to preserve "absent key" semantics.

Plus a mid-flight rebase: while autonomous work was in progress, main moved 6 commits ahead (v0.9.1 + v0.9.2 reconciliation hardening + calendar-gws-provider plan). Initial rebase hit conflicts in `meeting-processing.ts`; aborted and switched to merge for cleaner conflict resolution. Only sourcemap conflicts remained — resolved by taking ours and rebuilding dist.

## Metrics

- **Commits**: 8 (6 task commits + 1 merge + 1 dist rebuild)
- **Net LOC**: ~2,700 removed (T1 ~2K, T3 1148, T2 ~50, T4 ~25, T5 net -30, T6 net 0)
- **Tests removed**: 51 (T3 dead-code coverage) + 1 (T2 krisp). Net -52.
- **Pre-mortem risks identified**: 10 (0 CRITICAL, 4 HIGH, 3 MEDIUM, 3 LOW)
- **Risks materialized**: 0 of 10
- **Reviewer dispatches**: 4 (pre-mortem, plan-review, final-review, plus the post-merge re-test)
- **Test count after merge**: 588/588 passing across affected modules + reconciliation suites

## Pre-Mortem Effectiveness

| Risk | Severity | Materialized? | Mitigation Effective? |
|------|----------|---------------|------------------------|
| R1 T6 helper name collides with `buildTopicWikiContextSection` | HIGH | No | Yes — kept module-private (no `export`); not added to barrel |
| R2 T6 caller-observable warning shape drift | HIGH | No | Yes — helper returns `{ context?, warning? }` shape; caller pattern locked in plan Decisions #7 |
| R3 T5 dist artifacts not rebuilt | HIGH | No | Yes — `npm run build` mandatory before merge; AC required dist staged |
| R4 T2 task-ordering vs T1 (legacy test/) | HIGH | No | Yes — pinned T1→T2 order in Decisions #6; commit log shows T1 first |
| R5 T5 untracked consumers of `services.tools` | MEDIUM | No | Yes — cross-package grep audit AC; zero hits in apps/, runtime/, cli/lib/ |
| R6 T3 type-only imports linger | MEDIUM | No | Yes — explicit grep AC for `RawActionItemResult|VALID_ACTION_ITEM_DIRECTIONS` |
| R7 T6 silently changes key-presence semantics | MEDIUM | No | Yes — caller never assigns `bundle.topicWikiContext = undefined`; existing tests use `assert.equal(x, undefined)` which is satisfied either way |
| R8 T1 deletion of tsconfig.test.json breaks IDE workflow | LOW | No | None needed — reversible |
| R9 T4 dist mirror not propagated | LOW | No | Yes — verified no dist mirror of PROFILE.md exists; AC noted as N/A |
| R10 T5 namespace collision on listTools/getTool | LOW | No | Yes — namespace comment in `services/index.ts` |

**Pre-mortem score**: 10/10 retired pre-merge. Zero risks shipped.

## What Worked / What Didn't

**+** **Pinned task order in Decisions log saved a real conflict.** Pre-mortem R4 caught that T2's `PRODUCT_RULES_ALLOW_LIST` deletion had test callers in legacy `test/` (deleted by T1). If T2 had landed first, that commit would be red on bisect. Pinning T1→T6 in the plan + PRD prevented this. Worth remembering: when a deletion has callers in code being deleted by another task, order is load-bearing.

**+** **Per-task targeted tests + final review subagent gave high confidence without a full-suite run.** The `npm test` full suite hung twice with TAP-reporter buffering (the wiki-leaning team's documented failure mode). Per-task tests (krisp 29/29, person-signals 47/47, meeting-context 66/66, tools+factory 13/13, context 18/18) plus the final-review subagent's independent re-runs gave the same signal as the full suite would have. Worth doing both for paranoia, but neither alone is a blocker.

**+** **Final-review subagent caught the in-flight main divergence.** Phase 4.2 reviewer noted "main has 6 commits since divergence" while doing the audit. Without that explicit check, I'd have built dist, then hit merge conflicts at gate-time. Reviewer flagging this prompted a rebase attempt before Phase 4.3 — much cleaner than discovering it later.

**+** **Module-private helpers don't need barrel exports.** T6's `buildTopicWikiContext` is intentionally not exported, not added to `services/index.ts`. The pattern: helpers serving exactly one caller stay file-private; only cross-module consumers get barrel inclusion. The plan's R1 mitigation made this explicit and tests passed without barrel access.

**—** **Worktree node_modules symlink trick silently broke `@arete/core` resolution.** Initial setup `ln -s /Users/john/code/arete/node_modules ./node_modules` worked for T1–T4 because they didn't change `@arete/core`'s public surface. T5 changed the barrel exports — and `node_modules/@arete/core → ../../packages/core` resolved through the SYMLINK to MAIN repo's `packages/core`, not the worktree's. Typecheck failed mysteriously despite the source being correct. Fix: replace the wholesale node_modules symlink with `npm install` in the worktree. Lesson for future worktree setup: **don't symlink node_modules to the parent — do a fresh install.** The 13-second install cost beats hours of debugging "why does typecheck claim listTools doesn't exist when it's right there in dist."

**—** **TAP reporter hangs on full-suite runs in background.** This is the wiki-leaning learning verbatim. Even `--test-reporter=spec` + `stdbuf -oL -eL` + `tee` couldn't finish reliably; the run completed but the output pipeline hung in the bash tool's wait state. Workaround: targeted test files with explicit list (588 tests across 14 files completed in ~60s). For future ship orchestration, default to targeted runs over full-suite; full-suite is last-mile validation if at all.

**—** **Rebase fell over on the same file twice (`meeting-processing.ts`).** Both my T2 (delete `findMatchingCompletedItem`) and main's `applyReconciliationDecision` extraction touched this file. Rebase tried to apply T2 onto main's already-changed file and conflicted. Switched to merge; only sourcemap conflicts remained. Lesson: for feature branches with surgical deletions in actively-developed files, prefer merge over rebase when main has heavy refactoring nearby.

## Recommendations

**Continue**:
- Pin task order explicitly in plan Decisions when one task's caller deletion enables another's symbol deletion (T1→T2 pattern).
- Each task gets its own commit with verification ACs in commit body — easy bisect, easy revert.
- Final-review subagent runs as a hard gate before dark-code audit + wrap. Independent eyes catch divergence.
- Module-private helpers when only one caller exists; don't pollute barrels.

**Stop**:
- Symlinking `node_modules` between worktree and parent. Always do a local install in the worktree, even if it's slower (npm install was 13s for this repo).
- Running full `npm test` in background bash with `tee` pipelines. Use targeted runs.
- Rebase when main has heavy refactoring on files we surgically delete from.

**Start**:
- Capture the affected-test-file list in the PRD/build-log so the executor can run targeted tests at each task without re-discovering them.
- Document "node_modules-in-worktree" setup as a one-line `npm install` step in the ship skill's Phase 3 (right after `git worktree add`).
- Compute the `git rev-list --count HEAD..main` divergence at the START of Phase 4 (build) — earlier than 4.2's reviewer-noticed flag — so we can plan rebase vs merge before doing the work.

## Follow-ups

- **None blocking merge.** All ACs satisfied, all 10 pre-mortem risks closed, dark-code audit clean, dist rebuilt and committed.
- **Future hygiene-pass-2 candidates** (deferred from this PRD):
  - Compat migration (`packages/core/src/compat/`): 5 CLI commands + 2 backend services consume; needs its own plan with test rewrites.
  - CLI deprecation collapse (`context --for`, `memory search`, `memory timeline`): touches AGENTS.md:66 + skill prose; needs deprecation window plan.
  - Build-mode → Claude Code skill migration: separate project per user direction.
- **Memory note worth respecting next time**: "Test framework buffering with `--test-reporter` default + bash tool background heuristic" — the wiki-leaning team flagged this and we re-discovered it. Their workaround (`stdbuf` + spec + name-pattern) is necessary for full-suite, but targeted runs are still faster and more reliable.
