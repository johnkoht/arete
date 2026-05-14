---
title: "Phase 4 — Skills audit + chef-pattern propagation + demote-to-CLI"
slug: arete-v2-phase-4-skills-audit
parent: arete-v2-chef-orchestrator
status: drafting
size: large
tags: [v2, phase-4, skills-audit, demote-to-cli, chef-pattern-propagation]
created: "2026-05-14"
updated: "2026-05-14"
execution: sub-orchestrator (spawned from parent meta)
has_pre_mortem: false
has_review: false
has_prd: false
phase_in_v2: 4
---

# Phase 4 — Skills audit + chef-pattern propagation + demote-to-CLI

## Purpose

Phase 4 is the cumulative-ledger remove phase. After Phases 1+2+3+3.5 added wiki substrate (~+8 → +2 wrap-up), chef-orchestrator infrastructure (~+8 → +2 wrap-up), directory split (~+5 → 0 wrap-up), and polish (~+3), the cumulative AC8 ledger sits at ~+13. Phase 4 audits the 36 non-Phase-2 shipped skills against the **disposition rule** from parent plan §Phase 4, demotes wrapper skills to CLI verbs, applies chef pattern to user-tunable workflow skills, drops unused skills.

Expected outcome: 12–18 skill files removed; cumulative ledger pulled back toward 0; v2's first phase that nets ≤0 cumulatively across all phases.

## Disposition rule (recap from parent plan §Phase 4)

> Skills earn their existence when (a) they orchestrate multi-step judgment, OR (b) they have user-tunable prose that affects behavior. Skills are bloat when they're 1:1 with a CLI command, when their user-customizable bit is a config file rather than the prose, or when they're shims around external tooling.

Four dispositions per skill:
- **Apply chef pattern** — user-tunable workflow with multi-step judgment
- **Demote to CLI** — 1:1 with existing CLI verb, pure wrapper, or user-customizable bit lives in a config file
- **Drop** — unused, no consumer
- **Leave as-is** — true universal primitive

## Scope (5 groups)

### Group A — Demote to CLI [GATE — pre-identified candidates]

Nine skills pre-identified during user testing conversations + parent plan's Phase 4 §"Pre-identified candidates" section. Sub-orch verifies each before demotion: the corresponding `arete <verb>` CLI must already do what the skill describes; if not, gap-fill the CLI in this phase.

| Skill | Demotion target | Verification needed |
|---|---|---|
| `krisp` | `arete pull krisp` | CLI exists; verify parity |
| `fathom` | `arete pull fathom` | CLI exists; verify parity |
| `notion` | `arete pull notion` | CLI exists; verify parity (or gap-fill if Notion MCP path differs) |
| `doc-pull` | `arete pull doc` or similar | Verify CLI exists |
| `drive-search` | `arete drive search` or `arete search --scope drive` | Verify CLI exists |
| `email-search` | `arete email search` or `arete search --scope email` | Verify CLI exists |
| `calendar` | `arete calendar {create, find, availability}` | CLI exists per parent plan |
| `save-meeting` | `arete meeting save` (or extend `meeting add`) | Verify CLI exists |
| `people-intelligence` | `arete people intelligence digest` (verify) — policy file at `context/people-intelligence-policy.json` STAYS as user-tunable config | User confirmed never invoked directly; verify CLI exists |

**For each demoted skill**:
1. Verify the CLI verb produces equivalent outcome (parity check via existing tests OR smoke).
2. Delete `packages/runtime/skills/<name>/SKILL.md`.
3. Delete the rest of `packages/runtime/skills/<name>/` (templates, LEARNINGS.md, etc.) UNLESS it's the policy-as-config case (people-intelligence policy.json) — preserve config files; remove SKILL.md only.
4. Update `PATTERNS.md` if it references the skill.
5. Update other shipped skills if they reference the demoted skill (e.g., `process-meetings` may call `pull-from-krisp` — should call `arete pull krisp` CLI directly instead).
6. Update parent plan's "Phase 4 disposition table" with actual disposition.

### Group B — Apply chef pattern [GATE — 4 candidates]

Four user-tunable workflow skills get the chef-orchestrator treatment (same envelope as Phase 2):

| Skill | Why chef pattern | Phase 2 pattern application |
|---|---|---|
| `inbox-triage` | Routing rules + "important" definitions are personal | `do-all-work-then-engage` + `curate-with-reason-labels` + `propose-with-mcp-action` |
| `email-triage` | Same — per-user routing | Same |
| `slack-digest` | Significance rules personal (`significance_analyst` config) | Same; integrates with Phase 1's slack heuristic |
| `schedule-meeting` | Calendar + context + communication orchestration | `do-all-work-then-engage` + `propose-with-mcp-action` (calendar.create_event, slack.send_dm) |

**For each chef-rewritten skill**:
1. Apply patterns 1–4 from `PATTERNS.md`.
2. Add `## Read first` stanza pointing to `.arete/skills-local/<slug>.md`.
3. Seed `.arete/skills-local/<slug>.md` template (extend `arete install`/`update` seeding to include these 4 slugs).
4. **Persist curated view to `now/archive/<skill>/<filename>`** per Phase 3.5 C1 convention.
5. **Tighten Uncertain-tier guidance** per Phase 3.5 C2 convention.
6. **No per-skill legacy preservation** — MC5 sunset is done. Rollback via `git revert` per Phase 3 docs.
7. Per-skill commits so any one rewrite can be reverted independently.

### Group C — PM artifacts audit (verdict report; selective chef pattern) [PARTIAL]

12 PM-shaped skills. Audit each, produce verdict, apply chef pattern only where user-felt step-by-step pain clearly exists:

| Skill | Likely disposition | Reasoning |
|---|---|---|
| `create-prd` | Apply chef pattern (likely) | Multi-step judgment; user-tunable structure preferences |
| `discovery` | Apply chef pattern (likely) | Same |
| `pre-mortem` | Apply chef pattern (likely) | Same |
| `competitive-analysis` | Apply chef pattern (likely) | Same |
| `construct-roadmap` | Apply chef pattern (likely) | Same |
| `review-plan` | Apply chef pattern (maybe) | Verify usage frequency; lower priority |
| `synthesize` | Apply chef pattern (maybe) | Verify usage frequency |
| `generate-mockup` | Leave as-is or drop | Verify usage; tool-specific (Lovable) |
| `generate-prototype-prompt` | Leave as-is or drop | Same |
| `finalize-project` | Apply chef pattern (likely) | Multi-step; user-tunable wrap criteria |
| `general-project` | Audit — usage unclear | May drop if subsumed by other skills |
| `wrap` | Audit — usage unclear | May drop if subsumed by `finalize-project` |

**For Group C**: sub-orch produces verdict + brief justification per skill in build-report. Apply chef pattern only to skills marked "likely" with high confidence. Defer ambiguous ones (verify usage via `git log`/grep against user's invocation patterns) to a Phase 4 follow-on if needed.

### Group D — Drop [GATE — per-skill verification]

Skills with no consumer, no recent invocation, no upstream-update story:

| Skill | Audit signal | Verdict |
|---|---|---|
| `daily-plan` | Per parent plan: "Confirmed remove. It's `daily-plan` as a CLI; John doesn't use it." | DROP |
| `prepare-meeting-agenda` | Verify usage; possibly subsumed by `meeting-prep` chef pattern | AUDIT |
| `quarter-plan` | Verify usage frequency | AUDIT (low priority) |
| `goals-alignment` | Verify usage frequency | AUDIT |
| `periodic-review` | Verify usage frequency | AUDIT |
| `week-review` | Verify usage; possibly subsumed by `weekly-winddown` | AUDIT |

**For each drop**: delete the skill dir; update `PATTERNS.md` and other skills that reference; surface to user in build-report.

### Group E — Leave as-is [confirmed]

True universal primitives. No action.

- `getting-started`
- `workspace-tour`
- `rapid-context-dump`
- `capture-conversation`

### Already chef pattern (skip — Phase 2)

- `daily-winddown`, `weekly-winddown`, `week-plan`, `process-meetings`, `meeting-prep`

## Acceptance criteria

| AC | Verification |
|---|---|
| **AC4.1**: Each Group A demotion has a verified CLI equivalent that produces same outcome as the deleted skill described. | Per-skill parity test (smoke OR integration). |
| **AC4.2**: Each Group A skill's `SKILL.md` and dir deleted, EXCEPT policy-as-config files preserved. | git status + ls verification. |
| **AC4.3**: Each Group B chef rewrite applies all four patterns + reads `.arete/skills-local/<slug>.md` + persists curated view to `now/archive/<skill>/<filename>` (Phase 3.5 convention) + tightens Uncertain-tier guidance (Phase 3.5 C2 convention). | grep check across 4 SKILL.md files. |
| **AC4.4**: APPEND-file seeding (Phase 2 deliverable) extended to the 4 new chef skills. | Migration test on fresh workspace fixture. |
| **AC4.5**: Group C audit verdict surfaced per-skill in build-report with brief justification. Skills marked "apply chef pattern" with high confidence are rewritten in this phase; ambiguous ones deferred. | Build report inspection. |
| **AC4.6**: Group D drops verified (no consumer, no recent invocation). Each deletion logged in build-report. | Build report. |
| **AC4.7**: AC8 ledger — Phase 4 nets ≥-9 (delete 9+ skill dirs). Cumulative across Phases 1-4 ≤+5 (vs +13 pre-Phase-4). **Stretch goal**: cumulative ≤0 at Phase 4 wrap-up. | Build report ledger. |
| **AC4.8**: All tests pass; typecheck clean. NO `npm test` at root (Phase 1 lesson). | Per-file `tsx --test` / `vitest run`. |
| **AC4.9**: PATTERNS.md and other shipped skills reference only existing skills/CLIs (no dangling references to demoted/dropped skills). | grep audit across all surviving SKILL.md + PATTERNS.md. |
| **AC4.10**: Build-report contains a final disposition table for ALL 41 shipped skills (every skill accounted for: chef-pattern / demoted / dropped / leave-as-is). | Build report inspection. |

## Adds vs removes ledger expectation

| Proxy | Adds | Removes | Δ |
|---|---|---|---|
| CLI verbs | 0 (or +1 if gap-fill needed for Group A) | 0 | 0 to +1 |
| Runtime skills (dirs) | 0 | -9 (Group A demotes) - 1+ (Group D drops) - 5+ (Group C chef rewrites if drops happen) | **-9 to -15** |
| Frontmatter file shapes | 0 | 0 | 0 |
| Memory file types | 0 | 0 | 0 |
| Services | 0 | 0 | 0 |

**Estimated combined Δ at ship**: -9 to -15.

**Cumulative across Phases 1-4 at wrap-up**: ~+13 (pre-Phase-4) → ~-2 to +4. **Phase 4 should be the first phase where cumulative ledger ≤0** (if Group C/D drops materialize).

## Test strategy

| Layer | Tests |
|---|---|
| Unit | Group B chef rewrite test scaffolding (output shape checks); Group A CLI parity unit tests if missing. |
| Integration | Group A demotions: end-to-end test of each `arete <verb>` CLI parity vs prior skill behavior. Use fixture workspaces. |
| Snapshot | Compare Group B chef SKILL.md output structure against Phase 2 chef skills (consistency check). |
| Smoke | `arete update` post-Phase-4 with clean workspace: confirms managed skills list shrinks correctly, APPEND files seeded for 4 new chef skills, no dangling references. |

**No `npm test` at repo root.** Per-file `tsx --test` / `vitest run`. Bounded timeouts.

## Skeptical view (required per Principle 9)

**The strongest case for not doing Phase 4 as scoped**: "Demoting 9 skills in one phase is a lot of churn. Each skill demotion has subtle risk: maybe a downstream skill or pattern doc references it. Maybe the CLI parity isn't perfect for edge cases that the SKILL.md prose handled. Group C audits could find more chef-pattern candidates and balloon the scope."

**Counter**:
1. The 9 demote-to-CLI candidates are pre-identified and verified during user testing (`people-intelligence` confirmed-never-invoked; `pull-from-*` and `calendar` are pure wrappers per disposition rule). Risk is bounded.
2. CLI parity is verifiable; sub-orch must produce parity test per demotion (AC4.1).
3. Group C is explicitly scoped as "audit + selective rewrite, defer ambiguous to follow-on." Doesn't have to expand.
4. Phase 4 is the only path to bring cumulative ledger ≤0. Deferring it makes the discipline-rule story incoherent.

**Residual risk**: a demoted skill's `arete <verb>` CLI has subtle differences from the skill's prose, surfaces during soak. Mitigation: per-skill commits enable surgical `git revert`. PATTERNS.md updates are reversible.

## Rollback

Per-deliverable.
- Group A (demotions): `git revert <skill-deletion-commit>` restores skill; PATTERNS.md and other skill references restored via the same revert.
- Group B (chef rewrites): per-skill commits; revert individually if any one regresses.
- Group C: incremental rewrites; revert individually.
- Group D (drops): `git revert` restores.
- Group E (leave-as-is): no action to revert.

## Hygiene reconciliation

Phase 4 does NOT touch hygiene-pass-1 deletions. It does delete shipped skill dirs (Group A/D), which is the intended Phase 4 action. Sub-orch must cross-check that demoted skill dirs were genuinely shipped pre-Phase-4 (not phantoms from hygiene deletions).

## Sub-orchestrator handoff brief

When meta spawns the Phase 4 sub-orchestrator, the brief includes:

1. **Read first**: this `plan.md`, parent `plan.md` (Principles, AC table, Phase 4 §"Pre-identified candidates"), parent `diary.md` (testing findings 2026-05-06/11/12/13 — chef pattern observation data), Phase 2 build-report (chef pattern application reference), Phase 3 build-report (skills-resolver behavior), Phase 3.5 build-report (curated view persistence + Uncertain guidance).
2. **Memory files**: `feedback_l3_memory.md`, `feedback_branch_isolation.md`, `feedback_commit_dist.md`, `project_arete_v2_direction.md`.
3. **Worktree**: meta will manually pre-create at `.claude/worktrees/phase-4-skills-audit` off `worktree-arete-v2-chef-orchestrator` (Phase 3 lesson). Pre-flight check: verify branch + key artifacts visible.
4. **Build sequence (mandatory ordering)**:
   - **Step 1 (Group A demotions)**: per skill — verify CLI parity, then delete skill dir, update PATTERNS.md + other skill cross-references. One commit per demoted skill. Subject: `phase-4(runtime,core): demote <skill> to <cli-verb>`.
   - **Step 2 (Group D drops)**: per skill — verify no consumer, then delete. One commit per drop. Subject: `phase-4(runtime): drop <skill> (unused)`.
   - **Step 3 (Group B chef rewrites)**: per skill — apply chef pattern with Phase 3.5 convention (archive path + Uncertain). One commit per skill. Subject: `phase-4(runtime): rewrite <skill> for chef pattern`. Extend APPEND-file seeding for the 4 new slugs in `arete install`/`update`.
   - **Step 4 (Group C audit + selective rewrite)**: produce per-skill verdict in build-report. Apply chef pattern only where confidence is high. Defer ambiguous.
   - **Step 5**: Tests (per-file targeted invocations).
   - **Step 6**: Rebuild dist; commit.
5. **Commit cadence**: per-skill commits enable surgical revert. `phase-4(<area>): <change>` convention.
6. **Build report**: append `dev/work/plans/arete-v2-chef-orchestrator/phase-4-skills-audit/build-report.md` with:
   - **Final disposition table for ALL 41 shipped skills** (every one accounted for)
   - Files deleted / kept / rewritten
   - Tests added
   - AC verification status
   - AC4.7 ledger filled with actual counts
   - Group C deferred-to-follow-on items
   - Ready-for-review state
7. **When to engage meta**:
   - Group A CLI parity gap discovered (CLI doesn't actually do what skill described) — surface for gap-fill decision.
   - Group C audit produces ambiguous verdicts where sub-orch can't decide alone.
   - Group D drop reveals a consumer we missed.
   - AC4.7 ledger shifts substantially (e.g., +0 instead of -9 means demotions didn't materialize).
   - PATTERNS.md or downstream skills break references after deletion.
   - Otherwise: complete autonomously.
8. **Watchdog-safe testing**: NO `npm test` at root. Per-file `tsx --test` / `vitest run` only.

## Cadence

- **Build**: 7–10 days plan estimate. Realistic agent wall time ~1.5–2 hours (largest phase yet by raw scope but mechanical for most demotions).
- **Soak**: 7 days. AC11 hard stop applies for the 4 chef-rewritten skills.
- **Review**: ~1 day (eng-lead reviewer; possibly fix-up cycle).
- **Ship to main**: after John's testing of Phases 1+2+3+3.5+4 in worktree. Phase 4 main-merge will be the v2 milestone — first phase that brings cumulative ledger ≤0.

## Critical files

| File | Role in Phase 4 |
|---|---|
| `packages/runtime/skills/<demoted-skill>/` × 9 | DELETED in Group A |
| `packages/runtime/skills/<dropped-skill>/` × 1+ | DELETED in Group D |
| `packages/runtime/skills/<chef-rewritten>/SKILL.md` × 4+ | REWRITTEN in Group B (+ C if applicable) |
| `packages/runtime/skills/PATTERNS.md` | Reference cleanup after demotions |
| `packages/runtime/skills/{daily,weekly}-winddown/SKILL.md` etc. | Reference cleanup if they reference demoted skills |
| `packages/cli/src/commands/install.ts`, `update.ts` | Extend APPEND-file seeding for 4 new chef slugs |
| `dev/work/plans/arete-v2-chef-orchestrator/phase-4-skills-audit/build-report.md` | NEW — sub-orch authors with disposition table for ALL 41 skills |
