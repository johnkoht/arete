---
title: "Areté v2 chef-orchestrator — pre-mortem (parent)"
slug: arete-v2-chef-orchestrator-premortem
status: draft
created: "2026-05-01"
updated: "2026-05-01"
---

# Pre-mortem: Areté v2 chef-orchestrator

This is the parent-level pre-mortem. Phase plans have their own pre-mortems for implementation-specific risks. This catalog is for cross-cutting failure modes — the kind that survive any single phase and bite us at the architectural level.

Format per risk: **R#: short name** — what fails, leading indicator, mitigation, residual risk.

## Critical (would invalidate the v2 thesis)

### R1: And-also creep

**What fails**: Phases ship the new substrate but don't actually delete the old. Six months in, we have BOTH the schema layer AND the ad-hoc parsing it was supposed to replace. The user-view simplicity test (AC9) fails because nothing is simpler — there's just more.

**Leading indicators**:
- A phase ships without removing anything ("we'll clean this up next phase").
- The phase plan's "removes" column is shorter than the "adds" column.
- A phase's review can't articulate the deletion path to meta-orchestrator's satisfaction.
- John says "I still don't know how this works" after a phase soak.

**Mitigation**:
- AC8 and AC9 are gates, not aspirations. Meta-orchestrator at `/review` rejects merge if either fails.
- Every phase plan must include an explicit "removes" section listing files/commands/behaviors deleted.
- Diary tracks adds vs removes per phase. If imbalance accumulates, halt before next phase.

**Residual**: Even with the gates, there's a soft drift where "remove" gets defined down (e.g., "we removed two unused flags" while adding ten new substrates). Counter: meta-orchestrator periodically asks "if I were John, looking at this for the first time, would I find it simpler?" The answer must be yes.

### R2: Schema layer becomes a third copy

**What fails**: events.jsonl and state.json ship in Phase 2 but don't replace ad-hoc parsing. Markdown stays source of truth (correctly), but every consumer keeps re-parsing markdown anyway because the schema layer doesn't have the right shape or isn't trusted yet. Now there are three copies and the agent reads markdown like before.

**Leading indicators**:
- Phase 2 plan can't name the specific code paths that get deleted in exchange for state.json reads.
- After Phase 2 ships, `task-scoring.ts:271` (week-priority prose-parse) still exists.
- After Phase 2 ships, area-memory.ts hasn't been touched.

**Mitigation**:
- Phase 2 plan must include a deletion checklist: every consumer that today re-parses markdown for state-of-the-world questions migrates to `arete state` or in-process state.json read in the same phase.
- Phase 2 build includes a "before / after" `grep` count: lines of ad-hoc parsing removed vs lines of state.json producer added. Net must be negative.

**Residual**: state.json may not have the right shape on first cut; iteration needed. Mitigated by treating it as an internal contract (semver inside `.arete/`) and being willing to break-and-bump rather than carry shape errors forward.

### R3: Trust-gap miscalibration in chef curation

**What fails**: Phase 3 ships the four-tier surface; the chef defers items John actually wanted to see. He stops trusting the deferred sidecar, starts treating "stage" as the only safe tier, and asks the chef to surface everything — degenerating back to today's flat firehose.

**Leading indicators**:
- John pulls items back from `deferred.md` more than ~10–15% of the time during Phase 3 soak.
- John starts adding "always surface X" overrides that grow without bound.
- The disagreement-as-signal feedback loop (Phase 5) shows no convergence — chef keeps making the same kinds of mistakes.

**Mitigation**:
- Phase 3 ships with conservative defaults: high importance threshold, generous "could include" tier, small "deferred" tier. Tighten over time as trust earns.
- Reason labels on deferred items are mandatory; each deferral states *why*. Without a reason, can't defer.
- A per-source kill switch: John can disable curation for a specific meeting type ("eng-standup deferral is wrong; just stage everything from this calendar event").
- Phase 5 (judgment substrate) must land before declaring v2 victory; without dismissal-as-signal learning, chef can't recalibrate.

**Residual**: Some calibration is just judgment that no system gets right. The user has to be willing to spot-check deferred until trust earns; if the friction of spot-checking exceeds the friction of today's firehose, v2 fails.

## High (would significantly degrade v2)

### R4: Phase 3 blast radius detonates

**What fails**: `meeting extract` decomposition breaks the most-used path. Subtle behavior changes in extraction quality cascade into bad summaries, bad memory items, bad topic pages. John can't process meetings for a day, has to revert.

**Leading indicators**:
- Phase 3 A/B comparison shows worse-quality output than today's pipeline on the bake-off.
- Process-meetings skill behavior changes that weren't in the phase plan.
- Web auto-process flow stops working.

**Mitigation**:
- Phase 1 (summaries) and Phase 2 (schema layer) ship first to give Phase 3 stable ground.
- Phase 3 plan must include explicit A/B against current pipeline before declaring the new shape acceptable.
- Soak period mandatory; no Phase 3 ship without 5 consecutive successful winddowns.
- Process-meetings skill changes are part of Phase 3, not a follow-up — the skill and CLI primitives reshape together.
- Web auto-process flow has its own integration test in Phase 3.

**Residual**: Behavior parity is hard to prove; manual review of bake-off outputs is the only real check.

### R5: Skills split breaks IDE adapters

**What fails**: Cursor or Codex users (or the user using both Claude Code and another IDE) silently lose customizations when adapter rendering doesn't merge `.arete/skills` + `.agents/skills` correctly. Customized skills disappear, default behavior comes back, user doesn't notice for days.

**Leading indicators**:
- Phase 4's CursorAdapter test passes but is testing the wrong thing.
- AGENTS.md after `arete update` differs from before in unexpected ways.
- Topic-wiki plan's "asymmetric adapter path" warning re-surfaces unaddressed.

**Mitigation**:
- Phase 4 plan ports the topic-wiki Step 9 pattern: capability probe (`supportsMemoryInjection` analog), signature-level Phase B enforcement.
- Snapshot tests on AGENTS.md before/after `arete update` with and without user customizations.
- Adapter test asserts: when `.agents/skills/foo` exists, the merged view contains the customized version, not the upstream.

**Residual**: Each new IDE adapter (post-Phase-4) has to reimplement the merged-view rendering. That's an ongoing maintenance tax.

### R6: `week.md` semantics drift

**What fails**: Phase 5 adds derived sections to `week.md` (next-week deferred, pruning suggestions, etc.). User's hand edits collide with regeneration. Either user loses edits or system can't refresh — both bad.

**Leading indicators**:
- Phase 5 plan doesn't have a clear sentinel scheme for auto vs manual sections.
- A merge conflict on `week.md` during refresh.
- John reports "I edited X and the system overwrote it."

**Mitigation**:
- Use the existing person-memory sentinel pattern (`<!-- AUTO_X_START -->` ... `<!-- AUTO_X_END -->`).
- `week.md` regeneration only touches sections inside sentinels.
- If a user edit lands inside sentinels, refresh detects and aborts with a warning instead of overwriting.

**Residual**: Sentinels are ugly. User may resent them visually. Counter: keep them out of the rendered Markdown view by making them HTML comments (which they are in the existing pattern).

## Medium (uncomfortable but recoverable)

### R7: Phase ordering wrong

**What fails**: Hygiene-pass-1 surfaces something that invalidates Phase 1 or Phase 2. We've already started one and have to abandon mid-build.

**Leading indicators**:
- Hygiene-pass-1 deletes something v2 was planning to extend.
- Hygiene rebase introduces conflicts that touch v2 surface area.

**Mitigation**:
- Hygiene-pass-1 ships before any phase build starts (parent plan dependency).
- Meta-orchestrator reads hygiene PR before authorizing Phase 1 spawn.
- Phase plans drafted but not built until hygiene is in main.

**Residual**: Some thrash is OK at the planning stage; cheap to redirect.

### R8: Sub-orchestrator scope creep

**What fails**: A sub-orchestrator running a phase plan starts touching things outside its phase scope (e.g., Phase 2 sub-orch decides to also fix `route` because it was nearby). Cross-phase dependencies tangle; review becomes hard.

**Leading indicators**:
- Phase plan diff includes files that aren't in the phase plan's "Critical files" list.
- Sub-orchestrator's review request is "and also..."

**Mitigation**:
- Sub-orchestrator handoff brief explicitly bounds scope.
- Meta-orchestrator at `/review` rejects out-of-scope changes; they go to a follow-up phase or backlog.
- Each phase has its own sub-worktree off the parent worktree's branch; merging is by phase, not by piecemeal commits.

**Residual**: Some minor cross-phase touches are unavoidable; meta-orchestrator's judgment call.

### R9: Cost regressions hidden

**What fails**: Phase 3 gates topic-page integration on importance/confidence. Initial gating is too generous; LLM cost stays high; we declare AC3 met based on a low-meeting day. Later, on a heavy day, costs blow up unnoticed.

**Leading indicators**:
- Cost telemetry isn't being reviewed weekly.
- AC3 verification doesn't include a heavy-day stress test.

**Mitigation**:
- Cost telemetry in `memory/log.md`; weekly review for first 4 weeks post-Phase 3.
- AC3 verification requires both a typical-day and a heavy-day measurement.
- A budget alert: if daily LLM cost exceeds 2× pre-Phase-3 baseline for 3 consecutive days, halt and reassess.

**Residual**: Cost is a metric that doesn't directly correspond to user-felt quality; minimizing cost alone could degrade output.

### R10: User context resets break sub-orchestrator handoff

**What fails**: Meta-orchestrator (this conversation) hits a context reset mid-phase. Sub-orchestrator is running, but new meta context can't pick up state cleanly. Wires get crossed.

**Leading indicators**:
- Diary not updated when a phase milestone passes.
- Sub-orchestrator review request can't find a meta to respond.
- Two meta sessions started in parallel by accident.

**Mitigation**:
- Diary is the durable thread. Every meta action updates the diary.
- Sub-orchestrator review queue lives in the diary; explicit table.
- Before any meta action that depends on prior state, re-read the diary.
- One meta at a time. If the user starts a new conversation, meta picks up where the diary left off.

**Residual**: Diary discipline depends on meta consistency; if a meta forgets to update, the next meta has stale state.

## Low (annoying, not threatening)

### R11: Phase plan quality varies between sub-orchestrators

Different sub-orch instances may produce phase plans of different quality. Meta-orchestrator at `/review` is the equalizer; pre-mortem and ACs are the floor. Acceptable.

### R12: Diary becomes the bottleneck

Everyone reads it; few write to it well. Mitigation: keep it lean (status table, decisions log, parking lot — not narrative).

### R13: 3-month rollout slips

Almost certain, given v1 history. Acceptable as long as discipline holds; quality of cuts matters more than calendar.

## Added post-independent-review (2026-05-01 evening)

### R14: Daily-driver disruption (no rollback in original plan)

**What fails**: Phase soak day 3, John has a 6-meeting day, the new pipeline breaks at 9pm when he's tired. Original plan had no per-phase rollback procedure; meta-orchestrator at `/review` could only suggest "fix forward."

**Leading indicators**:
- Winddown takes >45 min on any single soak day (AC11 trigger).
- Cumulative bug-fix commits during soak >2 per phase.
- John says "I had to manually clean up X today" two days running.

**Mitigation**:
- AC11 (added): >45 min winddown on any single day during soak = phase reverted, not iterated. Hard stop.
- Each phase plan must include explicit rollback steps and (where relevant) a feature flag for emergency revert during soak.
- Phase 3b in particular gets a `ARETE_LEGACY_EXTRACT=1` flag that restores the monolithic `meeting extract` path.

**Residual**: Some phases have heavier rollback (Phase 3b especially); the cost of revert may itself exceed the cost of fix-forward on edge days. Meta-orchestrator must hold the line anyway — fix-forward during soak is the precise failure mode that erodes trust.

### R15: Builder/user role conflict on soak feedback

**What fails**: John is reviewer at `/review`, the only soak tester, AND the meta-orchestrator. Soak feedback is contaminated by sunk-cost momentum. Phases ship that shouldn't, because the only adversarial voice is John overriding John.

**Leading indicators**:
- Soak ends with "yeah, it's working OK" rather than concrete improvements named.
- Skeptical-view sections in phase plans are pro-forma rather than searching.
- /review at end of soak rubber-stamps with "John feels good about it."

**Mitigation**:
- Principle 9 (skeptical-counterweight) is structural: every phase plan has an "if-I-were-skeptical" section that meta reads back at /review. Forcing the strongest counter-argument into the document is the closest thing we have to a third voice.
- AC11 hard-stop is a numerical floor that doesn't depend on John's judgment.
- Where stakes are highest (Phase 3b), an independent reviewer subagent is spawned to read the work and post adversarial review notes — same as the parent plan got.

**Residual**: Even with structural counterweight, John at the end of a long phase will be motivated to ship. Acceptable risk; the alternative (pause v2 until a co-builder appears) is worse.

### R16: Sub-orchestrator cost (Claude usage budget)

**What fails**: 5+ phases × `/ship` cycles × sub-orchestrators × independent reviewers consume more Claude budget than expected. The cadence becomes "wait for budget" rather than "wait for soak."

**Leading indicators**:
- A phase's sub-orchestrator hits a context boundary mid-build and has to be restarted from diary.
- Cost telemetry on Claude usage (separate from LLM extraction cost) trends up across phases.

**Mitigation**:
- Diary discipline ensures sub-orchestrator restarts don't lose state.
- Sub-orchestrators should request brief, focused work; they are not chat-companions.
- Independent reviewer subagents are cheap relative to build agents (read-only); use them generously.
- If budget becomes a blocker, prefer pausing between phases (cheap) over slowing within phases (expensive).

**Residual**: This is a meta-level cost that doesn't have a clean ceiling. Tracked in diary; surfaced if it changes the ship cadence.

### R17: MCP availability shifts mid-rollout

**What fails**: Plan locks in classifications ("Notion stays Core because no MCP," "Calendar stays Core because multi-provider"). One of these becomes wrong mid-rollout — e.g., a Notion MCP appears, or a Slack MCP gains multi-provider support. Phase 2's skills-split decisions assume the locked-in classifications.

**Leading indicators**:
- A relevant MCP server is announced that overlaps with a Core abstraction.
- A user-customized skill starts using an MCP path that duplicates a Core path.

**Mitigation**:
- Plan principle 5 is an evaluation rule, not a permanent classification. Re-evaluated at each phase /review.
- Skills-as-templates (Phase 2) makes it cheap for the user to migrate from a Core path to an MCP-direct path without touching shipped code.

**Residual**: Some Core abstractions (calendar) have meaningful inertia and won't migrate even if the MCP story improves. Acceptable.

### R18: Schema-layer cold-start regression (mitigated by Phase 4 conditional)

**What fails**: Original plan had Phase 5 depending on 30 days of populated events.jsonl. During days 1–30 of Phase 5, v2 produced "same output as today, plus extra substrate." Net regression.

**Leading indicators**: N/A — addressed structurally by deferring Phase 5 and making Phase 4 conditional.

**Mitigation**: Done — Phase 5 deferred; Phase 4 (schema layer) only ships if Phase 3a/3b retros surface specific consumer needs that markdown reads can't fill. If Phase 4 ships, its plan must include a population strategy (backfill from existing markdown + item-fates.jsonl from Phase 0) that does not require waiting 30 days.

**Residual**: If Phase 4 ships, the consumer-migration checklist must complete within Phase 4's own scope. Substrate sunset rule (Principle 7) enforces this — if consumers don't migrate, substrate is reverted.

### R19: Hygiene-pass-2 re-introduction

**What fails**: v2 phases claim to remove items already removed by hygiene-pass-1 (or vice versa, v2 re-introduces what hygiene removed). Discipline rule fails silently because two plans are double-counting cuts.

**Leading indicators**:
- A phase's "Removes" list overlaps with a hygiene-pass-1 task.
- A phase's "Adds" reintroduces something hygiene-pass-1 deleted.

**Mitigation**:
- Diary section "Hygiene-pass-1 — what's already gone" enumerates the exact removals. Each phase plan must reconcile its "Removes" list against this.
- Phase 3b plan explicitly notes that `brief --for`, `search --answer`, `daily`, `meeting-parser.ts` are confirmed-not-removed by hygiene (verified post-merge); Phase 3b owns these.
- `ContextService.getContextForSkill` confirmed gone; Phase 3b's "three-bundle collapse" addresses what remains.

**Residual**: A future hygiene-pass-2 may overlap with a v2 phase that hasn't shipped yet; meta-orchestrator must keep v2 plans live and update reconciliation as separate plans land.

## What we'd say in a post-mortem if this fails

If we're standing in November 2026 looking at a half-built v2:

- "We added more than we removed."
- "The schema layer never replaced what it was meant to replace."
- "The chef's deferrals were wrong too often and we didn't have the recalibration loop in time."
- "We tried to ship Phase 3 before Phase 2 was solid because Phase 2 was boring."

The pre-emptive antidote to each of those is in this document. Re-read on every phase kickoff.
