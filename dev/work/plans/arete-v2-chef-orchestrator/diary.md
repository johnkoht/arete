---
title: "Areté v2 chef-orchestrator — meta-orchestrator diary"
slug: arete-v2-chef-orchestrator-diary
created: "2026-05-01"
owner: meta-orchestrator (Claude)
purpose: durable thread across context resets; decision log; sub-orchestrator status; review notes
---

# Areté v2 chef-orchestrator — diary

This file is the durable thread for the meta-orchestrator running this parent plan. Read top-to-bottom on every fresh context. Append-only by convention; correct in-place only when a recorded fact turns out to be wrong (and note the correction).

## Compact-safe recovery — what to read in what order if context was just reset

If you're a fresh meta picking this up after a compact or new session:

1. **`MEMORY.md`** (auto-loaded by harness) — `project_arete_v2_direction.md` is the v2 thesis. `feedback_branch_isolation.md`, `feedback_commit_dist.md`, `feedback_l3_memory.md` are load-bearing rules.
2. **This diary** — start with the latest "Decisions log" entry below; scan the status table for Phase positions; read "User testing window" if active; read "Lessons forward" sections for Phase 0/1/2 patterns.
3. **`plan.md`** — Principles 1–9, AC table (esp. AC10 gating, AC11 hard stop, AC8 ledger), Phase Plan Requirements table, current phase definitions.
4. **`pre-mortem.md`** if reviewing risk for a new phase.
5. **Parent reviews** (`review.md`, `review-2.md`) — first verdict (REVISE BEFORE BUILD) → revisions → second verdict (APPROVE WITH MINOR CONCERNS). MC1–MC5 came from this.

Per-phase deep dive (only if needed):
- **Phase 0** (instrument + baseline) — shipped to main `131863fe`. Artifacts at `phase-0-instrument-baseline/{plan,build-report,review,review-2}.md`.
- **Phase 1** (wiki expansion) — shipped to parent `eb50dccf`; main-merge pending user testing. Artifacts at `phase-1-wiki-expansion/{plan,build-report,review}.md`. Recovery agent + fix-up agent histories captured in build-report.
- **Phase 2** (chef-orchestrator rewrite) — shipped to parent `650d325c`; main-merge pending user testing. Artifacts at `phase-2-chef-orchestrator-rewrite/{plan,build-report,review}.md`. Five rewritten skills + 5 SKILL.legacy.md companions; `ARETE_LEGACY_SKILL_PROSE` flag for per-skill rollback; `arete skill resolve` CLI verb.
- **Phase 3** (skills directory split) — not started; section in parent plan.
- **Phase 4** (skills audit) — not started; section in parent plan **includes the demote-to-CLI disposition rule + candidate list** added 2026-05-05. Read that section before drafting the Phase 4 plan.
- **Phase 5** (meeting extract decomposition) — not started.
- **Phase 6** (schema layer, conditional) — not started.

Sub-worktrees still on disk:
- `.claude/worktrees/agent-aa686a8109331e31b` (Phase 0)
- `.claude/worktrees/agent-a7aa23e400eeeac6c` (Phase 1)
- `.claude/worktrees/agent-a8c94a3575a32646c` (Phase 2)
- `.claude/worktrees/agent-ab2ab108` (older; pre-v2; can ignore)

Cleanup whenever: `git worktree remove <path>`.

## Origin

User (John, builder + primary daily user) initiated v2 thinking on 2026-04-30 after observing Areté has grown bloated and hard to reason about. Goals: slimmer system, Karpathy-wiki memory foundation, Core/Skills split, MCP-first where applicable, address the daily-winddown bloat that takes 30–45 min daily. Four research subagents ran in parallel; their findings are summarized below.

## Vision (one paragraph)

Areté v2 is a chef-orchestrator architecture: CLI/services do less judgment, the chat agent does more. CLI primitives are extraction, fetch, store, and query. The chat agent uses wiki + memory + raw sources to apply judgment (importance, dedup-against-state, conflict-with-priorities, deferral suggestions). The user reviews exceptions and proposals, not flat firehoses. The architectural keystone is a typed schema layer (events.jsonl + state.json) that lets the agent leverage signals the system already captures but currently drops at the commit boundary.

## Discipline rules (load-bearing)

These exist because the user's biggest fear is "and-also creep" — adds without corresponding removes. Memory: `feedback_ai_fix_escalation.md` (cheapest-first), `project_arete_v2_direction.md` (slimmer is the explicit antagonist).

1. **Adds get a "what does this delete?" gate.** Before shipping any new substrate, name the specific code paths that shrink/die. If we can't, don't ship.
2. **No v2 add lands solo.** Each PR pairs an add with the corresponding remove. No "we'll clean this up later."
3. **Hygiene-pass-1 ships first.** Whatever it removes, v2 cannot add back. Whatever surprises it surfaces should reshape what's load-bearing in v2.
4. **The user-view is the simplicity test, not the code-view.** If we ship something and John still doesn't understand how it works, we got it wrong. LOC is a secondary metric.
5. **Every phase plan goes through `/ship`.** Pre-mortem, review, build, wrap. Sub-orchestrator runs the cycle; meta-orchestrator (this file's owner) reviews at `/review`.

## Status snapshot (current state)

| Item | Status | Notes |
|---|---|---|
| Hygiene-pass-1 | **Merged into local main** (commits 9d26005c v0.10.1, f774aa65 feat) — not yet pushed to origin | Worktree rebased onto post-hygiene main 2026-05-01 |
| First plan review | Complete (REVISE BEFORE BUILD) | `review.md`; verdict addressed in revisions |
| Second plan review (focused) | **Complete — APPROVE WITH MINOR CONCERNS** | `review-2.md`; MC1–MC5 threaded into parent plan as phase-plan requirements |
| Parent plan (`plan.md`) | Revised twice 2026-05-01 | First post-review, then post-absorption-principle |
| Parent pre-mortem | Revised 2026-05-01 (R14–R19 added post-review) | Iterate as phases land |
| Phase 0 plan (instrument + baseline) | Not started | First phase pending user approval |
| Phase 1 plan (wiki expansion) | Not started | Per absorption principle |
| Phase 2 plan (chef-orchestrator rewrite) | Not started | The user-felt dream |
| Phase 3 plan (skills directory split) | Not started | After chef behavior is right |
| Phase 4 plan (skills audit) | Not started | Sweep remaining skills with chef pattern |
| Phase 5 plan (`meeting extract` decomposition) | Not started | Largest blast radius; back-end refactor |
| Phase 6 plan (schema layer) | Not started — conditional | Ships only if Phase 2/5 retros surface real consumer needs |

## Hygiene-pass-1 — what's already gone (informs v2 scope)

Hygiene merged 2026-05-01 (~2.7K LOC removed). Verified post-merge:

- T1: pre-monorepo legacy `src/`, `test/`, `tsconfig.test.json` — gone.
- T2: four @deprecated named functions (`extractKeywords`, `findMatchingCompletedItem`, `getDocument` (krisp), `PRODUCT_RULES_ALLOW_LIST`) — gone.
- T3: `person-signals.ts` action-item LLM cluster (3 functions + ~50 tests) — gone. **Implication for v2**: one less LLM-call cluster to reason about; v2 must not re-introduce.
- T4: `ContextService.getContextForSkill` — gone (context.ts dropped from 636 → 621 LOC). **Implication**: Phase 3's "three services collapse to one" still relevant; partial collapse already done.
- T5: `ToolService` → free functions (`listTools`, `getTool`).
- T6: `buildTopicWikiContext` helper extracted from `meeting-context.ts:978–1025`.

**Hygiene-explicitly-deferred items v2 should be aware of** (from hygiene plan §"Out of scope"):
- `compat/` migration — separate plan.
- CLI deprecation-window collapses (`context --for`, `memory search`, `memory timeline`) — separate plan; touches AGENTS.md + skill prose.
- `MemoryLogService` — kept (POSIX O_APPEND atomicity). v2 must not silently drop this.
- `loadMemorySummary` — kept (4 production callers post-0.9.0).
- `model-router.ts` / `arete route` — held pending router decision. Aligned with v2 plan's deferral.
- `patterns.ts` rewrite — locked out by 0.9.0 architectural direction (L2-coexists-with-wiki). v2 Phase 5 should not touch.

## Decisions log

### 2026-05-01

- **Worktree**: `.claude/worktrees/arete-v2-chef-orchestrator/` on branch `worktree-arete-v2-chef-orchestrator`. Everything for v2 lives here.
- **All artifacts in plan folder.** Diary, plan, pre-mortem, phase plans, ship artifacts — all under `dev/work/plans/arete-v2-chef-orchestrator/` (and per-phase subdirs for phase plans).
- **Meta-orchestrator pattern confirmed.** Parent plan owned by this conversation's agent (meta). Each phase plan owned by a sub-orchestrator running its own `/ship` cycle. Meta reviews at `/review` stage and merges phase work back into the parent worktree.
- **Phase ordering**: summaries promotion first (nearly free, validates pattern), then schema layer (keystone), then chef-orchestrator pipeline (decomposition), then skills split, then judgment substrate. Reorder if hygiene findings change the calculus.
- **Sub-orchestrator spawn timing**: lazy. Spawn only when a phase is ready to start so each absorbs lessons from the prior phase.
- **Integration corrections (after user pushback)**:
  - **Krisp/Fathom integrations stay** — they're recording-source abstractions, not redundant with MCPs.
  - **Notion MCP stays** — works well for John.
  - **Calendar primitive stays** — multi-provider abstraction (gws/outlook/etc.) is legitimate Core concern; skills shouldn't know which provider.
  - Net: integrations directory mostly intact. Simplification comes from elsewhere (CLI command consolidation, skills-as-templates, schema layer absorbing ad-hoc parsing).
- **`meeting extract` clarification**: replace internals (literal-content extraction only), not remove the command. Judgment moves to orchestrator.
- **`memory refresh` clarification**: split — keep mechanical bits (index, log, byte-equal CLAUDE.md regen), remove embedded synthesis pipelines.
- **`brief --raw` stays** as Core primitive; `brief --for` LLM branch becomes a skill. `search` stays; `search --answer` LLM branch goes.
- **`onboard` stays** — first-run experience is high-stakes, one-time cost; CLI entry is right.
- **`daily` removed** — never used by John; was effectively `daily-plan` skill as CLI.
- **`route` deferred** — review whether anyone uses it before deciding.

## Research findings (synthesis from four parallel agents 2026-04-30)

Source agents:
1. Bloat audit (`packages/core` + `packages/cli` + `packages/apps/{backend,web}`)
2. Winddown + extraction pipeline trace
3. Core vs Skills boundary classification
4. Karpathy wiki gap + chief-of-staff substrate

### "10 cooks" has a specific source

The redundancy is NOT extraction fanning out. It's:
1. **Post-approval topic integration**: every approved meeting × every tagged topic = one Sonnet call. Importance is **not consulted**. A 5-min hallway sync costs the same as a quarterly review.
2. **Storage fan-out**: one decision lands in 3 places (frontmatter + body + `decisions.md`); one action item lands in 4 places (add commitments + week.md). Mostly justified by different consumers; `frontmatter.approved_items` is a true third-copy duplicate that exists only because the web review UI reads it.

### Smoking gun: signals captured then dropped

`grep importance|priority` across `area-memory.ts`, `person-memory.ts`, `topic-memory.ts`, `memory-summary-loader.ts`, daily-winddown skill returns **zero hits**. Signals dropped at commit boundary:
- `meeting.frontmatter.importance` (skip|light|standard|heavy)
- `staged_item_confidence` per item
- `staged_item_status` (skipped, etc.)
- `task-scoring.ts` results (computed at retrieval, never stored)
- Week priorities (parsed from prose every time, not canonicalized)
- `agent-observations.md` — durable judgment file with no writer-of-record

### Worst CLI antipatterns

- `meeting extract` smuggles 5 judgment calls into one CLI invocation (extract + classify + topics + core/could-include + reconcile)
- `memory refresh` smuggles 5 pipelines under one verb
- `brief --for` and `search --answer` are "context → LLM → prose" — exactly what the chat agent does for free

### Skills classification

- **Core-as-shipped**: process-meetings, meeting-prep, people-intelligence, save-meeting, getting-started
- **User templates** (boilerplate, expect customization): daily-plan, daily-winddown, weekly-winddown, week-plan, slack-digest, inbox-triage, schedule-meeting, all `pull-from-*`, all PM artifacts (PRD/discovery/pre-mortem/...)

### Karpathy wiki gap

Today's `.arete/memory/` has `topics/` (concept pages, well-built), `areas/` (operational rollup), `items/` (atomic L2). Missing: summaries layer (data already produced — promotion is nearly free), entity pages as wiki peers (people exist hand-curated; orgs/customers don't exist), schema layer (events.jsonl + state.json).

## Sub-orchestrator review queue

| Phase | Sub-orch ID | Sub-worktree | /ship stage | Last review | Notes |
|---|---|---|---|---|---|
| Phase 0 | aa686a8109331e31b | `.claude/worktrees/agent-aa686a8109331e31b` | **SHIPPED TO MAIN** (merge `131863fe`) | APPROVE WITH MINOR CONCERNS → fix-ups → APPROVE | Build: 9 commits. Eng-lead first review surfaced 3 fix-ups. Fix-up agent landed 5 more commits (incl. dist). Mini-review APPROVE. AC0.8 ledger net +3 matches plan prediction. Tests 71/71 pass. Soak in progress (depends on John actually running daily-winddown). |
| Phase 1 | a7aa23e400eeeac6c | `.claude/worktrees/agent-a7aa23e400eeeac6c` | **SHIPPED to parent** (merge `eb50dccf`); main merge **pending John's Phase 0 testing** | APPROVE WITH MINOR CONCERNS — meta's three framing calls all ACCEPTED | Build: 6 phase-1 commits (Steps 1-6). Original sub-orch died on `npm test` watchdog stall (~50 min). Recovery agent (~9 min) finished Steps 7+ via per-file `tsx --test`. Fix-up agent (~10 min) deleted missed `## Could include` body-block Remove. Eng-lead review accepted: (a) substitution argument at +8 ledger; (b) skill-prompt migration deferred to Phase 2; (c) 3 pre-existing backend agent.test.ts failures not Phase 1's regression. Total wall time ~69 min vs. 14-18 day estimate. |
| Phase 2 | a8c94a3575a32646c | `.claude/worktrees/agent-a8c94a3575a32646c` | **SHIPPED to parent** (merge `650d325c`); main merge **pending John's Phase 0 + 1 testing** | APPROVE WITH MINOR CONCERNS — all four meta framing calls ACCEPTED | Build: 9 mandatory steps (PATTERNS.md → APPEND seeding → skill-resolver → daily-winddown validation + Step-5 A/B → 4 more skills → frontmatter.approved_items removal → tests → dist) shipped autonomously in ~37 min. Step-5 A/B PASS at 8/10 with 2 prose refinements. Eng-lead review (~4 min) verified ledger truth, plan-Removes cross-check, skill prose ambiguity. Prose fix-up agent (~2 min) landed 3 minor concerns; 4th (deferral_disagreement wiring) deferred to first soak pull-back. AC2.11 ledger: +8 at ship → +2 at wrap-up after MC5 legacy sunset; substitution argument accepted (skills-local + skill-resolver load-bearing for chef pattern with safe rollback). Total wall time ~43 min vs. 10-14 day estimate. |
| Phase 3 | (take 1 a8e2726204ec3dbd4 halted on wrong base; take 2 a644f0be6b075ca58) | `.claude/worktrees/phase-3-skills-split` (manually pre-made) | **SHIPPED to parent** (merge `56a9e135`); main merge **pending John's Phase 0/1/2 testing** | **APPROVE — no fix-ups required** (cleanest cycle yet) | Take 1 halted correctly on pre-flight: Agent's `isolation: "worktree"` landed on `main` instead of v2 parent branch; sub-orch noticed missing Phase 2 artifacts and refused to proceed. Take 2 shipped all 9 plan steps in ~35 min from manually-prepped worktree. **MC5 sunset complete** (Step 9 standalone commit `099f1492`): 5 SKILL.legacy.md files deleted (~3.2K LOC), `ARETE_LEGACY_SKILL_PROSE` routing removed from skill-resolver, `## Rollback` sections updated to cite git revert of Phase 2 commits. Eng-lead review (~3 min): independent ledger recount matches; migration test exercises both code paths plus 5 edge cases; hygiene reconciliation clean. AC3.7 ledger: +5 at ship → 0 at wrap-up (vs plan +6 → 0; better than estimate). Total wall time ~41 min vs. 5-7 day estimate. |
| Phase 3.5 | a65680f07456cb1d0 | `.claude/worktrees/phase-3-5-polish` (manually pre-made) | **SHIPPED to parent** (merge `8f61d9b8`); main merge **pending John's testing** | **APPROVE WITH MINOR CONCERNS — no fix-ups required** | 11 polish items in 5 groups bundled from 2026-05-06 user testing findings. Group A (arete update migration fixes), Group B (auto-fork-base + arete skill fork polish), Group C (5 chef SKILL.md prose tightening commits — C1 persist curated view + C2 Uncertain rule), Group D (deferral_disagreement event type + 2 new CLI verbs: events log deferral-disagreement + events backfill item-fates), Group E (backend-running warning + gitignore template). Build ~38 min, eng-lead review ~4 min, no fix-up cycle. Tests: 199 pass via per-file tsx --test. AC3.5.13 ledger: +3 at ship vs +2 estimate; substitution argument accepted (CLI verbs are observability/recovery primitives with ongoing utility; now/<skill>-YYYY-MM-DD.md prose-only is load-bearing for AC10/AC11 audit). Cumulative across Phases 1+2+3+3.5 wrap-up: ~+13. Total wall time ~42 min vs. 2-3 day estimate. |
| Phase 3.5 follow-up | meta (no sub-orch) | parent worktree | **SHIPPED to parent** (commit `7ca3ea47`) | n/a | User feedback 2026-05-14 after 3-day soak: chef curated views cluttering `now/`. Moved 3 existing winddown files + 5 chef SKILL.md path changes to `now/archive/<skill>/<filename>` matching existing `now/archive/week-*.md` convention. Updated mkdir -p commands. Side note: this followup left chef-orchestrator-skills.test.ts broken (path drift); Phase 4 fixed in-flight. Lesson: ship test-update commits alongside skill prose changes. |
| Phase 4 | a752778ff8ef7e2b9 (build) + ae3010d5e6f3e0f1b (doc fix-up) | `.claude/worktrees/phase-4-skills-audit` (manually pre-made) | **SHIPPED to parent** (merge `501d7eac`); main merge **pending John's testing** | **APPROVE WITH MINOR CONCERNS** — 2 doc-hygiene fix-ups landed pre-merge | The discipline-math milestone phase. **Stretch goal HIT: cumulative ledger Phases 0-4 = ≈-1 to -5 (negative for first time in v2).** Disposition across 40 shipped skills: 9 demoted to CLI (krisp/fathom/notion/doc-pull/drive-search/email-search/calendar/save-meeting/people-intelligence — policy.json preserved), 4 chef-rewritten (inbox-triage/email-triage/slack-digest/schedule-meeting — Phase 3.5 conventions), 3 dropped (daily-plan/week-review/generate-mockup), 7 deferred to Group C follow-on (PM artifacts), 4+4 leave-as-is audit, 4 universal primitives, 5 already Phase 2. AC4.7 ledger: Phase 4 Δ -12 (plan band -9 to -15). In-flight: gmail --query CLI gap-fill + Phase 3.5 test fix-up. 252 tests pass. Post-review: 6 doc commits cleaning 19 dangling refs + completing AC4.10 disposition table for 4 missing skills. Build ~29 min + review ~6 min + fix-up ~8 min = ~43 min total vs. 7-10 day estimate. |
| Phase 3.5 followup-5 | a515fcd412a954c60 (build) | `.claude/worktrees/phase-3-5-followup-5-wiki-discoverability` (manually pre-made) | **SHIPPED to parent** (merge `8a913a27`); main merge **pending John's testing** | **APPROVE WITH MINOR CONCERNS** — no fix-ups required (4 low/low-med observation-class concerns) | Wiki source discoverability. Closes Bug 1 (3-way meeting-frontmatter writer divergence; path 3 was dropping topics+counts post Phase 2 chef-rewrite at `8a43078f`) via shared `writeMeetingApplyFrontmatter` helper. Closes Bug 2 (email-templates orphan class) rescue path via alias-aware integration filter + singularize tokens. AC4 (containment match) dropped pre-build per review-1 production parent/child topic risk. AC5 demoted to diagnostic — finding: `email-templates` ranks #117/249 in `getActiveTopics`, truncated out of top-25 bias list — parking-lot for next phase. AC6 chef Step 0.7 surfaces ONE stale topic per winddown with concrete alias candidates + exact `arete topic refresh` command + skip-on-first-run gate. Test sweep: 1066 across 17 files. Build ~18 min + 2 plan-review rounds + 1 build-review = ~3hr total wall time (autonomous overnight). Ledger: ~+256 code LOC with substitution argument (unified writer load-bearing for path-3 correctness). Cycle pattern: drafted plan → review-1 REVISE (8 concerns, 2 high) → revised → review-2 APPROVE WITH MINOR (2 new low for in-flight) → sub-worktree → build → review APPROVE WITH MINOR → merge. |
| Phase 7a | a2c3e772b5f9d650f (build) + ledger-correction commit `aa107599` | `.claude/worktrees/phase-7a-cross-skill-foundations` (manually pre-made) | **SHIPPED to parent** (merge `4f7ce486`); main merge **pending John's testing of Phase 7a + 7b** | **APPROVE WITH MINOR CONCERNS** — 1 med ledger-correction fixed inline; 3 low observation-class | Cross-skill foundations (additive substrate) — first half of 2026-05-28 reframe. Ships substrate Phase 8 reconciler needs: PATTERNS.md "gather-only composition" sub-mode (Pattern 5); slack-digest + email-triage SKILL.md gather-only sections with explicit run/skip tables; `jira_epics:` area frontmatter; new `arete areas` command (list + epics subcommands, plural matches `arete people`); `arete people show --channels` + `--channels --json`; `arete people audit-channels` workspace-wide channel-field gap probe; `arete pull calendar --days N` flag honoring (was hardcoded 7); calendar-semantics doc in PATTERNS.md. AC4 dropped (containment match would over-coerce production parent/child topics — done in followup-5). Pre-mortem R1 (person frontmatter sparseness) materialized stronger than anticipated: AC5c audit on arete-reserv shows 12% email / 0% slack / 88% zero channel-fields across 147 people — Phase 8 reconciler must gracefully degrade per pre-mortem R1 mitigation. Cycle: drafted plan → review-1 REVISE (5 concerns, 2 high) → revised + 3 low inline fixes → review-2 APPROVE WITH MINOR → sub-worktree → build (13 commits) → review APPROVE WITH MINOR (1 med ledger correction) → fixed inline → merge. Total wall ~3hr (autonomous run during user testing). Ledger actual: +606 src LOC + +1079 markdown + +1210 tests — 3x and 6.3x plan estimate respectively. Substitution argument extended to actual magnitude (substrate load-bearing for Phase 8; 7b absorbed-removes sweep brings cumulative back). Sunset trigger if Phase 8 unmerged: 2026-06-30. Pre-existing test failure surfaced (`people.test.ts:166`) — verified failing on base too via git stash; file as separate triage. Phase 8 design must account for AC1 best-effort prose contract limitation (no enforcement layer) + AC5 backfill gap (graceful degradation expected). Post-7a followup `ecc8269e`: inline channel-field convention in audit-channels output (was pointing at dev/conventions/person-frontmatter.md path that doesn't exist in user workspaces post-`arete update`). |
| Phase 7b | ad595f8cc7d10e367 (build) + reviewer-fixup `080abc4d` | `.claude/worktrees/phase-7b-validation-then-deletion` (manually pre-made) | **SHIPPED to parent** (merge `11d240ea`); main merge **pending John's testing** | **APPROVE WITH MINOR CONCERNS** — 1 minor fix landed pre-merge (UPDATES.md changelog annotation); 2 minor observation-class | Validation-then-deletion sweep — second half of 2026-05-28 reframe. Pre-scope audit produced per-candidate verdicts: 3 DELETE (search --answer, arete daily, memory refresh LLM blocks), 1 expand-to-MODIFY-then-DELETE (area-memory orphan LLM cleanup per review-1 C1 — `arete area refresh` doesn't exist as separate verb so those paths have no caller post-AC3a), 1 DEFER (brief --for, entangled with skill-command generator), 3 KEEP (meeting-parser load-bearing for person memory refresh; three context services have active backend consumers; arete route documented in adapter strings). User confirmed never-used items: "I've never used search --answer or daily." Cycle: drafted plan → review-1 APPROVE WITH MINOR (6 concerns incl 1 high — orphan LLM paths) → revised AC3 expanded to 3a/3b/3c → review-2 APPROVE ready to build → sub-worktree → build (7 commits incl 2 critical-verification gates: R4 grep BEFORE AC3 deletion + 3b only-one-caller grep) → review APPROVE WITH MINOR → 1 inline fixup → merge. R4 EMPTY (no external consumers); 3b PASSED (only intelligence.ts:488 caller). 590/590 tests pass. Ledger actual: -775 LOC src (vs plan ~-903 estimate). **Combined 7a+7b cumulative: ~-169 LOC code-only — parent AC8 ≤0 satisfied WITHOUT substitution argument**. Total wall ~2hr. Documented as closed: 4 audit DEFER items don't get re-litigated. Open follow-up: brief --for LLM-branch removal (separate phase post-Phase-8; touches skill-command generator + every requires_briefing skill). |
| Phase 8 | ab89cfbfe5c586e03 (build) + eng-lead-fixup `850b07f1` | `.claude/worktrees/phase-8-loop-reconciler` (manually pre-made) | **SHIPPED to parent** (merge `f717b26f`); main merge **pending John's testing + 14-day AC11 soak** | **APPROVE WITH MINOR CONCERNS** — 1 MED fix landed inline (soak-window caution against blanket `all` approval); 4 follow-up items noted | The user-felt-win phase. Daily-winddown becomes cross-skill chef per 2026-05-28 spec: parallel gather from slack+email+meetings+calendar+commitments via Pattern 5 gather-only invocations from 7a; Step 2 reconciler applies three skip rules (Rule 1 intent→fulfillment, Rule 2 intent→event, Rule 3 action-moot); "Closed today (proposed)" surface with CT IDs + evidence pointers; ALL collapses PROPOSED (no auto-collapse — per review-1 C3); re-run idempotency (R7); mtime-snapshot contract-violation check (C5). Cycle: drafted plan → review-1 APPROVE WITH MINOR (7 concerns incl 2 high) → revised extensively (added "What ships degraded at MVP" front-loading the slack_user_id=0% reality; killed dual-collapse pattern; added measured-shadow-gather; added recurring-1:1 guard) → review-2 APPROVE → sub-worktree → build (8 commits) → review APPROVE WITH MINOR → 1 inline fixup → merge. **Anchor cases at ship**: ai_003 (Rule 3 action-moot) CAUGHT; ai_004 (Rule 2 calendar attendee match — regardless of organizer.self) CAUGHT; ai_002 (Rule 1 slack DM) degraded to Uncertain pending slack_user_id backfill (0% populated workspace-wide; tracked via 7a audit-channels nudge). **AC6 caveat**: shadow gather was inferred from archived data (thought-experiment, not real chef run); first-day soak wall-clock is the actual measurement; AC11 (>45m hard stop) is the eject button. 554/555 tests pass (1 pre-existing unrelated failure). Ledger: 0 src + 403 markdown (2.7x plan estimate; load-bearing per substitution argument). Cumulative 7a+7b+8: -169 LOC code-only (unchanged from 7a+7b). 7a substrate sunset trigger (2026-06-30) no longer applies — Phase 8 IS the consumer. 4 follow-ups queued: process-meetings formal gather-only section; calendar --days negative support; auto-collapse negation test regex tightening; brief --for LLM removal (from 7b). |
| Phase 8 followup-1 (items 1+2+3) | meta (direct on parent, no sub-orch) | parent worktree | **SHIPPED** (commit `a9db035e`) | n/a — small bundled commit | Three small fixes from Phase 8 build-review queue, bundled as one focused commit per user direction. (1) process-meetings/SKILL.md gains formal `## Gather-only mode` section matching slack-digest/email-triage pattern from 7a; full run/skip table + JSON output shape with meeting-specific kind taxonomy (commitment-outgoing/incoming, decision, learning, prep-intent). (2) `arete pull calendar --days N` now accepts negative integers for backward window (events in past N days); google-calendar.ts + ical-buddy.ts `getUpcomingEvents` updated; daily-winddown Step 1n switched from per-day `--date` workaround to unified `--days -1`. (3) chef-orchestrator-skills.test.ts auto-collapse negation regex tightened from permissive (bare `no`/`not`/`NOT`/`NO` within 120 chars) to explicit (NEVER, MUST NOT, "not auto-collapse" / "no auto-collapse", killed, GONE, removed, dropped, "original plan", "review-1 C3"). 516/516 tests pass. Dist rebuilt. |
| Phase 8 followup-2 (item 4) | ad2083d4c67ec69d9 (build) | `.claude/worktrees/phase-8-followup-2-brief-llm-removal` (manually pre-made) | **SHIPPED to parent** (merge `[this session]`) | **APPROVE WITH MINOR CONCERNS** — 4 INFO/LOW non-blocking | `brief --for` LLM-branch removal — the deferred Phase 5 absorbed-remove queued from 7b's audit. Removes: (a) the `useAI` synthesis branch from `arete brief` CLI command; (b) `synthesizeBriefing` method + BRIEF_* constants + SynthesizedBriefing type + AIService import from IntelligenceService; (c) entire intelligence-brief.test.ts file (263 LOC, all synthesis tests; assembleBriefing coverage retained in other files); (d) generator comment in skill-commands.ts updated to reflect raw-context-assembly. Adds: (a) `--raw` flag kept as hidden no-op per C1 (3 LOC; preserves backward compat); (b) review-plan SKILL.md gains C3's "ignore non-review-relevant briefing sections" paragraph (the kitchen-sink-payload mitigation); (c) _authoring-guide.md + GUIDE.md briefing-assembly section updated. R-grep BEFORE removal: NO non-test consumers of synthesizeBriefing or .synthesis/.synthesized/.truncated JSON fields. requires_briefing skill count re-verified by reviewer: only review-plan (11 other skills explicitly set false). Plan's AC4 scope was correct. Cycle: drafted plan → review-1 APPROVE WITH MINOR (4 concerns) → revised (kept --raw as hidden no-op; reframed skeptical view around kitchen-sink payload; expanded R-grep) → sub-worktree → build (6 commits) → review APPROVE WITH MINOR (4 INFO/LOW) → merge. **Ledger actual: -185 LOC non-dist net** (reviewer correction; build-report's -426 was deletions-only; plan estimated -205 to -325). **Cumulative 7a+7b+8+8f1+8f2: ~-334 LOC code-only — comfortably negative**. 646/0 tests pass. 4 INFO/LOW follow-ups: orphan 'brief' AITask type member, --raw deprecation timeline, stale PRD artifact, ledger reporting convention. |

## Open questions / parking lot

- **Topic integration**: keep narrative-rewrite shape but gate on importance, or scrap entirely? N×M Sonnet cost is the most concentrated bloat. **Lean: gate on importance + confidence as cheapest-first lever; revisit scrap-entirely after seeing how it feels.**
- **Dismissal-as-signal feedback loop**: worth building, or is review friction acceptable? **Lean: build it as part of judgment substrate (Phase 5).**
- **`week.md` as a working file**: hand-readable markdown, or derived view from state.json? **Lean: derived view, but markdown remains source-of-truth for user edits; refresh harmlessly regenerates non-user sections.**
- **`route` command**: keep or remove? **Defer.**
- **Skills directory shape**: `.arete/skills` (managed) + `.agents/skills` (user) per John's preference. Naming friction with adapter renderer for Cursor/Codex AGENTS.md flow. Resolve in Phase 4.

## Decisions log — 2026-05-28 overnight (Phase 3.5 followups 3-5 — autonomous run)

User opened a single working session that ran from ~late 5/27 through ~early 5/28 (overnight autonomous build). Five distinct fixes shipped across this window:

**Followup 3 (commit `a1447910`)** — Daily-winddown SKILL.md prose: lowered sidecar threshold from ≥4 to ≥3 deferred items (closes "substantive after dedup" loophole), added explicit parser-bug mirror-pair batch-resolution rule. Derived from AC10 dig analyzing 7 winddown event pairs + 6 archived curated views. Median was actually ~17m, not the ~21m the diary recorded earlier (5/27 entry). Time-distribution finding: duration is volume-driven, not chef-overhead.

**Followup 4 (commits `b454c507` + `6c8a9992`)** — Commitment-resolve leak (F1-F4). User reported tasks/commitments not closing properly — chef over-indexed on completed work. Subagent diagnosis: `CommitmentsService.resolve()` was unidirectional (wrote commitments.json only; no back-prop to week.md/tasks.md), AND the 30-day auto-prune silently deleted resolved commitments leaving dangling `@from(commitment:xxx)` orphans (e.g., Cover Whale's `8dd24527`). Shipped:
- F1: `setCompleteTaskFromCommitmentFn` injection; resolve() back-props matched tasks to `[x]` + `@completedAt`
- F2: `setHasOpenTaskReferencesFn` injection; save() refuses to prune commitments with live OPEN task refs (completed tasks with stale refs are prune-OK)
- F3: chef SKILL.md hard rule — every prune candidate proposing resolve MUST lift to numbered `arete.commitments_resolve` action (closes the 5/27 "6-item Aging i_owe_them block, zero numbered actions" pattern)
- F4: chef Step 0.6 scans prior winddown for unactioned resolves, surfaces unhonored IDs at top of today's view (closes "approved [6,7] of 4 — dropped never resurface" leak)
- Plus eng-lead review fix-ups: FU1 integration test wiring both services, FU2 PRUNE_HARD_CEILING_DAYS=90 (sticky-open tasks can't hold resolved commitments alive forever), FU3 batched `hasOpenTaskReferencesFn` (one file read per save())

**Investigation interlude (overnight)** — User asked about wiki state ("is the Karpathy-style wiki working?"). Two parallel subagents diagnosed:
- **Architecture audit**: 248 topic pages live; `topics/` + `areas/` + `items/` + `index.md` is the wiki. Only meeting transcripts + slack digests feed it. Notion/Jira/inbox don't flow into wiki. Phase 1 wiki expansion (summaries/meetings/, entities/orgs/) is in worktree but NOT in user's installed binary — that's why summaries/ is empty on disk despite the code existing. User's mental model needs: "what John sees in topics/ IS the wiki; everything else is raw resources."
- **email-templates case study**: Topic page last_refreshed 2026-04-24 (33d stale), only 1 source ever integrated. 33+ recent meetings + 9+ slack-digests mention email templates in body. **ZERO of them tag the canonical `email-templates` slug** — they tag sub-slugs (`default-email-template`, `snapsheet-import-script`, `rollout-strategy`, `language-preference`). The discovery filter at `topic-memory.ts:1133` does exact-string match. Plus user noticed meetings stopped getting `area:`/`projects:` frontmatter after 5/08 — schema regression coinciding with Phase 2 chef-rewrite switching from `arete meeting apply` (writes everything) to `arete meeting extract --stage` (writes nothing).

**Followup 5 (commits `48c87329` plan + `a6467362..50d14fb3` build + `127ef14a` dist + `849cf28a` build-report + merge `8a913a27`)** — Wiki source discoverability. Full phase artifact set (plan + pre-mortem + build-report). User requested this as autonomous overnight build with full review/pre-mortem/build/review cycle.

The path (~3 hours wall time):
1. Deep investigation agent surfaced richer picture than expected: THREE meeting-frontmatter writers diverged (meeting-apply.ts, agent.ts, meeting.ts:1068 — third one omits topics+counts). Phase 2 chef-rewrite (`8a43078f` 2026-05-04) switched chef to use path 3 → regression visible 5/11+. Plus `fm.projects` has NO code writer (it's manual-edit-only inert metadata).
2. Drafted plan with 7 ACs + AC8 ledger + answers to A/B/C questions.
3. Eng-lead review-1: **REVISE BEFORE BUILD**. 8 concerns, two high. AC4 containment match would over-coerce production parent/child topics (`claim-clear` ⊂ `claim-clear-pause`, `claim-narrative` ⊂ four sub-topics). AC5 misdiagnosed active-topic filter (premise wrong: no status filter, recency = 90d not 30d).
4. Plan revised: AC4 dropped entirely, AC5 demoted to build-time diagnostic, AC8 ledger restated honestly (small-positive with substitution argument), AC6 extended to surface CONCRETE alias candidates with source counts, MC2 precedent citations fixed, R10 added to pre-mortem (path-3 unification newly invokes `aliasAndMerge` → first-run mass-coerce risk → mandatory shadow pass).
5. Eng-lead review-2: **APPROVE WITH MINOR CONCERNS**. All 8 original concerns addressed substantively. Two new low-severity edge cases (AC3 `status` rule, `news` over-stem) flagged for in-flight resolution.
6. Sub-worktree manually created at `.claude/worktrees/phase-3-5-followup-5-wiki-discoverability` (Phase 3 lesson honored — no `isolation: "worktree"`). `npm install`. Pre-flight check passed.
7. Build sub-orch shipped all 4 ACs + AC5 diagnostic in 5 per-task commits + dist + build-report. ~18 min build time.
8. Eng-lead review of build: **APPROVE WITH MINOR CONCERNS** (4 low/low-med, all observation-class). Ready to merge.
9. Merged into parent worktree branch.

**A/B/C decisions captured in plan**:
- **A. Map meetings to projects?** No this phase. `fm.projects` is inert metadata (zero consumers). Drop manual examples from skill prose; keep model field for possible future consumer. Don't add a writer.
- **B. Project README → related topics?** No. Agent infers project↔topic linkage at use time via `get_meeting_context` reading project READMEs + topic search. Explicit cross-refs create drift between truth sources.
- **C. Other wiki power-ups**: Shipped chef stale-topic surface (AC6) + singularize tokens (AC3). Deferred containment match (over-coerce risk), project README → topic source class (no demand), `areas:` plural schema migration (consumer-side work).

**AC5 finding (significant)**: `email-templates` ranks #117 of 249 active topics — truncated out of top-25 bias list (`active-topics.ts:46 DEFAULT_LIMIT = 25`). AC1+AC2+AC3 fix the orphan RESCUE path (alias-based backfill). But the PREVENTION story has a third unresolved piece: even the LLM bias step doesn't see canonical slugs that rank low. Parking-lot for next phase: investigate `getActiveTopics` limit + sort to ensure mid-rank canonical slugs reach the bias list.

**Cumulative ledger across Phases 0-4 + 3.5 + followups 1-5**: stretch goal "negative ledger by Phase 4" was met (≈-1 to -5 at Phase 4 ship). Followup 5 added ~+256 code LOC net (~+135 from the new `meeting-frontmatter.ts` helper module, ~+120 from AC2/AC3/AC6 additions). Substitution argument explicit per plan AC8: unified writer is load-bearing for path-3 correctness; AC2 filter load-bearing for AC6 UX. Cumulative likely back to small-positive territory but soundly justified.

**Open issues queued for next session/phase**:
1. **AC5 follow-up**: `getActiveTopics` truncation — `email-templates` (and likely 200+ other "tier-3" topics) don't reach the extraction prompt's bias list. Likely fixes: per-area bias quota, OR include stale topics within recency window regardless of rank, OR adaptive top-K based on workspace topic count.
2. **`areas:` plural schema migration**: slack-digest writes `areas: [...]` (plural array); `area-memory.ts:919` reads only `fm.area` singular. Slack-digest area data 100% dropped today. Needs dual-read transition.
3. **Phase 1 main-merge dependency**: Phases 1-5 + 3.5 stack on parent worktree waiting for John's testing. After `arete update`, user's first run could generate large summary/entity backlog AND activate topic alias logic simultaneously.
4. **Orphan topic backfill UX**: post-AC2, user must manually add `aliases: [...]` to topic pages. Chef proposes via AC6, but no `arete topic add-aliases <slug> <a> <b>` CLI verb yet. Cheap follow-up.
5. **Group C follow-on (7 PM artifact audits)** + Phase 5 (meeting extract decomposition) + Phase 6 (schema layer conditional) still not started.

## Decisions log — 2026-05-27 (2-week soak check-in + sidecar unification)

User check-in after ~2 weeks of v2 use. Subjective: **"faster, much faster. Somewhat more accurate."** Real positive signal on Phase 2 chef pattern.

**Data audit (7 logged winddowns 5/11–5/27)**:
- 156 approved item-fate events
- 0 deferral_disagreement events (Phase 3.5 D2 not firing — needs debug; chef may not be scanning prior-day sidecar correctly OR user not pulling back)
- Clean-run median ~21m (vs ≤15m AC10 target; vs 30–45m pre-v2 baseline; better but not hitting)
- 2 long runs today (80m, 2h27m) — user confirmed walked-away time, not chef stall
- Logging gap real: user reports running "quite a few" winddowns; only 7 logged. Cause: daily-plan had no logging stanza (fixed in this session); chef agents sometimes skip the fire-and-forget `arete events log` call under judgment.
- Last week (5/16–5/21): 6-day gap due to user offsite; some unlogged runs during.

**now/ pollution surfaced and unified (commit `f1aacec5`)**:
User flagged: "deferred lists are added all over the place" + "now/ folder is getting polluted." Diagnosed three concurrent conventions:
1. `now/archive/<skill>/<file>` (Phase 3.5 followup — correct)
2. `now/archive/<wrong-skill-name>/<file>` (drift; e.g., `now/archive/winddown/` from weekly-winddown)
3. `./deferred-<date>.md` at workspace root (Phase 2 chef-prose; pre-unification)

Unified to single convention: **all chef artifacts (curated views + sidecars) land at `now/archive/<skill>/<filename>`. Workspace root + `now/` root are user-facing only.**

Changes shipped (this session, on parent worktree):
- 5 SKILL.md sidecar path updates (daily-winddown, weekly-winddown, week-plan, process-meetings, meeting-prep)
- Daily-winddown Step 0.5 scan path also updated
- Daily-plan logging stanza added (closes the "I ran some but they weren't logged" cause)
- 3 existing sidecar files moved in user's arete-reserv workspace (deferred-2026-05-06, deferred-2026-05-27, deferred-week-2026-W21)
- Removed empty `now/archive/winddown/` directory

**Open issues for next session**:
1. **Phase 3.5 D2 not firing** (0 deferral_disagreement events despite sidecars being written + user pulling items back per 5/14 conversation). Likely cause: chef Step 0.5 prose for sidecar scan was looking at `./deferred-*.md` at workspace root, but Phase 3.5 followup moved sidecars to `now/archive/daily-winddown/` (today's unification fix). Should fire correctly from next winddown onward.
2. **AC10 ~21m median vs ≤15m target** — Phase 2 chef pattern improved on baseline but not hitting goal. Worth digging: where's the time going? Gather is fast (~2 min per Phase 2 review); user-review time is the bulk.
3. **Three followup commits accumulated on parent without dedicated plans**: 7ca3ea47 (archive move), 8c507f7d (always-merge agenda), 67e4394f (daily-plan restore), 8c507f7d (always-merge), f1aacec5 (sidecar unification). Could capture as "Phase 3.5 followups" retrospective if helpful.

## Decisions log — 2026-05-15 (Phase 4 disposition error: daily-plan dropped prematurely)

User asked the agent in arete-reserv "Let's plan my day for tomorrow." Agent did it ad-hoc using chat context (from earlier slack-digest + daily-winddown runs) instead of invoking a skill. User asked "is the router gone?" — implying they expected a structured skill response.

**Root cause**: Phase 4 dropped `daily-plan` as confirmed-unused. The drop was based on a misread of user's Phase 4 planning input. User had said:
> "daily can be removed. i have never used that. is that just the daily plan skill as a cli?"

Meta interpreted that as endorsing `daily-plan` skill removal. Actually user was asking about the `daily` CLI verb (`arete daily`), not the `daily-plan` skill. Two different things. Conflation.

Real signal: user DOES use day planning — just via natural-language ad-hoc rather than `/daily-plan` slash command. That's still a real workflow that deserves a chef-pattern envelope.

**Decision pending user**: four options surfaced (restore daily-plan as chef-pattern skill | fold into daily-winddown | extend week-plan with --scope daily | leave ad-hoc). Meta-recommended restore + chef-rewrite.

**User correction 2026-05-15 evening**: clarified usage — user DOES use `/daily-plan` skill regularly. The skill writes daily progress to `week.md`, NOT to its own file. Meta's earlier proposed "Option A persists to `now/archive/daily-plan/<date>.md`" was wrong — the existing skill's write target is `week.md`, which is the user's actual workflow integration.

**Action taken**: pure-restore via `git revert f7b1b90b` at commit `67e4394f`. Skill returns to exact pre-Phase-4 state. No behavior change. Schedule-meeting References section also restored to mention both `daily-plan` and `week-plan`. User runs `arete update` in arete-reserv to pick up.

**Deferred to Group C follow-on**: chef-rewrite of daily-plan (same envelope as week-plan two-engage variant) — keeping `week.md` as the durable write target while adding chef-pattern envelope + Phase 3.5 conventions (`now/archive/daily-plan/<date>.md` for audit trail of the chef's reasoning, complementing not replacing the week.md daily-progress write).

**Phase 4 retro lesson**: disposition decisions based on user input need clearer "is this the skill or the CLI verb?" disambiguation. The disposition table should record the user's exact quote when the verdict cites user input, so future-meta can spot conflations like this one before the drop ships.

**Router status note**: `model-router.ts` / `arete route` CLI held pending decision per hygiene-pass-1. Still in main, unchanged. Natural-language → skill routing was always agent-decided in chat, not router-mediated. Router covers programmatic / automated cases.

## Decisions log — 2026-05-15 (parser-bug observation → Phase 5 input)

User reported during 2026-05-15 winddown: extraction creates **duplicate commitments with mirror direction** for compound-sentence action items. Example: transcript says "John to reach out to compliance, then follow up with Anthony" → extractor emits both `i_owe_them` (person=john-koht) and `they_owe_me` (person=anthony-avina) with identical verbatim text.

User's APPEND file (`scratchpad 2026-04-22`) already flags this heuristic for chef-pattern cleanup. Volume:
- 2026-05-14 winddown: resolved 5 pairs
- 2026-05-15 winddown: 11 pairs flagged

Chef-pattern handling (working as intended): identify pairs by verbatim text match across direction-mirror, resolve the buggy duplicate via `arete commitments resolve <hash> --status resolved --reason "Parser-bug duplicate; tracked via counterpart commitment"`. Spot-check pattern: chef offered to show pairs first OR batch-resolve OR skip; meta recommended show-first for trust calibration.

**Phase 5 input**: when `meeting extract` decomposition happens, the parser bug should be fixed at source. The bug almost certainly lives in the monolithic extraction LLM prompt — compound sentences ("X to A, then B with C") emit duplicate entries with mirrored direction. Decomposing into chat-agent-driven primitives lets the orchestrator reason about subject/object/direction in one judgment pass instead of letting the frozen prompt produce both halves.

Chef-pattern resolution stays useful indefinitely (covers any compound-sentence edge cases that survive Phase 5's prompt fix), but Phase 5 should aim to drop daily volume from ~11 pairs to ~0–1 pairs.

## Decisions log — 2026-05-06 (Phase 3 polish bugs surfaced during user testing)

John ran `arete update` from the worktree to pick up Phase 3. Migration reported "4 skills have upstream changes vs. your fork (no fork base recorded)" + "Migrated 24 pre-Phase-3 skill copies." Subsequent inspection surfaced multiple Phase 3 polish issues; aggregating here for the inevitable Phase 3 polish pass before Phase 4:

**Confirmed bugs in `arete update` migration (Phase 3)**:
1. **`arete update` skips writing `<skill>/SKILL.md` to `.arete/skills/<name>/` when user already has `.agents/skills/<name>/SKILL.md`** AND the user version has not been refreshed in earlier updates. weekly-winddown is the canary: its user-fork dates from April 15 (pre-Phase-2), so yesterday's `arete update` ALSO didn't refresh it (independent old bug); today's update didn't write a managed copy either. Result: resolver has no fallback. Manually fixed by copying from worktree source-of-truth.
2. **Stale `SKILL.legacy.md` files in `.agents/skills/<name>/` not cleaned post-MC5.** Leftover from yesterday's Phase 2 install. Harmless (env-var routing is gone) but cruft.
3. **Migration writes auxiliary files (`templates/`, `LEARNINGS.md`) to `.arete/skills/<name>/` but doesn't remove them from `.agents/skills/<name>/`.** Result: duplicate copies in both tiers. Probably benign (content matches at migration time) but real cruft.
4. **"No fork base recorded" friction.** When user content differs from current upstream (e.g., yesterday's chef-rewrite vs today's chef-rewrite-with-fix-ups), migration leaves user content in `.agents/skills/` but doesn't auto-record a `.fork-base`. Result: `arete skill diff` errors out. UX is "you have a fork — but no base, so we can't actually diff." User has to choose between `arete skill fork --force` or manual recovery.
5. **Empty `.agents/skills/<name>/` directories left behind when user removes SKILL.md.** Cosmetic, but a v2 cleanup oversight.
6. **`arete skill fork <name>` behavior with pre-existing `.agents/skills/<name>/` auxiliary files** — unclear whether it merges, overwrites, or errors. Not tested in Phase 3 build.

**Genuine customization preserved** (not a bug, but worth noting):
- weekly-winddown has 7 lines of REAL user customizations: integrates `now/action-plans/*.md` into Phase 1B gather and adds an "Action Plan Check-In" section in Phase 5/6. These survived ONLY because Phase 1's update bug skipped weekly-winddown. **Need to port to chef-pattern weekly-winddown** in a small focused task — Option A from today's recovery convo.

**Action**: aggregate these as Phase 4 polish prerequisites OR stand up a "Phase 3.5 polish" mini-phase if Phase 4 build can't proceed cleanly without them. Recommendation: address (1)–(3) as a mini-phase before Phase 4; defer (4)–(6) to Phase 4 itself since they're cosmetic.

## Decisions log — 2026-05-05 (Phase 3 shipped to parent worktree)

Phase 3 (Skills directory split) merged into parent worktree branch at `56a9e135`. **Main merge pending John's testing/usage of Phases 0/1/2.** The directory split is mechanical (no agent behavior change), so daily-driver risk is lower than Phase 2; AC11 hard stop doesn't apply.

**Cleanest cycle of v2 so far** — ~41 min total wall time, no fix-up agents needed:
1. Take 1 sub-orch halted at pre-flight (~71 sec; Agent isolation landed on wrong base)
2. Manual worktree creation + `npm install` (~2 min meta)
3. Take 2 sub-orch shipped all 9 steps in ~35 min
4. Eng-lead review APPROVE in ~3 min (no fix-ups required)

**AC3.7 ledger**: +5 at ship; **0 at wrap-up after MC5 sunset** (better than plan's +6 → 0 estimate).

**MC5 LEGACY SUNSET COMPLETE.** As of merge `56a9e135`:
- 5 `<skill>/SKILL.legacy.md` files (~3.2K LOC) deleted
- `ARETE_LEGACY_SKILL_PROSE` env var routing removed from `skill-resolver.ts`: `parseLegacyList`, `resolveSkillFile`, `resolveSkillFileFromEnv`, `resolveSkillFileWithFallback` all gone
- `arete skill resolve` JSON output scrubbed of legacy fields
- 5 SKILL.md `## Rollback` sections updated to cite `git revert` of Phase 2 commits

**Important caveat**: with MC5 sunset shipped, Phase 2 chef-orchestrator skills no longer have the per-skill flag escape hatch. AC11 hard-stop revert path for any of the 5 chef skills is now `git revert <Phase 2 commit>` — heavier than flag flip. If John surfaces a Phase 2 regression during ongoing soak BEFORE the Phase 1+2+3 main merges, we ship Phase 1+2 main merge but DELAY Phase 3 main merge, restoring legacy flag option until the regression is resolved. Diary's "Decisions waiting on John's testing" updated to reflect this.

**Cumulative ledger across Phases 1-3**:
- Phase 1: +8 at ship → +8 at wrap-up (no further sunset)
- Phase 2: +8 at ship → +2 at wrap-up (MC5 sunset shipped in Phase 3)
- Phase 3: +5 at ship → 0 at wrap-up
- **Cumulative at wrap-up**: ~+10 across the five proxies

**Phase 4 audit + demote-to-CLI** is expected to pull cumulative back toward 0 by removing 12-18 skill files (per parent plan's Phase 4 disposition table). Phase 4 will be the first phase that cumulative ledger ≤ 0 across all of v2.

**Lessons forward (additions)**:
- **Agent's `isolation: "worktree"` doesn't reliably land on the v2 parent branch.** Phase 1 and 2 sub-orchs got the right base by happenstance; Phase 3 didn't. Remedy applied: manual worktree creation off the correct base + `npm install` + spawn agent without `isolation` parameter, with explicit cwd-into-worktree instructions and a pre-flight check before any code change. This is now the established pattern for Phase 4+.
- **Pre-flight checks pay off when the base is wrong.** The first Phase 3 sub-orch made zero code changes before halting — the build-report's "Critical first step" verification block (verify branch, verify Phase N artifacts present) caught the issue. Add this block to every future handoff brief.
- **No-fix-up cycles are achievable** when (a) PATTERNS-style scaffolding is in place from prior phases (Phase 2 established the chef pattern; Phase 3 just adds infrastructure around it), (b) the phase plan's Removes list cross-checks, (c) the eng-lead review framing surfaces the load-bearing checks (MC5 sunset here) explicitly. This kept the Phase 3 cycle to two agents instead of three or four.

## Decisions log — 2026-05-05 (Phase 3 spawn + Agent worktree-isolation lesson)

User confirmed Phase 2 is "looking good so far" after first daily-winddown test and authorized Phase 3 build. Phase 3 plan drafted at `bfe75440`.

**First Phase 3 sub-orch spawn failed at pre-flight** — correctly. The Agent tool's `isolation: "worktree"` parameter created a sub-worktree branched off **`main`** (HEAD `bab5a77d`, the slack-digest-topic-wiki release commit) instead of off the v2 parent worktree branch (`worktree-arete-v2-chef-orchestrator` HEAD `bfe75440`).

Phase 1 and Phase 2 sub-orchs both used `isolation: "worktree"` and landed on the right base. Phase 3 didn't. Cause unclear — possibly the Agent tool defaults to repo-default-branch as the base, and Phase 1/2 worked by happenstance. The sub-orch's escalation was excellent: noticed missing Phase 2 source artifacts before any code change, refused to proceed, returned to meta cleanly.

**Recovery applied 2026-05-05**:
1. Auto-cleanup removed the failed sub-worktree (since it made no changes per agent docs).
2. Meta manually created a worktree off the correct base:
   ```
   git worktree add -b worktree-phase-3-skills-split \
     /Users/john/code/arete/.claude/worktrees/phase-3-skills-split \
     worktree-arete-v2-chef-orchestrator
   ```
3. Ran `npm install` in the new worktree (Phase 1 lesson honored).
4. Spawned a fresh agent **without** `isolation: "worktree"` — agent inherits meta's cwd but is instructed to `cd` into the pre-made worktree path as its first action.

**Lesson forward (added to handoff-brief template)**: do NOT rely on `isolation: "worktree"` to land sub-orch on the v2 parent worktree branch. Manually create the sub-worktree, run `npm install`, then spawn a non-isolated agent that operates in that path. Add a pre-flight check to the brief: agent must verify the base (current branch + key Phase-N artifacts present) before any code change, halt and engage meta if base is wrong.

This keeps the per-task commits + per-phase isolation pattern intact while removing the Agent-tool isolation foot-gun.

## Decisions log — 2026-05-05 morning (testing in progress + Phase 4 disposition rule)

**John currently testing all three phases from worktree.** Setup hit a known-now gotcha:

- First attempt failed: `arete --version` errored with `@arete/core does not provide an export named 'writeInboxSummary'`.
- Root cause: `npm install` was never run in the worktree. Without `node_modules/`, `packages/cli`'s `@arete/core` dependency fell back to a stale global linked version. Setup recovery section above (and User testing window below) updated to require `npm install` before `npm link`.
- Fix landed in commit `e7f857e4`. After `npm install` + re-link, `arete --version` and `arete inbox --help` both run cleanly. User confirmed "fixed" 2026-05-05 ~mid-morning.

**Phase 4 disposition rule added** (not actionable now; durable input for Phase 4 sub-orch handoff):

User identified that some shipped skills are pure wrappers (`pull-from-*`, `calendar`, `save-meeting`, `email-search`, `drive-search`, `doc-search`, `people-intelligence`) and shouldn't be skills — they're 1:1 with CLI verbs, or the user-customizable bit is a config file rather than prose. Parent plan's Phase 4 section now has a third disposition (alongside "apply chef pattern" and "drop"): **demote to CLI**.

Rule formalized as: skills earn their existence when (a) they orchestrate multi-step judgment, OR (b) they have user-tunable prose that affects behavior. Anything else is bloat. Pre-identified candidates listed in parent plan's Phase 4 section. Phase 4 audit produces the per-skill verdict.

**`people-intelligence` confirmed never invoked directly** by John (2026-05-05). Strong demote-to-CLI signal. The `context/people-intelligence-policy.json` file stays as user-tunable config alongside the demoted CLI verb.

**Awaiting John's EOD winddown report** as primary user testing signal. AC11 hard stop (>45 min winddown = revert relevant skill) is live. Trust-gap signals (chef defers things he wanted to see / surfaces things he didn't, pre-mortem R3) are the soft revert signal — captured in APPEND-file edits or skill prose tweaks.

## User testing window — starting 2026-05-05 morning

John pausing meta work to test all three phases from the worktree before authorizing main merges. Setup he'll run:

```bash
cd /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator/packages/cli
npm link
cd ~/code/arete-reserv
arete update   # refresh skills + seed .arete/skills-local/ APPEND templates
```

Then he'll run his actual EOD winddown using the chef-orchestrator pattern.

**What to watch for in his report-back**:
- Phase 0 instrumentation populating (winddown timing log, item-fate jsonl, cost aggregator)
- Phase 1 wiki: meeting summary quality, entity pages auto-generated for orgs, slack heuristic logging-only entries
- Phase 2 chef behavior: single engagement, reason labels, `## Uncertain` tier, inline action proposals, sidecar for deferred
- AC11 hard stop trigger: any winddown >45 min on any single day = revert relevant skill via `ARETE_LEGACY_SKILL_PROSE`
- Trust-gap signals: chef defers things he wanted to see / surfaces things he didn't (pre-mortem R3) — retune APPEND file or chef prose

**Decisions waiting on John's testing**:
- Phase 1 main-merge authorization
- Phase 2 main-merge authorization
- Whether to continue building Phase 3 (skills directory split) onto parent worktree now or pause until shipped phases are validated

**If the next meta is in a fresh context**: read this section + the most recent decisions log entry + Phase 2's `review.md` for the four follow-on concerns, especially the `deferral_disagreement` event wiring that defers to "first soak pull-back" (i.e., when John pulls a deferred item back from `./deferred-<date>.md`, that should trigger appending a `deferral_disagreement` event to `item-fates.jsonl` — wire it then).

**If `npm link` or `arete update` errors at setup**: most likely cause is missing `node_modules/` in the worktree (workspace symlinks not set up). Confirmed gotcha 2026-05-05 morning — first user testing attempt failed with `@arete/core does not provide an export named 'writeInboxSummary'` because `npm install` was never run in the worktree, so `packages/cli`'s `@arete/core` dependency fell back to a stale global linked version. **Always run `npm install` at worktree root BEFORE `npm link`.**

Correct setup order:
1. `cd /Users/john/code/arete/.claude/worktrees/arete-v2-chef-orchestrator` (worktree root)
2. `npm install` (sets up workspace symlinks; creates `node_modules/@arete/core -> ../packages/core`)
3. `cd packages/cli && npm link`
4. `cd ~/code/arete-reserv && arete update`

If still erroring after that, dist may be stale: `npm run build` from worktree root, then re-run `npm link`. The Phase 2 sub-orch's dist commit `e045814f` should be current.

## Decisions log — 2026-05-04 (Phase 2 shipped to parent worktree)

Phase 2 (Chef-orchestrator behavior rewrite) merged into parent worktree branch at `650d325c`. **Main merge pending John's testing/usage of Phase 0 + Phase 1.** This is the highest-stakes phase by a wide margin; the per-skill `ARETE_LEGACY_SKILL_PROSE` flag and 14-day soak with AC11 hard stop are the live safety nets.

**Pipeline (~43 min wall time across 3 agents)**:
1. Phase 2 sub-orch built all 9 mandatory steps autonomously in ~37 min: PATTERNS.md (chef patterns + verb taxonomy with executable / draft-only modes; Jira draft-only) → APPEND-file convention seeding → skill-resolver routing → daily-winddown rewrite + SKILL.legacy.md → **Step-5 A/B PASS at 8/10 (2 self-applied prose refinements)** → other 4 skills → frontmatter.approved_items removal → tests (per-file tsx --test, no `npm test`) → dist rebuild.
2. Eng-lead reviewer (~4 min): APPROVE WITH MINOR CONCERNS; all four meta framing calls accepted (substitution argument, A/B PASS, two-engage variant, verb taxonomy completeness). Verified ledger truth independently via concrete file/dir counts. Spot-checked legacy files for verbatim integrity.
3. Prose fix-up agent (~2 min): three minor concerns landed (process-meetings stale Phase-1h refs, daily-winddown wave behavior, week-plan sidecar threshold alignment); fourth (deferral_disagreement event wiring) deferred to first real soak pull-back per plan.

**AC2.11 ledger**: +8 at ship; +2 at wrap-up after MC5 legacy sunset (Phase 3 ship). Substitution argument accepted: `skills-local` + `skill-resolver` are load-bearing for the chef-orchestrator pattern with safe rollback (AC11 hard stop machinery). They REPLACE the old "skills are immutable shipped" pattern.

**Lessons forward (additions)**:
- Validation-skill pattern (daily-winddown first, then propagate) earned its keep. Step-5 A/B caught two prose tightening opportunities before they spread to the other 4 skills. Subsequent phases with multi-target rewrites should keep this shape.
- Prose-ambiguity catching at /review was effective. Phase 1's lesson was "cross-check plan-Removes against actual deletion"; Phase 2's reviewer did this and verified all plan-Removes (legacy step-by-step gates, frontmatter.approved_items) actually shipped.
- Per-file targeted tests (`tsx --test` + `vitest run`) with bounded timeouts is now the established pattern. Two consecutive phases shipped without watchdog stalls. Sub-orch handoff briefs codify the ban on root `npm test`.
- Eng-lead reviewer caught one potential regression-class issue (skill prose ambiguities like "Max 4 in parallel" without wave specification) that the soak's AC11 hard stop would NOT catch — soak only catches behavioral degradation; prose ambiguity is a review-time concern. Continue spawning the eng-lead reviewer for every phase.

**Status of v2 phases**:
- Phase 0: shipped to main; soaking
- Phase 1: shipped to parent; main-merge pending John's testing
- Phase 2: shipped to parent; main-merge pending John's testing
- Phase 3: shipped to parent; main-merge pending John's testing
- Phase 3.5: shipped to parent; main-merge pending John's testing
- **Phase 4: shipped to parent (discipline-math milestone — cumulative ledger ≤0 verified); main-merge pending John's testing**
- Group C follow-on (7 PM artifact audits deferred from Phase 4): not started
- Phase 5 (meeting extract decomposition), Phase 6 (schema layer conditional): not started.

**Question for next meta session**: with Phases 1 and 2 stacked on parent waiting for user testing/usage, do we continue building Phase 3 onto parent worktree, or pause until John has used what's already shipped?

## Decisions log — 2026-05-04 (Phase 1 shipped to parent worktree)

Phase 1 (Wiki expansion) merged into parent worktree branch at commit `eb50dccf`. **Not yet merged to main** — waiting for John's testing/usage of Phase 0 per the user's earlier execution rule. Phase 2 build can proceed in parallel.

**Path that proved (and where the new pattern broke)**:
1. Meta drafted Phase 1 plan with detailed scope, ACs, MC1/MC3 explicit, sub-orch handoff brief.
2. Phase 1 sub-orch (a7aa23e400eeeac6c) shipped 6 phase-1 commits across Steps 1–6 in ~18 min, then **died on `npm test` watchdog stall after ~30 min** of attempted test-running. Watchdog timeout: "no progress for 600s." Total ~50 min.
3. Recovery agent (a0410502757a88aa0) picked up in same sub-worktree, ran tests **per-file via `tsx --test`** (not `npm test`), committed dist, wrote build-report. ~9 min.
4. Recovery surfaced honest AC1.10 ledger at +9 (over budget) AND flagged that the original sub-orch missed a plan-listed Remove (`## Could include` body-block).
5. Fix-up agent (abd2c0d0f72befeed) deleted the body-block at named call-sites, migrated tests, rebuilt dist, updated build-report. ~10 min. Ledger dropped to +8.
6. Eng-lead reviewer (aeae27ccbff4b69bf) ran with explicit framing of meta's three calls (substitution argument, skill-prompt deferral, pre-existing test failures). All three ACCEPTED. ~4 min.
7. Meta merged sub-branch into parent worktree branch.

**Total wall time spawn-to-parent-merge**: ~73 min across 4 agents.

**Lessons forward (additions to diary's "Lessons forward" section from Phase 0)**:

- **`npm test` at repo root is a watchdog killer.** Phase 0 lucked out by not running it; Phase 1 sub-orch hit the wall. Going forward, every sub-orch handoff brief explicitly bans full `npm test` and requires per-file `tsx --test` / `vitest run` invocations.
- **The "open question" escape valve from Phase 0 evolved into a "ledger truth" escape valve in Phase 1.** Recovery agent surfaced the +9 ledger honestly per plan instruction. Meta then made a substantive call (pull more removes via fix-up agent) rather than rubber-stamping. The pattern works: sub-orch surfaces, meta decides, reviewer evaluates the meta decision.
- **Original sub-orch missed a plan-listed Remove despite plan being explicit.** This is the kind of drift the discipline rule exists to catch. The fix-up cycle worked, but a future improvement: when sub-orch writes the build-report, explicitly cross-check each Remove in the phase plan against actual deletion.
- **Watchdog stalls don't lose work** because per-task commits land before stalls happen. The 6 commits stayed; recovery picked up cleanly. This validates the "per-task commits during build, no squash" rule from the parent plan.
- **"Skip the failing run, recover from where it stopped" is cheaper than restarting.** Recovery agent ran in ~9 min vs. an entire fresh sub-orch which would have repeated all 6 commits.

## Decisions log — 2026-05-01 (Phase 0 shipped)

Phase 0 (Instrument + baseline) merged into local main at commit `131863fe`. Parent worktree fast-forwarded to match.

**Pipeline that proved itself**:
1. Meta drafts phase plan with detailed handoff brief and ACs.
2. Sub-orchestrator (isolated worktree) builds D1–D4 with per-deliverable commits (~9 commits + dist + build-report).
3. Eng-lead reviewer (independent agent) reads diff + build-report + parent plan; verdict APPROVE WITH MINOR CONCERNS.
4. Fix-up agent addresses concerns directly in sub-worktree (5 more commits).
5. Mini-reviewer confirms fix-ups landed as specified; verdict APPROVE.
6. Meta merges sub-branch → parent worktree branch.
7. Meta merges parent → local main with `git -C main-repo merge --no-ff`.
8. NOT pushed to origin (user discipline; user pushes manually).

**Wall time**: ~50 min build + ~5 min first review + ~6 min fix-ups + ~1 min mini-review + ~2 min merge logistics = ~64 min from spawn to ship.

**Validated patterns**:
- Sub-worktree isolation via `Agent` + `isolation: "worktree"` works cleanly off the parent worktree's HEAD.
- Per-task commits with `phase-N(<area>): <change>` convention preserves the discipline-rule audit trail.
- The "fix-soon vs fix-now" review framework worked — meta upgraded the backend wire-up to fix-now because the sub-orch was warm; ~30 min of extra work for measurement integrity from day 1.
- Independent reviewer agents (NOT the building agent) catch real issues. The first review's open-question evaluation correctly flagged the backend gap as worth fixing.
- `SendMessage` is NOT available in this harness; for fix-ups, spawn a fresh agent with explicit cwd into the sub-worktree path. Don't rely on agent-to-agent comms.

**Lessons forward**:
- Phase 1+ should follow the same pattern.
- The "open question" mechanism (sub-orch flags mid-build issues for meta evaluation) is a useful escape valve; should be in every handoff brief.
- For very small fix-ups, a fresh general-purpose agent with cwd into the existing sub-worktree works fine — no need to keep the original sub-orch alive.

## Decisions log — 2026-05-01 (execution authorization)

User reviewed parent plan + both reviews + integrated MC1–MC5 into Phase 1/2 sections. Authorized autonomous meta-orchestration with the following execution ground rules:

1. **Build authority**: meta-orchestrator (this thread) drives. Sub-orchestrators per phase. User engages at /review and final ship.
2. **Eng-lead review at every phase**: independent reviewer subagent runs at each phase's /review stage. Same pattern that caught issues in the parent plan.
3. **Worktree management**: per-phase sub-worktree off parent branch (`worktree-arete-v2-chef-orchestrator`). Sub-worktree merges into parent on /ship; parent merges into main per-phase.
4. **Commit cadence**: per-task commits during build (preserves bisect / review trail; the discipline-rule audit "what was actually deleted in Phase X?" needs readable history). No squash at merge.
5. **Per-phase merge to main**: each phase ships to main individually. User tests/uses each shipped phase before next phase starts. Reduces integration risk; lets soak findings reshape later phases.
6. **Soak workspace**: deferred until Phase 2 (chef rewrite) and Phase 5 (`meeting extract` decomposition) — Phase 0 and Phase 1 don't need it (instrumentation + summaries are additive). Phase 2 plan must include shadow-workspace setup as part of build.
7. **Critical-stop rule**: meta only stops to engage user if (a) a phase plan needs a decision the parent plan doesn't cover, or (b) reviewer surfaces something that contradicts a parent-plan decision, or (c) the daily-driver hard stop (AC11) triggers.

**Status**: Phase 0 about to spawn. Sub-orchestrator pattern proves itself or breaks here.

## Decisions log — 2026-05-01 morning, second pass (post-second-review)

Second-pass reviewer ran on the twice-revised plan + diary + pre-mortem + first review. **Verdict: APPROVE WITH MINOR CONCERNS.**

Key findings:
- All three required revisions from the first review are addressed substantively, not cosmetically.
- AC tightening is real (not reworded).
- Skeptical-view sections are non-strawman.
- New structure (Phase 0 → 1 wiki → 2 chef → 3 split → 4 audit → 5 extract decomp → 6 conditional schema) is cleaner than what the first review demanded.

Five minor concerns surfaced — threaded into the parent plan as **"Phase plan requirements"** so they're not lost when each phase plan is drafted:
- MC1: Phase 1 (a)–(c) as gates, (d)/(e) as stretch with defer-not-cut criteria.
- MC2: Phase 2 must enumerate per-skill `SKILL.legacy.md` + `ARETE_LEGACY_SKILL_PROSE` flag as ship gates.
- MC3: Phase 1 must include 7-day shadow-run validation for the slack heuristic before writers go live.
- MC4: Phase 2 must ship `PATTERNS.md` first, before any skill rewrite.
- MC5: Phase 2 plan must address legacy-preservation interaction with Phase 3 directory split.

**Build authorization recommended**: Phase 0 can proceed once user approves direction. Phase 1 and Phase 2 plans must address MC1–MC5 before their sub-orchestrators spawn.

**Status**: parent plan locked at v2 (twice-revised, twice-reviewed). Ready for user to approve Phase 0 spawn in the morning.

## Decisions log — 2026-05-01 morning (post-user-feedback on revised plan)

User reviewed the revised parent plan + reviewer findings + diary. Pushed back on the reviewer's "skills split = 70% of user-felt pain" framing. User's articulation:

- The skill IS the visible surface, but the structural pain comes from the agent running many tools step-by-step with no shared brain. Forking templates alone doesn't fix this.
- The chef-orchestrator pattern is primarily a **skill-prose rewrite**: the agent does all work upfront, applies judgment, presents one curated view, and offers MCP-backed actions.
- User's "dream" articulated: daily winddown + weekly plan flows where the agent gets to 90% before engaging the user, with reasoning labels and conservative action proposals.

**Decisions:**

1. **Phase 2 reshaped to "Chef-orchestrator behavior rewrite"** — five skills (winddown, weekly-winddown, week-plan, process-meetings, meeting-prep) rewritten with four reusable patterns documented in PATTERNS.md. Substrate touches limited to importance gating (frontmatter read), four-tier surface, and `frontmatter.approved_items` removal. No new substrate.

2. **Skills split moved to Phase 3** — once chef behavior is right, preserve customizations across upstream updates.

3. **Phase 4 added: Skills audit + chef-pattern propagation** — sweep remaining shipped skills, apply chef pattern where it fits, drop unused.

4. **Action-offering: conservative.** Agent always proposes, never auto-executes — even for "simple" actions. User-felt friction acceptable; trust must earn.

5. **Phase 1 reshaped to "Wiki expansion"** with the absorption principle:

   > A source gets a summary when it represents a primary unit of knowledge ingested. Subsidiary inputs (Notion notes pulled as meeting context, agendas) are absorbed by the parent's summary, not summarized separately.

   Sub-deliverables: per-primary-ingest summary writers (meetings always; inbox docs always; slack threads conditional via heuristic — `messages ≥ 10` OR decision detected OR `participants ≥ 3` OR user-flagged); entity pages for orgs; topic-page integration reads summaries; wikilinks across all wiki types; wiki health/lint. (d)+(e) are stretch.

6. **Phase numbering refreshed** — Phase 0 instrument → 1 wiki expansion → 2 chef rewrite → 3 split → 4 audit → 5 extract decomposition → 6 schema layer (conditional). Original Phase 5 (judgment substrate) remains deferred to follow-up plan.

7. **Cadence**: ~3.5–4 months end-to-end (slightly longer than original ~3 months) because Phase 1 grew to wiki-expansion-complete and Phase 2 is a substantive rewrite. User-felt dream lands at end of Phase 2 (~Month 2).

8. **Second-pass review queued** to verify the revisions actually addressed the first review's REVISE BEFORE BUILD verdict and flag anything new the revisions introduced.

## Decisions log — 2026-05-01 evening (post-first-review revisions)

Independent reviewer subagent ran on parent plan + diary + pre-mortem. Verdict: **REVISE BEFORE BUILD**. Full review at `review.md`. Key findings actioned:

1. **Phase 0 added** as first phase: instrument + 14-day baseline. AC10 (median winddown ≤15 min) is unfalsifiable without baseline; Phase 0 establishes it. Pure measurement, no architecture.
2. **Phase 4 (skills split) pulled to Phase 2.** Reviewer's strongest non-trivial argument: skills bloat is at least 70% of user-felt pain, and skills-as-templates makes daily winddown user-tunable without deeper architecture. Decoupling user pain reduction from invasive Phase 3 work.
3. **Original Phase 3 split into 3a + 3b.** 3a = chef pipeline shape (importance gating, four-tier surface, frontmatter-direct reads — no schema layer). 3b = `meeting extract` decomposition (largest blast radius, ships only after 3a soaks 2+ weeks).
4. **Phase 5 deferred to follow-up plan.** Original Phase 5 shipped as "pure additions" — the precise failure mode the discipline rule names. Some functionality may move into Phase 4 if 3a/3b retros surface consumer needs.
5. **Phase 4 (schema layer) made conditional.** Ships only if Phase 3a/3b retros surface consumer needs markdown reads can't fill. Otherwise dropped per substrate sunset rule.
6. **ACs tightened**:
   - AC1 reframed: "observably importance-ordered winddown view" (not gameable grep).
   - AC3 requires both typical-day AND heavy-day cost measurements.
   - AC4 gains quality floor (reason labels + non-empty pruning section, not just length cap).
   - AC8 gains concrete proxies: CLI verbs, shipped skills, frontmatter fields, memory file types, services. Net delta combined ≤0 through Phase 3b.
   - AC9 enforced via mandatory "skeptical view" section in every phase plan.
   - AC10 promoted to gating: if AC10 fails, v2 has failed regardless of others.
   - AC11 added: >45 min winddown on any single soak day = phase reverted, not iterated. Hard stop.
7. **Three new principles**: substrate sunset rule (#7), baseline before architecture (#8), skeptical-counterweight (#9).
8. **Five new risks** added to pre-mortem: R14 daily-driver disruption, R15 builder/user role conflict, R16 sub-orchestrator cost, R17 MCP availability shifts, R18 cold-start (mitigated by deferring Phase 5), R19 hygiene re-introduction.
9. **Per-phase rollback plan** required in each phase plan template. Phase 3b gets `ARETE_LEGACY_EXTRACT=1` feature flag for emergency revert.
10. **Hygiene reconciliation done**: confirmed `brief --for`, `search --answer`, `daily`, `meeting-parser.ts` are NOT removed by hygiene-pass-1; Phase 3b owns these. `ContextService.getContextForSkill` IS gone; Phase 3b's three-bundle collapse handles the remainder.

**Sub-orchestrator spawn deferred until John reviews.** No build started; revising plan was the right "critical" response to the review verdict.

## Notes for the next context window (morning)

**State of play**:
- Hygiene-pass-1 merged into local main (not yet pushed to origin). Worktree rebased onto post-hygiene main.
- Parent plan revised in response to independent review. New artifact: `review.md`.
- Phase 0 (instrument + baseline) is the new first phase. Plan skeleton not yet written.
- No sub-orchestrator spawned overnight. The review's REVISE BEFORE BUILD verdict made spawning premature.

**Morning checklist for John**:
1. Read `review-2.md` first — second-pass verdict is APPROVE WITH MINOR CONCERNS.
2. Skim `plan.md` to confirm the post-absorption-principle reshape lands well.
3. Optional: read `review.md` (first review's findings) and the diary's "Decisions log" entries for full provenance.
4. Authorize Phase 0 build: meta-orchestrator drafts `phase-0-instrument-baseline/plan.md` (addressing applicable phase-plan requirements) and spawns Phase 0 sub-orchestrator.
5. Or push back / iterate — if anything in the latest reshape doesn't sit right, tell meta to revise before Phase 0 starts.

**Morning checklist for next meta-orchestrator (if not John reading)**:
1. Read this diary top-to-bottom.
2. Read `review.md` and the revised `plan.md` + `pre-mortem.md`.
3. Do not spawn sub-orchestrators. Wait for user direction.
4. If user authorizes Phase 0 build: draft `phase-0-instrument-baseline/plan.md`, spawn Phase 0 sub-orchestrator with handoff brief.

**Things NOT done that morning user may want**:
- Commit the planning artifacts (held off intentionally so user can edit pre-commit).
- Phase 0 plan skeleton (held off pending user approval of the revised parent plan).
- Hygiene-pass-1 push to origin/main (user owns; not in v2 scope).
