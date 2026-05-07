---
title: "Phase 3.5 — Polish (post-Phase-3 + chef-pattern observability gaps)"
slug: arete-v2-phase-3-5-polish
parent: arete-v2-chef-orchestrator
status: drafting
size: medium
tags: [v2, phase-3-5, polish, chef-prose, arete-update, item-fates]
created: "2026-05-06"
updated: "2026-05-06"
execution: sub-orchestrator (spawned from parent meta)
has_pre_mortem: false
has_review: false
has_prd: false
phase_in_v2: 3.5
---

# Phase 3.5 — Polish

Mini-phase. Bundles 11 polish items surfaced during John's first real chef-pattern test (2026-05-06). Three categories: `arete update` migration gaps, chef-pattern observability gaps, Phase 0 substrate extensions.

No new architecture. No agent behavior change beyond the chef SKILL.md prose tightening. Cumulative AC8 ledger stays neutral or improves.

## Scope

### Group A — `arete update` migration fixes [GATE]

Surfaced from John's morning recovery on 2026-05-06.

**A1**: `arete update` must write `<skill>/SKILL.md` to `.arete/skills/<name>/` for every shipped skill, even when user already has `.agents/skills/<name>/SKILL.md`. **weekly-winddown bug**: yesterday's update skipped weekly-winddown entirely; today's update also failed to write the managed copy. Resolver had no fallback.

**A2**: `arete update` must remove stale `<skill>/SKILL.legacy.md` files from `.agents/skills/<name>/` when the corresponding source is gone from `runtime/skills/`. Post-MC5 cleanup.

**A3**: `arete update` migration must remove duplicate auxiliary files (`templates/`, `LEARNINGS.md`) from `.agents/skills/<name>/` when byte-equal copies exist in `.arete/skills/<name>/`. Currently leaves both → cruft.

**A4**: `arete update` must remove `.agents/skills/<name>/` directories that become empty after migration / SKILL.md removal.

### Group B — `arete skill` polish [GATE]

**B1**: `arete update` migration auto-records `.fork-base` when `.agents/skills/<name>/SKILL.md` content matches a known prior shipped version (use git history of `runtime/skills/<name>/SKILL.md` or similar). Eliminates the "no fork base recorded" friction; user gets clean `arete skill diff` immediately.

**B2**: `arete skill fork <name>` behavior with pre-existing `.agents/skills/<name>/` auxiliary files — spec the merge/error semantics; add unit + integration tests.

### Group C — Chef-pattern observability + judgment tightening [GATE]

**C1**: Chef SKILL.md prose for daily-winddown, weekly-winddown, week-plan, process-meetings, meeting-prep must instruct the agent to **persist the primary curated view** to `now/winddown-YYYY-MM-DD.md` (or `now/<skill>-YYYY-MM-DD.md`) at engagement time. Today's run had the curated view (with reason labels, Uncertain tier, action proposals, sidecar count-reference) only in the chat buffer — gone when conversation scrolls. Big audit/eval gap.

**C2**: Chef SKILL.md prose tightening — strengthen the "when in doubt about importance, surface to Uncertain" rule. Today's eng-lead review found 3 of 17 deferred items (~18%) that should have been Uncertain (JPM eChecks "needs verification", Pay Choice "demo tomorrow", per-adjuster instructions "interesting future"). Add explicit examples to the chef prose: "needs verification" + "interesting future" + "covered elsewhere" deferrals are LOW-confidence — surface to Uncertain unless the chef can articulate a confident defer reason.

### Group D — Phase 0 substrate extensions [GATE]

**D1**: `appendItemFate` extends to support `fate: "deferral_disagreement"` event type. Triggered when chef detects the user has pulled an item back from the sidecar (via removed `[[defer]]` tag). Required schema fields: `item_text`, `original_fate: "deferred"`, `original_reason`, `pulled_back_at`, `source_path` (sidecar path).

**D2**: Chef SKILL.md prose for daily-winddown adds a "scan previous day's deferred sidecar for pulled-back items" step. For each pulled-back item, append a `deferral_disagreement` event to `item-fates.jsonl` via `arete events log` (D3 below).

**D3**: New CLI: `arete events log deferral-disagreement --item <text> --source <sidecar-path> --reason <original-reason>`. Thin wrapper over `appendItemFate` with the new fate type.

**D4**: New CLI: `arete events backfill item-fates --since <date>` — scans approved meeting frontmatters in window, emits item-fate events for each `approved_items.*` entry. Idempotent (won't double-emit). Useful when a stale backend or other gap caused the live writer to miss events. (Today's backfill was done via one-off script; this CLI productionizes it.)

### Group E — Documentation [GATE]

**E1**: `arete install` / `arete update` should warn the user when a backend process is running that may be stale. Detect via `lsof` for known ports, or via a `.arete/runtime/backend.pid` file. Output: `⚠ Backend appears running (pid <n>); restart it to pick up these changes (your web UI approvals will silently bypass new event writers until restart).` Today's stale-backend bug burned 5 meetings worth of item-fate events (33 backfilled).

**E2**: `arete-reserv` and similar workspace `.gitignore` entries — verify `.arete/skills-local/` is tracked (user-customization context that survives `arete update`) but `.arete/skills/`, `.agents/skills/` are not. Spec correct gitignore template in `workspace-structure.ts`.

## Acceptance criteria

| AC | Verification |
|---|---|
| **AC3.5.1**: `arete update` writes `<skill>/SKILL.md` to `.arete/skills/<name>/` for every skill in `runtime/skills/`, regardless of `.agents/skills/<name>/` state. | Migration test on a fixture with diverse user states (matching upstream / customized / missing). weekly-winddown reproduction case. |
| **AC3.5.2**: Stale `SKILL.legacy.md` files removed by `arete update` post-MC5. | Smoke on workspace with stale `SKILL.legacy.md`. |
| **AC3.5.3**: Duplicate aux files cleaned (byte-equal removed from `.agents/skills/<name>/`). | Smoke + unit. |
| **AC3.5.4**: Empty `.agents/skills/<name>/` dirs removed by `arete update` post-migration. | Smoke. |
| **AC3.5.5**: `arete update` auto-records `.fork-base` when content matches known prior shipped version. `arete skill diff` works without manual `--force` for these cases. | Migration test using `runtime/skills/` git history as the "known prior versions" oracle. |
| **AC3.5.6**: `arete skill fork <name>` documented behavior with pre-existing aux files; tests cover. | Unit + integration. |
| **AC3.5.7**: Each of the 5 chef SKILL.md files instructs agent to persist primary curated view to `now/<skill>-YYYY-MM-DD.md`. | grep check across the 5 SKILL.md files. |
| **AC3.5.8**: Each of the 5 chef SKILL.md files contains the strengthened Uncertain-tier guidance with at least 3 explicit category examples ("needs verification", "interesting future", "covered elsewhere"). | grep + manual review. |
| **AC3.5.9**: `appendItemFate` accepts `fate: "deferral_disagreement"` events with the required schema. | Unit test. |
| **AC3.5.10**: `arete events log deferral-disagreement` CLI exists; emits valid JSONL. | CLI smoke. |
| **AC3.5.11**: `arete events backfill item-fates --since <date>` CLI exists; idempotent (won't double-emit). | Unit + smoke. |
| **AC3.5.12**: `arete install` / `arete update` warns when a backend process is running. | Smoke with mock running backend. |
| **AC3.5.13**: AC8 ledger neutral or net-negative. Plan estimate: +3 CLI verbs (backfill, events log deferral-disagreement, possibly skill cleanup); -? cleanups. **Sub-orch surfaces actual at ship.** | Build report. |
| **AC3.5.14**: All tests pass; typecheck clean. NO `npm test` at root. | Per-file `tsx --test` / `vitest run`. |

## Adds vs removes ledger expectation

Phase 3.5 should net combined Δ ≤0.

| Proxy | Adds | Removes | Δ |
|---|---|---|---|
| CLI verbs | +2 (`arete events log deferral-disagreement`, `arete events backfill item-fates`) | 0 | +2 |
| Runtime skills | 0 (5 SKILL.md prose updates; not new skills) | 0 | 0 |
| Frontmatter file shapes | 0 | 0 | 0 |
| Memory file types | +1 (`now/<skill>-YYYY-MM-DD.md` curated-view persistence is a new file pattern) | 0 | +1 |
| Services | 0 (extends existing services) | -1 (`.arete/skills/` migration logic simplifies once edge cases handled) | -1 |

**Estimated combined Δ at ship**: +2.

Justification for the +2: both new CLI verbs are observability/recovery primitives surfaced by today's bug (item-fates not firing on stale backend). They have ongoing utility beyond Phase 3.5 — `events backfill` is the standard recovery for any future event-write gap; `events log deferral-disagreement` is the missing piece of the dismissal-as-signal feedback loop.

If sub-orch's actual ledger comes in higher, surface to meta — substitution argument worth examining vs pull more removes.

## Test strategy

| Layer | Tests |
|---|---|
| Unit | `appendItemFate` accepts new fate type; backfill idempotency; auto-fork-base logic; aux file dedup logic; empty dir cleanup. |
| Integration | Migration test on a fixture workspace covering: missing managed copy (weekly-winddown case), stale legacy file, duplicate aux files, empty dirs, content-matches-prior-version. |
| Snapshot | `arete update` output messages — verify cleanups reported, backend warning fires. |
| Smoke | `arete events backfill item-fates --since 2d` against a fixture meeting set; verify N events emitted. `arete events log deferral-disagreement --item ... --source ... --reason ...` produces valid JSONL line. |

**No `npm test` at repo root.**

## Skeptical view (required per Principle 9)

**The strongest case for not doing Phase 3.5**: "These are all small bugs and prose tweaks. Phase 4 will rewrite the skills anyway (per the demote-to-CLI disposition); Phase 4 will need to update `arete update` migration logic anyway. Bundling Phase 3.5 into Phase 4 saves a build cycle and reduces risk of touching the chef pattern mid-soak."

**Counter**: 
1. The 5 chef SKILL.md prose tweaks (C1, C2) are critical for soak data quality. Without persisted curated view (C1), AC10/AC11 evaluation has no audit trail. Without tightened Uncertain guidance (C2), the chef keeps mis-classifying for the rest of soak — biasing the dismissal-pattern data Phase 4 will rely on.
2. The `arete update` bugs (A1–A4) make the user experience confusing during soak — every update generates "no fork base recorded" friction even on legitimate matches. Soak feedback would be contaminated by tooling annoyance.
3. Phase 4's audit work (per disposition) needs accurate event data; D1/D2/D3/D4 close the data gap.
4. Phase 4 is itself a much larger undertaking; bundling Phase 3.5 into it would push Phase 4's wall time + blast radius further out.

**Residual risk**: chef SKILL.md prose changes could subtly degrade chef behavior during ongoing soak. Mitigation: per-skill ARETE_LEGACY_SKILL_PROSE flag is gone post-MC5, but the chef rewrites in C1/C2 are additive prose (instructing one more behavior, tightening one rule) — not full rewrites. AC11 hard stop still applies; if winddown >45 min on any day post-Phase-3.5, halt and revert C1/C2 specifically.

## Rollback

Per-deliverable.

- Group A (arete update): revert specific commits; user runs `arete update` again to re-do migration with old logic.
- Group B (arete skill): revert; users without auto-fork-base see "no fork base recorded" again.
- Group C (chef SKILL.md prose): revert SKILL.md commits; chef goes back to pre-Phase-3.5 prose. Note: with MC5 done, no per-skill flag escape — only `git revert`.
- Group D (substrate extensions): pure additions; revert is straightforward.
- Group E (docs/warnings): revert; user gets no backend-stale warning but tooling still works.

## Hygiene reconciliation

Phase 3.5 does NOT touch any code that hygiene-pass-1 deleted. It extends existing logic in `arete update`, chef SKILL.md prose, `appendItemFate`, and adds new CLI verbs.

## Sub-orchestrator handoff brief

When meta spawns the Phase 3.5 sub-orchestrator, the brief includes:

1. **Read first**: this `plan.md`, parent `plan.md` (Principles, AC table, MC5 reminder), parent `diary.md` (most recent decisions logs covering today's findings), Phase 0 build-report (item-fate writer architecture), Phase 2 build-report (chef SKILL.md prose patterns), Phase 3 build-report (skill-resolver + migration architecture).
2. **Memory files**: `feedback_l3_memory.md`, `feedback_branch_isolation.md`, `feedback_commit_dist.md`, `feedback_eval_harness_local.md`, `project_arete_v2_direction.md`.
3. **Worktree**: meta will manually create the worktree at `.claude/worktrees/phase-3-5-polish` off `worktree-arete-v2-chef-orchestrator` (Phase 3 lesson: don't trust `isolation: "worktree"` to land on the right base). Pre-flight check: confirm branch + key Phase 3 artifacts visible before any code change.
4. **Build sequence**:
   - **Step 1 (Group A)**: `arete update` migration logic fixes A1–A4. One commit per fix; integration test on a fixture workspace.
   - **Step 2 (Group B)**: `arete update` auto-fork-base detection (B1). Spec + test `arete skill fork` aux file behavior (B2).
   - **Step 3 (Group C)**: Chef SKILL.md prose tightening — C1 (persist curated view) + C2 (Uncertain guidance) for all 5 chef skills. Per-skill commits.
   - **Step 4 (Group D)**: Phase 0 substrate extensions. D1 first (appendItemFate accepts new fate type). D3 (events log deferral-disagreement CLI). D4 (events backfill item-fates CLI). D2 last (chef SKILL.md prose change to invoke deferral-disagreement writer on pull-back detection).
   - **Step 5 (Group E)**: Backend-running warning in install/update (E1). Gitignore template fix (E2).
   - **Step 6**: Tests (per phase plan test strategy). NO `npm test` at root.
   - **Step 7**: Rebuild dist; commit.
5. **Commit cadence**: per-deliverable commits, `phase-3-5(<area>): <change>` convention. Per-skill commits for C1+C2 application across the 5 chef skills.
6. **Build report**: append `dev/work/plans/arete-v2-chef-orchestrator/phase-3-5-polish/build-report.md` with files touched, tests added, AC verification status, AC3.5.13 ledger filled in with **actual** counts (cross-check Removes against actual deletion).
7. **When to engage meta**:
   - Auto-fork-base detection (B1) requires deeper architecture than expected (e.g., needs git history access in user workspace which they may not have).
   - Chef SKILL.md prose changes during soak risk degrading observed behavior — pause C1/C2 if any quality concern surfaces.
   - AC3.5.13 ledger Δ exceeds +2 (vs estimated).

## Cadence

- **Build**: 2–3 days estimated. Smaller polish phase. Realistic agent wall time ~30–60 min.
- **Soak**: 5 days. AC11 hard stop applies (chef prose changes could regress).
- **Review**: ~1 day (eng-lead reviewer).
- **Ship to main**: after John's testing of Phase 1+2+3+3.5 in worktree. Phase 1+2+3 main-merge can happen in the same window or separately.

## Critical files

| File | Role in Phase 3.5 |
|---|---|
| `packages/cli/src/commands/update.ts`, `install.ts` | Group A migration fixes + Group E backend warning |
| `packages/cli/src/commands/skill.ts` | Group B `arete skill fork` polish |
| `packages/cli/src/commands/events.ts` | Group D new CLI verbs |
| `packages/core/src/services/memory-log.ts` | Group D `appendItemFate` extension |
| `packages/runtime/skills/{daily,weekly}-winddown/SKILL.md` | Group C prose updates |
| `packages/runtime/skills/{week-plan,process-meetings,meeting-prep}/SKILL.md` | Group C prose updates |
| `packages/core/src/workspace-structure.ts` | Group E gitignore template |
| `dev/work/plans/arete-v2-chef-orchestrator/phase-3-5-polish/build-report.md` | NEW — sub-orch authors |
