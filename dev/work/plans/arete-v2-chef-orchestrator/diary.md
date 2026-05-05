---
title: "Areté v2 chef-orchestrator — meta-orchestrator diary"
slug: arete-v2-chef-orchestrator-diary
created: "2026-05-01"
owner: meta-orchestrator (Claude)
purpose: durable thread across context resets; decision log; sub-orchestrator status; review notes
---

# Areté v2 chef-orchestrator — diary

This file is the durable thread for the meta-orchestrator running this parent plan. Read top-to-bottom on every fresh context. Append-only by convention; correct in-place only when a recorded fact turns out to be wrong (and note the correction).

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

## Open questions / parking lot

- **Topic integration**: keep narrative-rewrite shape but gate on importance, or scrap entirely? N×M Sonnet cost is the most concentrated bloat. **Lean: gate on importance + confidence as cheapest-first lever; revisit scrap-entirely after seeing how it feels.**
- **Dismissal-as-signal feedback loop**: worth building, or is review friction acceptable? **Lean: build it as part of judgment substrate (Phase 5).**
- **`week.md` as a working file**: hand-readable markdown, or derived view from state.json? **Lean: derived view, but markdown remains source-of-truth for user edits; refresh harmlessly regenerates non-user sections.**
- **`route` command**: keep or remove? **Defer.**
- **Skills directory shape**: `.arete/skills` (managed) + `.agents/skills` (user) per John's preference. Naming friction with adapter renderer for Cursor/Codex AGENTS.md flow. Resolve in Phase 4.

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
- Phase 0: shipped to main; soaking (depends on John running daily-winddown)
- Phase 1: shipped to parent; main-merge pending Phase 0 testing
- Phase 2: shipped to parent; main-merge pending Phase 0 + Phase 1 testing
- Phase 3 (skills directory split), Phase 4 (skills audit), Phase 5 (meeting extract decomposition), Phase 6 (schema layer conditional): not started.

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
