---
title: "Phase 3 — Skills directory split"
slug: arete-v2-phase-3-skills-directory-split
parent: arete-v2-chef-orchestrator
status: drafting
size: medium
tags: [v2, phase-3, skills, directory-split, fork-merge]
created: "2026-05-05"
updated: "2026-05-05"
execution: sub-orchestrator (spawned from parent meta)
has_pre_mortem: false
has_review: false
has_prd: false
phase_in_v2: 3
---

# Phase 3 — Skills directory split

## Purpose

Phase 2 rewrote skill prose; Phase 3 makes user customizations of that prose **safe across upstream updates**. Without the split, John's edits to `daily-winddown` get overwritten on the next `arete update`. With it, edits live in `.agents/skills/` and survive update cycles.

Mechanical infrastructure: directory split + resolution order + fork/diff/merge tooling. No agent behavior change. Sets up Phase 4 (skills audit + demote-to-CLI) and gives users the customization layer they were promised in Phase 2's APPEND files.

## Scope

### (a) Directory layout [GATE]

Two-tier resolution:

- **`.arete/skills/<name>/`** — managed, refreshed by `arete update`, treated as read-only by convention. New canonical location for shipped skills.
- **`.agents/skills/<name>/`** — user customizations. Survives `arete update`. Takes precedence at agent-load time.

**Resolution order**: harness checks `.agents/skills/<name>/SKILL.md` first; falls back to `.arete/skills/<name>/SKILL.md` if user fork doesn't exist.

**Migration**: existing `.agents/skills/<name>/` content (shipped skills written there by pre-Phase-3 `arete install` / `update`) stays as-is on first Phase 3 update. New `arete update` writes shipped skills to `.arete/skills/`. Treat existing `.agents/skills/` content as "user-tracked-upstream" until they edit (becomes "user fork") or run `arete skill reset <name>` (becomes "no fork").

### (b) `arete skill fork <name>` [GATE]

Copies upstream → user:

```bash
arete skill fork daily-winddown
# Copies .arete/skills/daily-winddown/ → .agents/skills/daily-winddown/
# Records upstream content hash to .agents/skills/daily-winddown/.fork-base
```

Idempotent if user fork already exists (warn, don't overwrite).

### (c) `arete skill diff <name>` [GATE]

Shows differences between user fork's recorded base hash and current upstream:

```bash
arete skill diff daily-winddown
# Diff: .agents/skills/daily-winddown/.fork-base/SKILL.md → .arete/skills/daily-winddown/SKILL.md
# Markdown-section-level diff via deterministic library; no LLM
```

JSON output via `--json` for tooling.

### (d) `arete skill merge <name> [--interactive]` [GATE]

Applies upstream changes since fork base into user fork:

```bash
arete skill merge daily-winddown
# Non-conflicting hunks applied automatically; user fork updated
# Conflicts: prints conflict markers (git-style <<<<<<< / ======= / >>>>>>>) to file; user resolves manually
# --interactive: walks through hunks one at a time; y/n/edit/skip per hunk
# After successful merge: .fork-base updated to new upstream hash
```

**Conflict handling** is primitive in v1 (markers + manual edit). LLM-assisted conflict resolution stays deferred.

### (e) `arete update` integration [GATE]

`arete update` refreshes `.arete/skills/` from shipped runtime skills. Reports a summary:

```
Refreshed 18 managed skills. 3 have upstream changes vs. your fork:
  - daily-winddown
  - meeting-prep
  - inbox-triage

Run `arete skill diff <name>` to inspect, or `arete skill merge <name>` to integrate.
```

Existing `.arete/skills-local/` APPEND-file seeding (Phase 2 deliverable) continues to work.

### (f) IDE adapter integration [PARTIAL — first cut]

CursorAdapter / Codex AGENTS.md render: needs to reflect both the managed view and any user forks. **First-cut scope**: adapters ignore `.agents/skills/` overrides and render only `.arete/skills/` content into AGENTS.md. User customizations are visible to Claude Code (which reads `.agents/skills/` directly) but not visible to Cursor users in the rendered AGENTS.md.

**Defer-not-cut**: full adapter merge (rendering user-forked content into AGENTS.md per IDE's load mechanism) ships in a follow-on plan when there's a user with a Cursor-side need. For Phase 3 ship, John uses Claude Code which reads `.agents/skills/` natively.

### (g) Phase 2 legacy sunset (MC5 option a) [GATE — coupled to Phase 2 soak]

Per parent plan MC5: when Phase 3 ships, all 5 `<skill>/SKILL.legacy.md` files (Phase 2 rollback safety net) are deleted in a Phase 3 wrap-up commit, AND the `ARETE_LEGACY_SKILL_PROSE` env var routing is removed from skill-resolver code.

**Coupling**: Phase 3 BUILD proceeds without dependency on Phase 2 soak. Phase 3 MERGE-TO-PARENT waits for one of:
1. Phase 2 soak completes successfully (≥14 days, no AC11 trigger), OR
2. User explicitly authorizes early sunset (e.g., "Phase 2 has been smooth for 7+ days, ship Phase 3 with sunset now"), OR
3. Soak surfaces a Phase 2 regression that requires legacy fallback — in which case Phase 3 plan revises to keep `ARETE_LEGACY_SKILL_PROSE` and update sunset criteria.

Sub-orch builds (g) as a separate commit at the END of the build sequence so meta can choose to merge or hold based on Phase 2 status at merge time.

## Acceptance criteria

| AC | Verification |
|---|---|
| **AC3.1**: `arete update` writes shipped skills to `.arete/skills/<name>/`. Existing `.agents/skills/` content untouched. | Smoke: install + update on a fresh workspace fixture; ls both dirs |
| **AC3.2**: Skill resolution prefers `.agents/skills/<name>/` over `.arete/skills/<name>/`. | Unit + integration: write a divergent SKILL.md to `.agents/skills/foo/`; confirm resolver returns it |
| **AC3.3**: `arete skill fork <name>` creates `.agents/skills/<name>/` with content + `.fork-base` hash. Idempotent if fork exists. | CLI smoke + unit |
| **AC3.4**: `arete skill diff <name>` produces deterministic markdown-section diff; JSON mode parseable. | Unit + smoke |
| **AC3.5**: `arete skill merge <name>` applies non-conflicting hunks, surfaces conflicts as git-style markers, updates `.fork-base` on success. `--interactive` mode prompts per hunk. | Unit (non-conflicting + conflicting cases) + manual interactive smoke |
| **AC3.6**: Pre-Phase-3 `.agents/skills/` content gracefully treated as user-tracked-upstream — no diff if content matches `.arete/skills/`; appears as fork if content differs. | Migration test on a fixture with both states |
| **AC3.7**: AC8 ledger — net combined Δ ≤0 across the five proxies for Phase 3. **At wrap-up (after MC5 sunset)** the cumulative ledger across Phases 1–3 should approach ≤0. | See ledger expectation |
| **AC3.8**: Phase 2 legacy sunset (per MC5): commit at end of build deletes all 5 `<skill>/SKILL.legacy.md` files AND removes `ARETE_LEGACY_SKILL_PROSE` env-var routing. **Sub-orch produces this commit but meta gates the parent merge.** | git diff inspection at merge time |
| **AC3.9**: All tests pass; typecheck clean. **NO `npm test` at root** (Phase 1 lesson). | Targeted vitest/tsx-test |

## Adds vs removes ledger expectation

Phase 3 should net ≤0 combined.

| Proxy | Adds | Removes (Phase 3 build) | Removes (MC5 sunset) | Δ at ship | Δ at wrap-up |
|---|---|---|---|---|---|
| CLI verbs | +3 (`skill fork`, `skill diff`, `skill merge`) | 0 | 0 | +3 | +3 |
| Runtime skills | 0 (rewrites already in Phase 2) | 0 | 0 | 0 | 0 |
| Frontmatter file shapes | +1 (`.fork-base` hash file format) | 0 | 0 | +1 | +1 |
| Memory file types | +1 (`.arete/skills/` is a new managed dir) | 0 | 0 | +1 | +1 |
| Services | +1 (skill-fork-merge service) | 0 | -1 (skill-resolver routing for ARETE_LEGACY_SKILL_PROSE simplifies; counted as service-removal proxy) | +1 | 0 |
| Runtime SKILL files | 0 | 0 | -5 (`SKILL.legacy.md` × 5 deleted) | 0 | -5 |

**Estimated combined Δ at ship**: +6.
**Estimated combined Δ at wrap-up (after MC5 sunset)**: 0.

Cumulative across phases (rough):
- Phase 1: +8 at ship → +8 at wrap-up (no further sunset)
- Phase 2: +8 at ship → +2 at wrap-up
- Phase 3: +6 at ship → 0 at wrap-up
- **Cumulative Phase 1–3 at wrap-up**: ~+10

Substitution argument: the Phase 1+3 wiki + customization substrate is the chef-orchestrator capability; +10 across all five proxies for the full chef pattern is acceptable. Phase 4's demote-to-CLI is expected to remove 12–18 skill files (material AC8 remove) and pull cumulative back toward ≤0.

**Sub-orch instruction**: surface actual ledger numbers at ship time. If wrap-up Δ exceeds +1 (vs expected 0), engage meta.

## Test strategy

| Layer | Tests |
|---|---|
| Unit | `arete skill fork` / `diff` / `merge` (non-conflicting + conflicting cases). Skill resolver `.agents/skills/` precedence. Markdown-section diff library. |
| Integration | Full fork → edit → upstream-update → diff → merge cycle on a fixture skill. Pre-Phase-3 `.agents/skills/` migration: existing content tracks vs forks. Idempotency on repeated update / fork. |
| Smoke | `arete update` after Phase 3 ships in a real workspace fixture; verify `.arete/skills/` populated, `.agents/skills/` untouched. |
| Manual | `arete skill merge --interactive` UX walkthrough. |

**No `npm test` at repo root.** Per-file `tsx --test` / `vitest run` only.

## Skeptical view (required per Principle 9)

**The strongest case for not doing Phase 3 as scoped**: "Phase 3 ships fork/diff/merge tooling for a workflow John may never actually use. Today John's customization story is the APPEND file (Phase 2's `.arete/skills-local/<slug>.md`). That covers most user-tunable behavior with simpler ergonomics. The full skill-fork story is more powerful but introduces conflict-resolution UX and three-way-merge complexity that John may never exercise."

**Counter**: 
1. Phase 4 (skills audit) demotes some skills to CLI commands. Phase 3 lets users keep prose customizations of skills that *aren't* demoted, surviving `arete update`. Without it, post-Phase-4 cleanup feels destructive ("did `arete update` delete my edits?").
2. APPEND files are user-tunable context; the SKILL.md prose itself is the agent's instruction set. Some users WILL want to fork the prose (e.g., "I want my chef to surface 8 staged items max, not let it surface 20" — that's a prose edit, not an APPEND-file change).
3. The fork/merge tooling is small (~1-2 days build) and the conflict UX is primitive (git-style markers). Not over-engineered.

**Residual risk**: John doesn't use the fork tooling for 6 months and we've shipped infrastructure for nothing. Mitigation: the tooling is small and fully optional; users on the upgrade path who never fork pay no cost.

## Rollback

Per-deliverable, since each is independent.

- (a)/(b)/(c): drop the new CLI verbs; resolution order reverts to single-tier `.agents/skills/`.
- (d) merge UX: deletion of the merge command is harmless; users use `git diff` / manual edits.
- (e) `arete update` integration: revert to writing shipped skills to `.agents/skills/` directly (pre-Phase-3 behavior).
- (g) MC5 sunset rollback: restore `SKILL.legacy.md` × 5 + `ARETE_LEGACY_SKILL_PROSE` routing from git history. Per-skill flag immediately operational again.

**Rollback complexity**: medium. The directory split + `.fork-base` hash file is a structural change; rolling back requires migrating user content if they've forked. If a real Phase 2 regression surfaces during Phase 3 soak, the practical rollback is **don't merge Phase 3 to parent** — soak Phase 2 longer with legacy still in place.

## Hygiene reconciliation

Phase 3 does NOT touch any code that hygiene-pass-1 deleted. It extends `arete skill` command (preserved by hygiene), adds new files under `.arete/`, and touches the install/update flow. No conflict.

## MC5 — Phase 2 legacy sunset coupling

Reiterating scope: Phase 3 BUILD ships independently; Phase 3 MERGE-TO-PARENT couples to Phase 2 soak status. Sub-orch produces the sunset commit (deleting 5 `SKILL.legacy.md` files + removing env-var routing) at the END of the build sequence so meta has a single revertable commit if soak surfaces a regression.

## Sub-orchestrator handoff brief

When meta spawns the Phase 3 sub-orchestrator, the brief includes:

1. **Read first**: this `plan.md`, parent `plan.md` (Principles 1–9, AC table, MC2 / MC4 / MC5), parent `pre-mortem.md` (R5 skills split breaks IDE adapters, R8 sub-orch scope creep, R10 user context resets break sub-orch handoff, R14 daily-driver disruption), parent `diary.md` (most recent decisions log + "compact-safe recovery" section), Phase 0/1/2 build-reports for pipeline context.
2. **Memory files**: `feedback_l3_memory.md`, `feedback_branch_isolation.md`, `feedback_commit_dist.md`, `feedback_eval_harness_local.md`, `project_arete_v2_direction.md`.
3. **Worktree**: spawn with `isolation: "worktree"` off parent branch.
4. **Build sequence**:
   - **Step 1**: Update `arete update` and `arete install` to write shipped skills to `.arete/skills/` (new managed location).
   - **Step 2**: Update skill resolver to prefer `.agents/skills/<name>/` then fall back to `.arete/skills/<name>/`.
   - **Step 3**: Add `arete skill fork <name>` CLI command + service.
   - **Step 4**: Add `arete skill diff <name>` CLI command using deterministic markdown-section diff library.
   - **Step 5**: Add `arete skill merge <name> [--interactive]` CLI command. Conflict handling = git-style markers + manual edit; interactive mode = per-hunk y/n/edit/skip.
   - **Step 6**: Migration test: pre-Phase-3 `.agents/skills/` content tracks upstream cleanly when content matches; appears as fork when content differs.
   - **Step 7**: Tests (unit + integration + migration + smoke). Per-file targeted invocations. **NO `npm test` at root.**
   - **Step 8**: Rebuild dist; commit.
   - **Step 9**: **MC5 sunset commit (separate, last)** — delete `<skill>/SKILL.legacy.md` × 5 AND remove `ARETE_LEGACY_SKILL_PROSE` env var routing in skill-resolver. Standalone commit so meta can revert it independently if Phase 2 soak surfaces issues at merge time.
5. **Commit cadence**: per-step `phase-3(<area>): <change>` convention. MC5 sunset commit subject: `phase-3(runtime,core): sunset Phase 2 legacy skill files (MC5 option a)`.
6. **Build report**: append `dev/work/plans/arete-v2-chef-orchestrator/phase-3-skills-directory-split/build-report.md` with files touched, tests added, AC3.1–AC3.9 verification status, AC3.7 ledger filled in with **actual** counts (cross-check each plan-listed Remove against actual deletion per Phase 1 lesson), known issues, ready-for-review state.
7. **When to engage meta**:
   - AC3.7 ledger Δ at wrap-up exceeds +1 (vs expected 0).
   - Migration test surfaces a state pre-Phase-3 user content can't be cleanly handled (e.g., user-edited `.agents/skills/<name>/` that's NOT the shipped content but also has no fork-base hash — how to treat?).
   - Conflict-resolution UX requires more than git-style markers (e.g., user explicitly wants editor integration).
   - Phase 2 soak surfaces a regression while you're building (meta will signal you; halt Step 9 sunset commit until cleared).
   - Otherwise: complete autonomously and return.
8. **Watchdog-safe testing**: per-file `tsx --test` / `vitest run` invocations only. NEVER `npm test` at repo root.

## Cadence

- **Build**: 5–7 days per parent plan estimate. Smaller phase; mechanical infrastructure. Realistic agent wall time ~30–60 min.
- **Soak**: 5 days post-merge. AC11 doesn't apply (no chef-pattern behavior change); regression catcher is `arete update` correctness + `skill fork/diff/merge` UX.
- **Review**: ~1 day (eng-lead reviewer + fix-up cycle).
- **Ship to main**: after Phase 2 main-merge OR after Phase 2 soak in worktree (Phase 3 main-merge implicitly waits for Phase 1+2 main-merge precedent).

## Critical files

| File | Role in Phase 3 |
|---|---|
| `packages/cli/src/commands/install.ts` | Update to write shipped skills to `.arete/skills/` |
| `packages/cli/src/commands/update.ts` | Same; report upstream-changed-skills summary |
| `packages/cli/src/commands/skill.ts` (or extend if exists) | Add `fork`, `diff`, `merge` subcommands |
| `packages/core/src/services/skill-resolver.ts` | Update to two-tier resolution (`.agents/skills/` first, `.arete/skills/` fallback); remove `ARETE_LEGACY_SKILL_PROSE` routing in MC5 sunset commit |
| `packages/core/src/services/skill-fork.ts` | NEW — fork/diff/merge service |
| `packages/core/src/utils/markdown-diff.ts` | NEW — deterministic markdown-section diff |
| `packages/runtime/skills/<5 skills>/SKILL.legacy.md` | DELETED in MC5 sunset commit |
| `dev/work/plans/arete-v2-chef-orchestrator/phase-3-skills-directory-split/build-report.md` | NEW — sub-orch authors |
