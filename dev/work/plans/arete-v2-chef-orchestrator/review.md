---
title: "Areté v2 chef-orchestrator — independent review of parent plan"
slug: arete-v2-chef-orchestrator-review
status: complete
verdict: REVISE BEFORE BUILD
created: "2026-05-01"
reviewer: independent subagent (general-purpose)
artifacts_reviewed:
  - plan.md
  - diary.md
  - pre-mortem.md
---

# Independent review — Areté v2 chef-orchestrator parent plan

Independent reviewer was given parent plan + diary + pre-mortem and asked to assess thesis, phase ordering, ACs, missing risks, discipline durability, what to cut, what to add. Reviewer was told the user's hygiene-pass-1 had merged and that the user is the builder + primary daily user.

## Verdict

**REVISE BEFORE BUILD.**

Three concrete revisions required:
1. **Tighten Phase 3.** Split into 3a (chef pipeline shape) and 3b (`meeting extract` decomposition + parser deletion). Ship 3a first; 3b only after 2-week soak.
2. **Add Phase 0 (instrument + baseline) so AC10 is measurable.** Without this, the win condition is unfalsifiable.
3. **Either cut Phase 5 or pull its scope into Phase 2.** Don't carry "pure additions" through the discipline frame; it's the precise failure mode the diary names.

Plus: reconcile Phase 3 "Removes" list against hygiene-pass-1's actual deletions. As written, Phase 3 may double-count hygiene wins.

#1 and #2 must be addressed before approving build. #3 is strong recommendation but defensible disagreement.

## Critical findings (verbatim from reviewer)

### Thesis is mostly sound but over-fit

The grep importance|priority finding (zero hits) is falsifiable and real; "N×M Sonnet importance-blind" is a real waste pattern. But the plan over-fits one interpretation:

- An equally valid read of "30–45 min winddown + bloated week.md + builder doesn't understand his own system" is **prompt and skill bloat**, not architecture bloat. The winddown is a *skill*, not a CLI primitive. Phase 4 (skills split) might do 70% of the user-felt work alone.
- The "10 cooks" might not need a schema layer to solve. Gating topic integration on `frontmatter.importance` is a 20-line change in one file. Phase 2's substrate is the classic "we need the substrate to do the thing" trap — and the antagonist of this plan is exactly that move.

### Phase ordering questionable

- Phase 1 before Phase 2: correct.
- **Phase 2 before Phase 3: questionable.** Phase 3's importance-gating doesn't depend on Phase 2 schema layer — `frontmatter.importance` is already on the meeting file. Phase 2 is justified by Phase 5, not Phase 3.
- **Phase 3 too big.** Bundles `meeting extract` decomposition + four-tier surface + three-bundle collapse + four CLI primitive additions + two LLM-branch removals + one CLI command removal + two backend endpoint removals + `meeting-parser.ts` deletion + process-meetings skill changes. That's at least three phases.
- **Phase 4 should be earlier.** If skills-as-templates is what makes the daily winddown user-tunable, sequence it second.
- **Phase 5 "Removes: N/A — pure additions"** violates the discipline rule and should fail to ship by the plan's own standard.

### Gameable / vague ACs

- **AC1** (`grep importance|priority` returns non-zero hits): trivially gameable. One `if (item.importance !== 'skip')` in any file passes. Should be: "the daily winddown view is observably importance-ordered."
- **AC3** (≥60% cost drop): gameable on a low-meeting day; AC must enforce heavy-day measurement.
- **AC4** (≤25 lines): hard cap with no quality floor; trim by truncation passes.
- **AC8** ("balanced or net-negative on cognitive surface area"): aspirational. No operational definition. The most load-bearing AC has no measurement procedure.
- **AC9** ("John can articulate what this deletes"): self-policing — John reviewer of John's enthusiasm. v1 history suggests John lets himself off the hook.
- **AC10** (median winddown ≤15 min): the only AC that measures the thesis. **Should be promoted to gating.** If this fails, v2 failed regardless of AC1–AC9.

### Missing risks

Pre-mortem is solid on architectural risk but light on lived-experience risks:

- **Daily-driver disruption.** No risk for "phase soak day 3, John has a 6-meeting day, pipeline breaks at 9pm." No rollback plan per phase.
- **Builder/user role conflict.** John is reviewer at /review AND the only soak tester AND the meta-orchestrator. Soak feedback contaminated by sunk-cost. Suggest hard-stop: "if winddown >45 min any day during soak, phase is reverted, not iterated."
- **Sub-orchestrator cost.** 5 phases × /ship cycles × sub-orchestrator runs is significant Claude usage. Sustainable for whom?
- **MCP availability shifts.** Plan locks in classifications ("Notion stays Core because no MCP") that could change in 3 months.
- **Hygiene-pass-2 re-introduction.** Phase 3 "Removes" overlaps with hygiene-pass-1's deletions. Phase 3 may double-count hygiene wins.
- **Schema layer cold-start.** Phase 5 has 30-day cold-start. Days 1–30 of v2 = "same as today plus extra substrate" = 30-day regression window.

### Discipline not enforceable as written

AC8 and AC9 are aspirational, not enforceable.

- AC8 needs concrete proxies: count of CLI verbs, count of skills, count of frontmatter fields, count of memory file types. Each phase reports the delta.
- AC9 needs a counterweight: every phase plan must include an "if-I-were-skeptical" section listing the strongest case for *not* shipping that phase. Meta-orchestrator reads it back at /review.

### What to cut

**Phase 5 — judgment substrate.** Reasons:
1. Self-admitted "pure additions" — fails the discipline rule.
2. Cold-start ~Month 4 means user-felt benefit (AC10) lands too late.
3. Dismissal-as-signal feedback loop is sophisticated but unproven; today's bottleneck is more likely "no importance gating at all," not "static prompts."
4. Phase 2 schema layer alone gives 80% of the substrate Phase 5 wants; active learning ships as a separate plan after a year of real events data.

**Runner-up: Phase 2 itself.** If Phase 3's gating reads existing markdown frontmatter, Phase 2 is substrate looking for a problem. The strongest argument for Phase 2 is "architectural keystone" — the kind of architectural-narrative justification John says he distrusts.

### What to add

- **Phase 0: instrument + baseline.** 2 weeks of telemetry (winddown timing, cost, item fate logs) BEFORE any architecture move. AC10 baseline is a precondition for declaring AC10 met.
- **Weekly user-view review** during rollout: John writes one paragraph per week ("clearer / still confusing").
- **Explicit hygiene reconciliation.** Phase 3 "Removes" must be audited against hygiene-pass-1.
- **"No new substrate without sunset date" rule.** Each substrate gets explicit "fail to ship" criterion: if X consumers haven't migrated within Y phases, substrate is reverted.

### What's good (reviewer's words)

- The diary is unusually disciplined for a planning document. Decisions log + research synthesis + parking lot is the right shape.
- The MCP-vs-Core classification reasoning ("multi-provider abstraction earns Core; single-provider doesn't") is principled.
- The "soak before ship" rule is essential and explicit.
- AC9 (the deletion gate) is the right idea even if enforcement is soft.
- Acknowledging that the user's own enthusiasm is the antagonist ("we'll clean up later" as the failure mode) is rare self-awareness in a v2 plan.

## Meta-orchestrator response (action plan)

This file records the reviewer's findings verbatim. The diary records meta-orchestrator's response and the parent plan revisions made in light of the review.

Specific actions taken in response (see diary "Decisions log" 2026-05-01 evening for full rationale):

1. **Phase 0 added** as instrument + baseline. New first phase. Other phases renumbered.
2. **Phase 4 (skills split) pulled earlier** — becomes Phase 2 in the new ordering.
3. **Phase 3 split into 3a + 3b** (chef pipeline shape vs. `meeting extract` decomposition).
4. **Phase 5 deferred to a follow-up plan**; Phase 2 schema layer scope reduced to what Phase 3a actually needs.
5. **ACs tightened**: AC1 reframed (observable importance ordering, not grep), AC3 requires heavy-day measurement, AC4 gains a quality floor, AC8 gains concrete proxies, AC10 promoted to gating.
6. **"If-I-were-skeptical" section required in every phase plan.** Meta-orchestrator reads it at /review.
7. **Per-phase rollback plan** added to plan template.
8. **Hygiene reconciliation pass** added to "Dependencies" section before Phase 0 ships.
9. **Substrate sunset rule** added to discipline rules.

Phase 0 plan drafting started 2026-05-01 evening. Sub-orchestrator spawn for any phase deferred until John reviews the revised parent plan.