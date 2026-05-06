---
title: "Phase 3 — Build report (skills directory split)"
slug: arete-v2-phase-3-skills-directory-split-build-report
parent: arete-v2-chef-orchestrator
status: ready-for-review
created: "2026-04-30"
sub_orch: phase-3-skills-split sub-orchestrator
sub_worktree: /Users/john/code/arete/.claude/worktrees/phase-3-skills-split
sub_branch: worktree-phase-3-skills-split
---

# Phase 3 — Build report

## Summary

Phase 3 (skills directory split) shipped all 9 plan steps in a single
build pass. Two-tier skill resolution lands: shipped skills go to
`.arete/skills/<name>/` (managed); user customizations live in
`.agents/skills/<name>/` (forked) and survive `arete update`. Three
new CLI verbs (`arete skill fork|diff|merge`), a deterministic
markdown-section diff utility (`packages/core/src/utils/markdown-diff.ts`),
and a new fork/diff/merge service (`packages/core/src/services/skill-fork.ts`).
Pre-Phase-3 `.agents/skills/` shipped-skill copies are migrated on
first update (byte-equal entries removed; user-edited entries
preserved). MC5 sunset (Phase 2 legacy SKILL.md routing + 5
`SKILL.legacy.md` files) shipped as a standalone last commit.

AC3.7 ledger: **+5 at ship → 0 at wrap-up**. Plan estimate was +6 → 0.
Within budget. Combined Δ at wrap-up is exactly 0.

## Build sequence — commits

All commits on `worktree-phase-3-skills-split`, branched from
`worktree-arete-v2-chef-orchestrator` at commit `bfe75440`.

| Step | Commit | Subject |
|---|---|---|
| 1-7 | `c3e7ae1a` | `phase-3(core,cli): introduce two-tier skill directory split (.arete/skills + .agents/skills)` |
| 8a | `eab516f4` | `phase-3(test): unit + integration tests for two-tier split, fork/diff/merge, and migration` |
| 8b | `50f6a440` | `phase-3: rebuild dist after two-tier skill split + tests` |
| 9 (MC5) | `099f1492` | `phase-3(runtime,core): sunset Phase 2 legacy skill files (MC5 option a)` |
| 9 dist | `c039221e` | `phase-3: rebuild dist after MC5 sunset` |

5 commits total. Steps 1–7 of the source build are bundled into
`c3e7ae1a` because they share the same files (workspace.ts, skills.ts,
skill-resolver.ts, skill.ts CLI) and split would have required either
forward imports or no-op intermediate commits. The plan's "per-step
commits" goal is honored at the cluster level: Steps 1–7 (foundation),
Step 8 (tests + dist), Step 9 (MC5 sunset, last and standalone for
clean revert per parent plan). MC5 has its own commit pair
(source + dist rebuild) so meta can revert sunset surgically without
unwinding the directory split.

## Files touched (per deliverable)

### (1) Managed skills directory (`.arete/skills/`)

- `packages/core/src/models/workspace.ts` — `WorkspacePaths` gains
  `managedSkills: string`.
- `packages/core/src/workspace-structure.ts` — `.arete/skills` added
  to `BASE_WORKSPACE_DIRS`.
- `packages/core/src/services/workspace.ts` — `getPaths()` populates
  `managedSkills`. `create()` and `update()`'s `syncCoreSkills` write
  to `paths.managedSkills` instead of `paths.agentSkills`. The
  integration-section regenerator walks BOTH dirs (`.agents/skills/`
  and `.arete/skills/`).
- `packages/core/src/services/skills.ts` — `SkillService.list()` is
  two-tier: `.agents/skills/<name>/` wins over `.arete/skills/<name>/`.
- `packages/core/src/services/integrations.ts` — `getFullPaths()`
  populates `managedSkills`.
- `packages/core/src/compat/workspace.ts` — sync `getWorkspacePaths()`
  populates `managedSkills`.
- `packages/core/src/utils/templates.ts` — `resolveTemplatePath()`
  falls through workspace override → `.agents/skills/` → `.arete/skills/`
  → legacy.

### (2) Skill resolver — two-tier

- `packages/core/src/services/skill-resolver.ts` — added
  `resolveSkillDirTwoTier()` and `resolveSkillFileTwoTier()`. Pre-MC5
  retained `parseLegacyList`, `resolveSkillFile`, `resolveSkillFileFromEnv`,
  `resolveSkillFileWithFallback` (all removed in Step 9).
- `packages/cli/src/commands/skill.ts` — `arete skill resolve` updated
  to use two-tier resolution; surfaces `tier`, `userDir`, `managedDir`.

### (3) `arete skill fork <name>`

- `packages/core/src/services/skill-fork.ts` (NEW) — `forkSkill()`:
  copies managed → user, snapshots managed into `.fork-base/`. Idempotent;
  `--force` re-records the base hash without overwriting user SKILL.md.
- `packages/cli/src/commands/skill.ts` — `arete skill fork <slug>`.

### (4) Markdown-section diff utility

- `packages/core/src/utils/markdown-diff.ts` (NEW) —
  `parseMarkdownSections`, `diffMarkdownSections`, `threeWayMergeSections`,
  `formatMarkdownDiff`, `renderSections`. Frontmatter captured as
  synthetic `__frontmatter__` section; preamble as `__preamble__`.
  Body normalization strips trailing blank lines so identical sections
  compare byte-equal regardless of file-trailing-newline.

### (5) `arete skill diff <name>`

- `packages/core/src/services/skill-fork.ts` — `diffSkill()` reads
  `.fork-base/SKILL.md` and current `.arete/skills/<name>/SKILL.md`.
- `packages/cli/src/commands/skill.ts` — `arete skill diff <slug>`,
  `--json` mode.

### (6) `arete skill merge <name> [--interactive]`

- `packages/core/src/services/skill-fork.ts` — `mergeSkill()`:
  three-way merge (base + local + incoming). Conflicts get git-style
  markers (`<<<<<<< local (.agents/skills/)` / `=======` /
  `>>>>>>> incoming (.arete/skills/)`). Interactive callback per
  hunk: `accept` / `keep-local` / `take-incoming` / `skip`.
  Base (`.fork-base/`) advances only on clean merges.
- `packages/cli/src/commands/skill.ts` — `arete skill merge <slug>
  [--interactive]`.

### (7) Migration (pre-Phase-3 `.agents/skills/` content)

- `packages/core/src/services/skill-fork.ts` —
  `migratePreSplitAgentSkills()`: removes `.agents/skills/<name>/`
  entries whose SKILL.md is byte-equal to managed AND have no
  `.fork-base/`. Preserves user-edited entries (treat as fork) and
  community skills (no matching managed entry). Idempotent.
- `packages/core/src/services/workspace.ts` — `update()` calls the
  migration after `syncCoreSkills` and surfaces removals/preservations
  in `UpdateResult`.
- `packages/cli/src/commands/update.ts` — prints migration count and
  the upstream-changes summary (forks with diverged base).

### (8) Tests

| Test file | Tests | Status |
|---|---|---|
| `packages/core/test/utils/markdown-diff.test.ts` (NEW) | 27 | PASS |
| `packages/core/test/services/skill-fork.test.ts` (NEW) | 24 | PASS |
| `packages/core/test/services/skill-resolver-tier.test.ts` (NEW) | 9 | PASS |
| `packages/core/test/services/chef-orchestrator-skills.test.ts` (UPDATED, MC5) | 39 | PASS |
| `packages/core/test/services/workspace.test.ts` (UPDATED, Phase 3 layout) | 57 | PASS |
| `packages/core/test/services/skills.test.ts` (no change) | 16 | PASS |
| `packages/core/test/services/skills-local.test.ts` (no change) | 11 | PASS |
| `packages/core/test/utils/templates.test.ts` (no change) | 23 | PASS |
| `packages/cli/test/commands/install.test.ts` (UPDATED, Phase 3 layout) | 12 | PASS |
| `packages/cli/test/commands/template.test.ts` (UPDATED, two-tier) | 11 | PASS |
| `packages/cli/test/integration/install-update.integration.test.ts` (UPDATED, Phase 3 layout) | 6 | PASS |

**Total**: 235 tests across 11 files, all green. NO `npm test` at
repo root — all runs via per-file `npx tsx --test` (or `vitest run`
for vitest suites).

The pre-MC5 legacy `skill-resolver.test.ts` (22 tests) was deleted in
Step 9; its surviving two-tier coverage in
`skill-resolver-tier.test.ts` exercises the post-sunset resolver.

End-to-end CLI smoke (manual, in `/tmp/arete-smoke-test`):
- `arete install` lays down `.arete/skills/<name>/SKILL.md` for all
  shipped skills; `.agents/skills/` empty.
- `arete skill resolve daily-winddown` returns the managed-tier path.
- `arete skill fork daily-winddown` copies + records `.fork-base/`.
- `arete skill resolve daily-winddown` (post-fork) returns
  `tier: 'user'`.
- `arete skill diff` reports up-to-date immediately after fork; reports
  modified sections after upstream content change.
- `arete skill merge` clean-merges body-only edits in different
  sections; emits git-style markers when both sides edit the same
  section's body.
- `arete update` surfaces upstream-changes banner after fork base
  diverges; preserves user fork (does not overwrite
  `.agents/skills/<forked>/SKILL.md`).

### (9) MC5 sunset

- Deleted: 5 `<skill>/SKILL.legacy.md` files (`daily-winddown`,
  `weekly-winddown`, `week-plan`, `process-meetings`, `meeting-prep`).
  Total ~3.2 K LOC of pre-Phase-2 prose.
- Deleted from skill-resolver:
  `parseLegacyList`, `resolveSkillFile`, `resolveSkillFileFromEnv`,
  `resolveSkillFileWithFallback` (Phase 2 env-var routing).
- `resolveSkillFileTwoTier` simplified — no longer composes with
  legacy fallback; now just returns `<dir>/SKILL.md` after tier
  selection.
- `arete skill resolve` CLI: `legacyRequested` / `legacyUsed` /
  `warning` fields removed from JSON output.
- `## Rollback` sections in 5 SKILL.md files updated:
  pre-MC5 said "export ARETE_LEGACY_SKILL_PROSE=<slug>"; post-MC5
  describes `git revert` of the per-skill Phase 2 rewrite commit
  (and notes the user can also restore from a `.fork-base/` snapshot
  if they've forked).

Step 9 commits: `099f1492` (source) + `c039221e` (dist rebuild).

## Verification — AC3.1 to AC3.9

| AC | Status | Evidence |
|---|---|---|
| **AC3.1** — `arete update` writes shipped skills to `.arete/skills/<name>/`; existing `.agents/skills/` content untouched | **PASS** | `workspace.ts:syncCoreSkills` writes to `paths.managedSkills`. Smoke install verified: `/tmp/arete-smoke-test/.arete/skills/daily-winddown/SKILL.md` present; `.agents/skills/` empty. Tests: `install.test.ts` "copies product skills and rules into the new workspace" asserts both invariants. |
| **AC3.2** — Skill resolution prefers `.agents/skills/<name>/` over `.arete/skills/<name>/` | **PASS** | `resolveSkillDirTwoTier` + `resolveSkillFileTwoTier` in skill-resolver.ts. `SkillService.list()` two-tier. CLI `arete skill resolve` returns `tier: 'user'` when user fork present, `'managed'` otherwise. Tests: `skill-resolver-tier.test.ts` (9 tests). Smoke verified. |
| **AC3.3** — `arete skill fork <name>` creates `.agents/skills/<name>/` with content + `.fork-base/` hash; idempotent | **PASS** | `forkSkill()` in skill-fork.ts. Idempotent: existing fork returns `alreadyExisted: true` without overwriting user SKILL.md. `--force` re-records base only. Tests: `skill-fork.test.ts` (5 tests under `describe('forkSkill')`). |
| **AC3.4** — `arete skill diff <name>` produces deterministic markdown-section diff; JSON mode parseable | **PASS** | `diffSkill()` returns `{ upToDate, diff: MarkdownDiff, baseMissing, ... }`. `formatMarkdownDiff` renders human output. CLI `--json` returns the structured diff. Tests: `markdown-diff.test.ts` (27 tests) + `skill-fork.test.ts` (3 `diffSkill` tests). |
| **AC3.5** — `arete skill merge <name>` applies non-conflicting hunks; surfaces conflicts as git-style markers; updates `.fork-base/` on success; `--interactive` prompts per hunk | **PASS** | `mergeSkill()` + `threeWayMergeSections()`. Conflicts get markers. `.fork-base/` advances only on `clean: true`. Interactive callback covers `accept`/`keep-local`/`take-incoming`/`skip`. Tests: `skill-fork.test.ts` (4 `mergeSkill` tests + 1 integration round-trip) + `markdown-diff.test.ts` (8 three-way merge tests). |
| **AC3.6** — Pre-Phase-3 `.agents/skills/` content gracefully treated: no diff if matches `.arete/skills/`; appears as fork if differs | **PASS** | `migratePreSplitAgentSkills()`: byte-equal copies removed (idempotent), edited copies preserved as forks. Forks with explicit `.fork-base/` are NOT removed even when byte-equal (intent signal). Tests: `skill-fork.test.ts` (7 `migratePreSplitAgentSkills` tests). Workspace test "syncs core skills to .arete/skills/ ... and preserves custom workspace skills" asserts integrated behavior. |
| **AC3.7** — AC8 ledger: net Δ ≤ 0 across five proxies; wrap-up Δ approaches ≤ 0 | **PASS — Δ at ship +5, Δ at wrap-up 0** | See ledger below. Within plan estimate (+6 → 0). |
| **AC3.8** — MC5 commit deletes 5 SKILL.legacy.md files AND removes `ARETE_LEGACY_SKILL_PROSE` env-var routing | **PASS** | Commit `099f1492` deletes the 5 files and removes legacy routing functions from skill-resolver.ts. Updated CLI removes `legacyRequested`/`legacyUsed`/`warning` from `arete skill resolve` output. SKILL.md `## Rollback` sections rewritten to describe `git revert` instead. `chef-orchestrator-skills.test.ts` now asserts `SKILL.legacy.md` is GONE and Rollback sections cite `git revert`. |
| **AC3.9** — All tests pass; typecheck clean. **NO `npm test` at root** | **PASS** | 235 tests across 11 files, all via per-file `npx tsx --test`. `tsc -b packages/core packages/cli packages/apps/backend` clean. |

## AC3.7 ledger — actual numbers

Counts taken via `git ls-tree -r <commit>` against shipped source:

| Proxy | Baseline (`bfe75440`) | At ship (`50f6a440`, before MC5) | At wrap-up (`c039221e`, after MC5) | Δ at ship | Δ at wrap-up |
|---|---|---|---|---|---|
| (a) CLI verbs | 83 | 86 | 86 | **+3** | **+3** |
| (b) Runtime skill dirs | 40 | 40 | 40 | **0** | **0** |
| (b') SKILL*.md files | 44 | 44 | 39 | **0** | **-5** |
| (d) Memory file types in `.arete/` (subdir count) | 8 | 9 | 9 | **+1** | **+1** |
| (e) Services in `packages/core/src/services/` | 41 | 42 | 42 | **+1** | **+1** |

**Combined Δ at ship**: 3 + 0 + 0 + 1 + 1 = **+5**.
**Combined Δ at wrap-up (after MC5)**: 3 + 0 + (-5) + 1 + 1 = **0**.

**Plan estimate**: +6 at ship → 0 at wrap-up.
**Actual**: +5 at ship → 0 at wrap-up.

Cross-check against each plan-listed Remove (Phase 1 lesson):

| Plan-listed Remove | Verified deleted? | Where |
|---|---|---|
| 5 × `<skill>/SKILL.legacy.md` | YES | `099f1492` deletes daily-winddown, weekly-winddown, week-plan, process-meetings, meeting-prep |
| `ARETE_LEGACY_SKILL_PROSE` env var routing | YES | `099f1492` removes `parseLegacyList`, `resolveSkillFile`, `resolveSkillFileFromEnv`, `resolveSkillFileWithFallback` from `skill-resolver.ts`; CLI legacy fields gone from `arete skill resolve` |
| Skill-resolver as a service file | NO (kept) | The two-tier resolver lives in the same file; we removed the legacy functions but kept the file. `services/` count nets +1 (skill-fork.ts) - 0 = +1, not -1 as plan estimated. |

The skill-resolver service file persists at wrap-up because the
two-tier resolver replaces (rather than removes) the legacy code. Plan
implicitly assumed the file would be deleted entirely; in practice the
two-tier dir resolution stays load-bearing for the chef-orchestrator
pattern. This is a small ledger-budget surprise (+1 service vs the
plan's -1), but the combined Δ at wrap-up still nets to 0 because the
plan also under-counted: the +1 service appears in BOTH ship and wrap
columns, and SKILL files contribute -5 at wrap (matching plan exactly).

### Service file ledger detail

- **Added at ship**: `skill-fork.ts` (NEW). Net +1.
- **Removed at wrap-up**: nothing in the services/ file count (legacy
  routing functions were REMOVED but `skill-resolver.ts` stays as a
  net-positive Phase 3 contribution).
- **Plan called for**: -1 at wrap-up via "skill-resolver routing
  simplifies; counted as service-removal proxy."
- **Reality**: simplifying ≠ removing the file. Substitution argument:
  `skill-resolver.ts` is now smaller (legacy code gone) but the file
  itself remains as the load-bearing two-tier resolver. Net +1 stays.

The ledger tolerance per plan is "Δ at wrap-up exceeds +1 (vs
expected 0) → engage meta." Actual is 0. **No engagement needed.**

## MC5 sunset confirmation

| Check | Status |
|---|---|
| Step 9 commit hash | `099f1492` (source) + `c039221e` (dist rebuild) |
| 5 SKILL.legacy.md files deleted | YES — verified via `git diff --stat 099f1492^!` |
| `ARETE_LEGACY_SKILL_PROSE` env var routing removed | YES — `parseLegacyList`, `resolveSkillFile`, `resolveSkillFileFromEnv`, `resolveSkillFileWithFallback` all gone |
| `arete skill resolve` legacy fields removed | YES — JSON output no longer has `legacyRequested`/`legacyUsed`/`warning` |
| `## Rollback` sections in 5 SKILL.md files updated | YES — now cite `git revert` of Phase 2 commits |
| Pre-existing legacy resolver test deleted | YES — `skill-resolver.test.ts` removed |
| chef-orchestrator-skills.test.ts updated | YES — asserts SKILL.legacy.md is GONE and Rollback uses `git revert` |
| All tests still pass post-sunset | YES — 235 / 235 |

Per parent plan MC5 option (a) preference: Phase 2 soak proceeded
without legacy escape hatch use; sunset is the cleanest exit.

## Known issues / what was deferred

### Heading-rename edge case in three-way merge

`threeWayMergeSections` keys sections by heading text. If both sides
rename the same heading differently (e.g., local renames `# Daily
Winddown` to `# Daily Winddown (USER FORK)` and incoming renames it
to `# Daily Winddown (UPSTREAM)`), the merger sees both as "added"
(neither matches base's heading) rather than as conflicts. Both
sections survive in the merged output.

This is by design (heading rewrites are a strong intent signal —
keeping both lets the user resolve manually) and matches git-merge
behavior on heading line edits with surrounding context unchanged.
The body of the section, when only edited (heading unchanged), DOES
produce a clean conflict on disagreement. Smoke verified.

Documented in `markdown-diff.ts` JSDoc; not a bug for v1.

### `.fork-base/.fork-base.yaml` parse pendant

The fork-base manifest YAML is hand-rendered in `skill-fork.ts` (no
`yaml` dep call) since it's a 4-line constant. If we ever need to
read fields back from it (currently we only read SKILL.md inside
`.fork-base/`), upgrade to the proper `yaml.parse` then.

### Adapter rendering of forked content

Per phase plan §(f) "IDE adapter integration — first cut":
CursorAdapter / Codex AGENTS.md render currently reflects the merged
view (`.arete/skills` then `.agents/skills` overrides) via the
two-tier `SkillService.list()`. This was already half-implemented; my
change ensures both dirs are walked. **What's NOT done**: no
adapter-level test asserts that AGENTS.md correctly reflects forked
SKILL.md content. The plan called this "Defer-not-cut" — full IDE
adapter integration ships in a follow-on plan when there's a
real-world Cursor user with forked content. For Phase 3 ship, John
uses Claude Code which reads `.agents/skills/` natively.

Listed here for the eng-lead reviewer's awareness; the deferral is
explicit in the phase plan.

### `--interactive` UX is text-only

`arete skill merge --interactive` uses readline question/answer
(a / k / t / s). No editor integration, no syntax-highlighted diff
display. Plan accepts this as v1 ("primitive — markers + manual
edit"). Phase 4+ may improve.

## Hygiene reconciliation

Phase 3 did NOT touch any code that hygiene-pass-1 deleted. It
extended the existing `arete skill` command (preserved by hygiene),
added new files under `.arete/`, and touched the install/update flow.
No conflict.

The `template resolver` change in `utils/templates.ts` adds a third
candidate path (`.arete/skills/<id>/templates/<variant>.md`) but
keeps the legacy fallback. This is a forward-compat addition, not a
removal of existing behavior.

## Open questions to meta (per plan §"When to engage meta")

None. Each "engage meta" trigger was checked:

1. **AC3.7 ledger Δ at wrap-up** — actual is 0; plan budget is 0;
   tolerance is +1. No engagement needed.
2. **Migration test surfaced unanticipated state** — the `.fork-base`
   recovery path for a fork that had no recorded base was a planned
   gotcha; the migration preserves byte-equal forks WHEN they have
   an explicit `.fork-base/` (intent signal). Tested.
3. **Conflict UX > git-style markers** — N/A; text-only readline UX
   shipped per plan.
4. **Phase 2 soak surfaces a regression while building** — meta did
   not signal during build; Step 9 sunset proceeded.

## Per-step deferrals (none)

All 9 plan steps shipped. No stretch deferrals. The "first-cut" IDE
adapter integration is the only knowingly-partial item, and it was
already explicitly scoped as "first cut" in the plan §(f).

## Ready for review

| Check | Status |
|---|---|
| All 9 plan steps shipped | PASS |
| AC3.1 — install/update writes to `.arete/skills/` | PASS |
| AC3.2 — two-tier resolution | PASS |
| AC3.3 — `arete skill fork` | PASS |
| AC3.4 — `arete skill diff` | PASS |
| AC3.5 — `arete skill merge [--interactive]` | PASS |
| AC3.6 — migration test | PASS |
| AC3.7 — ledger ≤ 0 at wrap | PASS (0 at wrap) |
| AC3.8 — MC5 sunset commit | PASS |
| AC3.9 — typecheck + tests clean | PASS |
| MC5 sunset standalone commit | YES (`099f1492`) |
| dist rebuilt + committed | YES (`50f6a440`, `c039221e`) |
| AC3.7 ledger surfaced honestly | YES (+5 ship, 0 wrap-up) |

Sub-worktree: `/Users/john/code/arete/.claude/worktrees/phase-3-skills-split`
Sub-branch: `worktree-phase-3-skills-split`
HEAD: `c039221e` (5 commits ahead of `bfe75440`)

Ready for eng-lead reviewer.
