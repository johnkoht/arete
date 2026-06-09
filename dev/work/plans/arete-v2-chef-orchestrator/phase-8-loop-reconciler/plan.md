---
title: "Phase 8 — Loop reconciler (Slice B)"
slug: phase-8-loop-reconciler
created: "2026-05-30"
revised: "2026-05-30 — post review-1"
parent: arete-v2-chef-orchestrator
owner: meta-orchestrator (Claude)
status: revised-post-review-1
input_spec: dev/work/plans/arete-v2-chef-orchestrator/inputs/daily-winddown-unification-spec.md
---

## Revisions from review-1 (eng-lead, 2026-05-30)

- **C1 [high]** — Rule 1 (slack DM fulfillment) won't fire at ship because `slack_user_id` is 0% in arete-reserv. The spec's MAIN motivating example (`ai_002`) is degraded out of the gate. Added a "What ships degraded at MVP" section front-and-center; AC5 nudge wording made explicit about this.
- **C2 [high]** — Anchor case `ai_004` (calendar attendee match for invite-by-someone-else) needs explicit "match regardless of `organizer.self`" language in AC2 Rule 2. Added.
- **C3 [med]** — Killed the dual-collapse behavior. ALL collapses are now PROPOSED (uniform), not auto. The clever distinction between staged-only and committed wasn't paying for itself; uniform-proposed is safer and simpler. AC4 rewritten.
- **C4 [med]** — Added measured shadow gather to build steps. Before merging Phase 8, sub-orch runs the new Step 1 gather + reconcile against a real recent day and reports wall-time + collapse counts in build-report. AC6 updated.
- **C5 [med]** — Added concrete contract-violation check to AC1: mtime snapshot of `now/archive/` before/after each gather-only sub-call; mismatch surfaces in `## Notes`.
- **C6 [low]** — Added to parking lot: reconsider rule-1 deferral if backfill not started by ship.
- **C7 [low]** — AC7 adds explicit "per D7 no code-level reconciler test; soak is validation" language.
- **R6 [new]** — AC2 Rule 2 guards against recurring-1:1 false positives.
- **R7 [new]** — AC4 adds re-run idempotency check.

# Phase 8 — Loop reconciler

## Why this exists

The user-felt-win phase. 7a shipped substrate (gather-only mode, jira_epics watchlist, --channels helper, calendar pull); 7b removed dead code (-169 LOC cumulative across 7a+7b). Phase 8 wires them up: daily-winddown becomes the cross-skill chef that gathers from slack+email+calendar+meetings+commitments+week.md in parallel, runs a reconciliation pass to collapse intents that have been fulfilled elsewhere, and engages the user once with the survivors.

The anchor example from the spec (`2026-05-28-john-nate-pre-runyon-checkin`): 5 action items staged, user hand-skipped 3 because they were already resolved via slack/calendar. Phase 8's reconciler catches those 3 before staging, surfacing them as "Closed today" with evidence traces.

**One-line goal**: the chef agent does the cross-source reconciliation that the user does today by hand-skipping. User reviews only survivors + a "Closed today" trace.

## Decisions locked (from spec, carrying into this plan)

| # | Decision | Choice | Source |
|---|---|---|---|
| D1 | Collapse aggressiveness | **Conservative.** Concrete evidence only; fuzzy → Uncertain tier | Spec §4 |
| D2 | Closed-loop visibility | **"Closed today"** narrative section with source→fulfillment trace | Spec §4 |
| D3 | Orchestration | **Shared extractors, one engagement.** Standalone skills still work; called from winddown they extract-only | Spec §4 |
| D4 | Where reconciliation sits | **Before staging.** UI only shows survivors | Spec §4 |
| D5 | UI scope | Meeting-staging review surface stays the approval UI for survivors. Slack/email/Jira are evidence sources + chat for leftover | Spec §4 |
| D6 | Closure rule | **"You acted = done"** by default, with judgment on nature of ask. Fire-and-forget closes on send; blocking-question closes on send but may drop a light "waiting on" | Spec §4 |
| D7 | Reconciler implementation | **Agent judgment in-context.** No new CLI primitive initially. Harden into a CLI later if it proves out | Spec §4 |
| D8 | Runtime | **Always full.** No light/full toggle. User runs winddown when they have time; prefers completeness over speed | Spec §4 |
| D9 | Calendar pull | **All visible events in next-30d window** (not "created today") — matches future-intent commitments. Plus most-recent backward window for "action moot, event passed" detection | Spec §4 + 7a AC6 verification |

## What ships degraded at MVP (added per C1 review)

**Rule 1 (slack DM = fulfillment) does not auto-collapse at ship.** Phase 7a's audit revealed `slack_user_id` at 0% across 147 people in arete-reserv. Rule 1's counterparty resolution requires this field; without it, every Rule 1 candidate falls back to name-string heuristic, which per AC2 graceful-degradation rules drops to `## Uncertain` regardless of topic confidence.

**Practical consequence at ship**: the spec's anchor `ai_002` ("Confirm with Lindsay X" fulfilled via Slack DM) — the example that motivated the whole spec — surfaces in Uncertain, not Closed today. User still hand-resolves it. Phase 8's user-felt-win on Rule 1 unlocks AS the user backfills `slack_user_id` (manual, ad-hoc, via workspace agent + Slack MCP).

**What DOES fire at ship**:
- **Rule 2 (intent → already-scheduled event)** — needs only calendar attendee match. Catches anchor `ai_004` immediately. Doesn't depend on slack backfill.
- **Rule 3 (action moot, event passed)** — needs only timestamp comparison. Catches anchor `ai_003` immediately. Cheapest rule.

So 2 of 3 anchor cases hit at ship; the third lights up progressively. The audit-channels nudge (AC5) makes the gap visible every winddown so the user knows what's degraded and why.

**This is honest framing, not a degraded ship**: the substrate (Phase 7a) made Rule 1 implementable; Phase 8 ships it as code-of-record; data fill-in unlocks it experientially. Phase 8's value is captured at 2/3 anchor cases on day one, fully captured as backfill progresses.

## Constraints from prior phases

- **AC1 (Phase 7a) limitation**: gather-only is a best-effort prose contract; no code-level enforcement. Phase 8's orchestrator must validate sub-skill output structurally (JSON shape) and warn on contract violation.
- **AC5 (Phase 7a) reality**: 88% of 147 people in arete-reserv have ZERO channel fields. `slack_user_id` populated: 0%. Slack→person match rate at ship will be ~0% until user backfills. Phase 8 MUST gracefully degrade.
- **AC10 ≤15m gating tension with D8 "always full"**: Phase 8 intentionally trades some winddown time for completeness. The user-felt win is "fewer items hand-skipped," not "faster winddown." Plan must address this honestly — AC10 may not be met if D8 raises ceiling time. AC11 (>45m = hard stop) still applies.
- **MC5 sunset complete (Phase 3)**: rollback is `git revert`, no SKILL.legacy.md needed.

## Scope (acceptance criteria)

### AC1 — daily-winddown SKILL.md gains a cross-skill GATHER phase (GATE)

Rewrite `packages/runtime/skills/daily-winddown/SKILL.md` Step 1 (Gather) to invoke gather-only mode on multiple sub-skills in parallel:

**New Step 1 — Cross-skill gather (parallel where independent)**:
- `slack-digest` in gather-only mode → returns structured loops (per PATTERNS.md Pattern 5 shape)
- `email-triage` in gather-only mode → loops
- `process-meetings` in gather-only mode → loops (action items from today's meetings as intent loops)
- `arete pull calendar --days 30 --json` → forward calendar (existing 7a flag)
- `arete pull calendar --days -1 --json` OR similar backward window → recent-past events for "moot" detection (if existing flags suffice; otherwise document workaround in build-report)
- `arete commitments list --json` → existing open commitments
- `arete areas epics --active --json` (7a) → Jira watchlist (display-only in P8; Jira pull deferred)
- `now/week.md` read
- `arete people audit-channels --json` (7a) → channel-gap nudge for graceful degradation messaging

**Loop output shape consumed**: each gather-only sub-skill returns loops with `{source, kind, counterparty_slug?, counterparty_name, timestamp, text, evidence_pointer, confidence}`. Phase 8 reconciler reads these in the next step.

**Test**: extend `chef-orchestrator-skills.test.ts` to assert daily-winddown SKILL.md cites the Pattern 5 invocation marker for each gather-only sub-skill it composes.

**Contract-violation detection (per C5)**: SKILL.md Step 1 prose includes an explicit mtime-snapshot check. Before each gather-only sub-call, chef snapshots `now/archive/<skill>/` directory mtimes; after the call, compares. Mismatch = sub-skill wrote a file in gather-only mode (contract violation). Surface in `## Notes` section of the curated view:

```
## Notes
- slack-digest gather-only contract violation detected: new file
  now/archive/slack-digest/slack-digest-2026-05-30.md (write occurred
  during gather-only invocation; expected no disk write). Soak should
  surface if recurring.
```

This is best-effort detection (the file may already exist with same mtime if it's a re-run); not a hard gate. Provides soak-visible signal.

### AC2 — Reconciliation pass with the three skip rules (GATE)

Add a new **Step 2 — Reconcile (before staging)** between gather (Step 1) and engage (final step). The chef reads the merged loop ledger and applies these rules in agent context:

**Rule 1 — Intent → fulfilling action elsewhere**:
- For each open commitment / today's action item, scan the loop ledger for a fulfilling action authored by the user matching the same counterparty + topic + timestamp ≥ intent.
- Match heuristic: counterparty must resolve (via `arete people show --channels` cache) AND topic overlap must be ≥ 50% Jaccard on normalized tokens.
- **If concrete evidence** (real slack message OR sent email OR calendar invite created): collapse to "Closed today" with trace.
- **If fuzzy** (partial counterparty match, weak topic overlap, or graceful-degradation fallback on name-string): surface in `## Uncertain — your call` with the candidate fulfillment.

**Rule 2 — Intent → already-scheduled event**:
- For each open "meet with X" / "talk to X" / "set up call with X" intent: scan forward calendar (next 30d) for events with matching attendees.
- **Match attendees regardless of `organizer.self`** (per Phase 7a AC6 finding: `arete pull calendar` returns invited events with `organizer.self: boolean`; reconciler treats invited events as fulfillment — addresses anchor case `ai_004` where invite is organized by someone else).
- **If concrete event exists**: propose collapse to "Closed today" — the event IS the fulfillment.
- **If event matches but attendees ambiguous**: surface to `## Uncertain`.
- **Recurring-event guard (R6)**: recurring events with generic titles (e.g., "X / John 1:1" weekly) drop to `## Uncertain`, NOT auto-propose. Reason: calendar event title is too weak to confirm the specific intent topic (the intent "set up call with X about Y" should NOT be auto-collapsed by a standing 1:1 even if X is the attendee).

**Rule 3 — Action moot, event passed**:
- For each prep action ("prepare X for meeting Y", "review X before call Z"): if the named meeting/event has already passed (timestamp < now), mark as moot.
- **Concrete only** — needs explicit meeting/event reference; no fuzzy timestamp inference.
- Cheapest rule; runs first.

**Conservative collapse** (D1): all three rules MUST cite a concrete piece of evidence — a real message, invite, or timestamp. Fuzzy matches → Uncertain tier, never silently collapsed.

**Graceful degradation** (per AC5 constraint): when counterparty match falls back to name-string heuristic (no slack_user_id populated), confidence drops to "low" automatically and the match goes to `## Uncertain` regardless of topic confidence. The user sees "Lindsay agreed Wed via Slack (name-match only; populate slack_user_id for high-confidence)."

**Test**: extend `chef-orchestrator-skills.test.ts` with regex assertions on the Step 2 prose — the three rule names, "conservative", "Uncertain", graceful-degradation language. Loose regex per the post-followup-5 convention.

### AC3 — "Closed today" narrative section in curated view (GATE)

Add a new section to the curated view output template:

```markdown
## Closed today

N intents collapsed by the reconciler:

- **<intent text>** — fulfilled via <evidence type> with <counterparty> on <timestamp>
  Evidence: <pointer to message/invite/meeting file>
- **<intent text>** — meeting <slug> already passed (action moot)
- ...

N items kept in Uncertain (name-match only; channel backfill would lift these).
```

**Required content per spec D2**:
- Trace each collapsed loop to a concrete source→fulfillment pair
- Show count of low-confidence Uncertain-tier items separately (the backfill-gap visibility prompt)
- Include the audit-channels nudge inline if `audit-channels` reports <50% slack coverage (per AC5 constraint)

**Test**: assert SKILL.md output template contains a `## Closed today` section with evidence-pointer language.

### AC4 — Conservative engagement: ALL collapses are proposed (GATE — revised per C3)

Per D1: chef MUST NOT silently collapse any loop. **All** Rule 1/2/3 matches surface as **proposed collapses** in `## Closed today`, regardless of whether the underlying item is already in `commitments.json` or just staged from today's meeting extract.

Revised rationale (per C3): the original plan distinguished "auto-collapse for staged-only items" from "proposed-collapse for committed items." Reviewer correctly noted this clever distinction adds risk — staged-only auto-collapses leave no review surface, meaning a Rule 1 false positive on a meeting-extracted intent silently disappears with only the `## Closed today` trace as audit. Uniform "all proposed" is safer and simpler.

**Format**:

```markdown
## Closed today (proposed)

3 intents the reconciler thinks are fulfilled. Approve to commit the collapse; reject to keep in your queue.

[CT1] Open commitment `abc12345` 'Confirm with Lindsay X' appears fulfilled by
      Slack DM to @lindsay-gray at 11:42a today.
      Evidence: slack:D0AGP5S4S4U/p1748... (intent timestamp 9:30a < message 11:42a)
      Action if approved: arete commitments_resolve abc12345 --reason "Auto-detected: Slack DM fulfillment"

[CT2] Meeting action 'Set up call with Nick & Anthony to review prototype' (from
      2026-05-30-john-nate-pre-runyon-checkin.md) appears fulfilled — calendar invite
      already exists for Fri 5/31 2p (organized by Nate; John attending).
      Evidence: calendar:abc123def
      Action if approved: skip staging this item (no commitment created)

[CT3] Meeting action 'Find suitable staging claim for live walkthrough' is moot —
      the Runyon walkthrough event passed at 1:00p today.
      Evidence: calendar:def456ghi (start=2026-05-30T13:00)
      Action if approved: skip staging this item
```

User responds: `CT1, CT3` to approve those collapses, leave CT2 in queue; OR `all` to approve all; OR ignore to leave everything in queue.

**Re-run idempotency (R7)**: chef runs `arete commitments list --json` first; for any commitment with `resolvedAt > today_start`, skip proposing collapse for it (already resolved earlier today). Prevents re-proposing already-collapsed items on winddown re-run.

**Test**: regex on SKILL.md prose — "Closed today (proposed)", "Approve to commit", "skip proposing collapse for it" / "resolvedAt > today_start" idempotency language, no occurrence of "auto-collapse" framing.

### AC5 — Channel-backfill nudge integrated into chef engagement (GATE)

Per AC5 constraint and pre-mortem R1 graceful-degradation requirement: chef calls `arete people audit-channels --json` at Step 1 gather. If `audit.with_slack_user_id / audit.total < 0.5` (less than half of people have slack_user_id), surface a one-line nudge in the curated view's `## Notes` or top-of-`## Closed today` section:

> "Reconciler match-rate degraded: 0 of 147 people have `slack_user_id` populated. Phase 7a `arete people audit-channels` shows the gap. Backfill via Slack MCP would lift reconciler accuracy substantially."

**Cap**: once per winddown. **Skippable**: user can ignore.

This makes the channel-gap visible without forcing immediate action. As backfill progresses (whenever user gets to it), nudge frequency decreases naturally.

**Test**: SKILL.md prose contains the audit-channels invocation + nudge condition.

### AC6 — D8 "always full" + measured shadow gather + AC10 reconciliation (GATE — expanded per C4)

Phase 8 explicitly accepts D8 ("always full"; no light/full toggle).

**Measured shadow gather REQUIRED BEFORE MERGE** (per C4): build sub-orch picks ONE recent winddown day from `now/archive/daily-winddown/winddown-*.md` and:
1. Runs the new Step 1 cross-skill gather against that day's sources (slack, email, meetings, calendar, commitments) — produces loop ledger
2. Runs the new Step 2 reconcile pass on the merged ledger
3. Reports wall-clock time for (1) + (2) in build-report
4. Reports count of Rule 1/2/3 candidates surfaced + how many would have collapsed pre-staging
5. Compares to that day's pre-Phase-8 winddown wall-clock from `.arete/memory/log.md` event log

Build-report's shadow gather finding is meta's check before merge. If shadow shows gather + reconcile >10min added (vs the hand-waved +3-5m estimate), Phase 8 ship plan is reconsidered.

**AC10 reframing** (with measurement basis now required, not hand-waved):
- Pre-Phase-8 baseline: ~17-21min median (diary 2026-05-27 check-in; followup-3 revision).
- Phase 8 expected delta: TBD-from-shadow-measurement.
- Target informal ceiling: 30 min median over 14-day soak.
- AC11 hard stop (>45m on any single day = revert) still applies.

If shadow shows acceptable delta + Phase 8 ships + soak median stays ≤30m: Phase 8 holds. If creeps higher: D8 stands but AC11 is the eject button. If AC11 triggers: explicit revert path.

**Updated AC10 framing**: AC10's quantitative target stays in parent plan. Phase 8 ships if shadow measurement is acceptable AND AC11 doesn't trigger during soak.

### AC7 — Tests (GATE)

Per-file `npx tsx --test`:
- `chef-orchestrator-skills.test.ts` extended: daily-winddown SKILL.md contains Step 1 cross-skill gather, Step 2 reconcile, Closed today section, audit-channels invocation, Pattern 5 gather-only references.
- Regression check on prior phases' tests: `topic-memory.test.ts`, `meeting-frontmatter.test.ts`, `area-memory.test.ts`, `commitments.test.ts`, `tasks.test.ts`, `entity.test.ts`, `areas.test.ts`, `people.test.ts`, `search.test.ts`, `status.test.ts`.

**Per C7**: by design (D7 agent judgment in-context, not code), there is NO end-to-end reconciler test in this phase. Tests are SKILL.md prose-regex only — they guard against prose drift, not reconciler-logic regressions. Soak (14 days with AC11 hard stop) is the reconciler's validation layer. This is consistent with the chef-pattern testing approach from Phases 2 + 3.5 + 7a.

### AC8 — Discipline ledger

Per parent plan AC8: net delta ≤ 0 OR explicit substitution argument.

Phase 8 is **almost entirely prose** (daily-winddown SKILL.md rewrite). Limited code work:

| Item | LOC estimate |
|---|---|
| daily-winddown SKILL.md rewrite (new Steps 1+2, Closed today section, audit-channels nudge, AC4 dual behavior, ~200 LOC of new prose replacing some existing prose) | net ~+150 markdown |
| Tests in chef-orchestrator-skills.test.ts | ~+50 test code |
| **Net (markdown)** | **~+150** |
| **Net (code, non-test)** | **~0** |

**Substitution argument**: 7a substrate + 7b removes pay for Phase 8's prose addition. Cumulative across 7a+7b+8: 7a (+606 src) + 7b (-775 src) + 8 (~0 src) = **~-169 LOC code-only** (unchanged from 7a+7b). Markdown grows another ~+150 LOC; convention from 7a's ledger framing accepts markdown growth when load-bearing for chef pattern.

Phase 8 IS the consumer Phase 7a's substrate was created for. The substitution argument from 7a (substrate without immediate consumer) becomes substrate WITH consumer here. Sunset trigger (2026-06-30) no longer applies once Phase 8 ships.

### AC9 — AC11 still gates (GATE)

Daily-driver hard stop: if any single soak day exceeds 45 min winddown, Phase 8 is reverted (per parent plan AC11). 14-day soak window starts at parent-merge.

This is the rollback gate. The reconciler is agent-judgment-in-context (no new substrate); `git revert <merge commit>` cleanly restores Phase 7a/7b daily-winddown.

### AC10 — Rollback path

`git revert <merge commit>` restores Phase 7a/7b daily-winddown SKILL.md prose. No SKILL.legacy.md needed (post-MC5 sunset). Test sweep verifies the revert lands cleanly.

If a subset of Phase 8 misbehaves (e.g., AC2's Rule 1 fires false positives but Rules 2+3 work), per-rule disable can be a follow-up commit modifying the SKILL.md prose. No code rollback machinery needed.

## Skeptical view (per parent plan principle #9)

**Strongest case against shipping Phase 8 now:**

"Phase 8 is the highest-stakes change in v2 — it reshapes daily-winddown, the user's most-used surface, with cross-skill orchestration that depends on a contract (gather-only mode) the harness can't enforce AND on data (slack_user_id on 147 people) that's currently 0% populated. The conservative-collapse design is correct, but the safety nets — D2 'Closed today' trace, AC5 audit-channels nudge, AC11 hard stop — all assume the user is monitoring the output carefully. If the user has a heavy meeting day and the reconciler silently mis-collapses one obligation, it surfaces as a relationship miss days later. The bug is detectable only by looking at 'Closed today' carefully every run, and 'closing the day' is precisely when attention is lowest."

**Counter:**
1. **D1 + D4 do most of the work**: conservative collapse only on concrete evidence; per AC4 revised, ALL collapses (including staged-only meeting-extract intents) are PROPOSED, never auto-executed. User approves each collapse via Closed-today proposals or types `all` to approve en masse.
2. **The reconciler is judgment-in-context (D7), not a code primitive** — the chef agent thinks each run; review-time reasoning is fresh per winddown.
3. **AC11 hard stop is real** — if a single day breaks, Phase 8 reverts. No "iterate in place" trap.
4. **Backfill gap is visible** — AC5 nudge surfaces it; user backfills progressively; reconciler accuracy improves as data fills in.
5. **The alternative is worse** — today the user hand-skips 3 of 5 action items per meeting (anchor example from spec). The reconciler being right 90% of the time on collapsible loops is still a massive improvement on hand-skipping 100%.

**Risks added in pre-mortem**:
- R1: Silent mis-collapse on a real obligation
- R2: AC11 regression from heavier gather + reconcile pass
- R3: Gather-only contract violations (sub-skill writes to disk in gather-only mode)
- R4: Calendar attendee resolution gaps (someone-else's-invite that doesn't include the user as attendee but should match)
- R5: Backfill gap → 0% slack match rate → reconciler effectively rule-2-and-3-only at ship

## Phase plan requirements (per parent plan)

- **MC1 (gates vs stretch)**: ALL ACs are gates. No stretch. The Phase 8 value-prop is the integrated whole; partial ship would be a degraded experience without clear win.
- **MC2 (per-skill rollback)**: prose-only on existing post-MC5 skill; `git revert` is rollback. No SKILL.legacy.md.
- **MC3 (shadow validation)**: no new heuristic, but Phase 8 daily-winddown soak is itself the validation. 14-day soak with AC11 hard stop.
- **MC4 (PATTERNS.md ships first)**: PATTERNS.md Pattern 5 already shipped in Phase 7a. No new pattern.
- **MC5 (legacy interaction)**: N/A.

## Build orchestration

Sub-orchestrator runs in manually-created sub-worktree off parent (per Phase 3 lesson). Pre-flight check in handoff brief.

Branch: `worktree-phase-8-loop-reconciler`
Worktree path: `.claude/worktrees/phase-8-loop-reconciler`

Per-task commits with `phase-8(<area>): <change>` prefix. Per-file `tsx --test` (NO `npm test` at root). Dist rebuild before final commit (probably zero dist changes since this is prose-only — but verify and commit anyway).

Steps:
1. **Pre-flight**: verify base + 7a/7b commits (`4f7ce486`, `11d240ea`) + 7b followup `080abc4d` reachable. Halt if base wrong.
2. **AC1 build** — daily-winddown SKILL.md Step 1 rewrite (cross-skill gather via Pattern 5 invocations). Test in chef-orchestrator-skills.test.ts. Commit `phase-8(runtime): daily-winddown cross-skill gather step (AC1)`.
3. **AC2 build** — daily-winddown SKILL.md Step 2 reconciler (three rules + conservative collapse + graceful degradation). Test. Commit `phase-8(runtime): daily-winddown reconciler step with three rules (AC2)`.
4. **AC3 build** — daily-winddown SKILL.md `## Closed today` section + output template. Test. Commit `phase-8(runtime): closed-today narrative section (AC3)`.
5. **AC4 build** — uniform "all collapses proposed" engagement surface + re-run idempotency (R7) check. Test. Commit `phase-8(runtime): proposed-collapse engagement + re-run idempotency (AC4)`.
6. **AC5 build** — channel-backfill nudge integration. Test. Commit `phase-8(runtime): channel-backfill nudge in winddown (AC5)`.
7. **AC6 build** — D8 "always full" + AC10 reconciliation prose in SKILL.md (probably a note in the workflow header). Commit `phase-8(runtime): D8 always-full mode + AC10 framing (AC6)`.
8. **AC7 full test sweep** — per-file tests + regression check.
9. **Rebuild dist**. Commit `phase-8(dist): rebuild (likely no-op)`.
10. **Write build-report.md**.

Eng-lead review at end. Fix-ups if needed. Merge to parent.

## Open questions / parking lot

- **Jira pull is still deferred.** No Jira MCP today. Reconciler reads `arete areas epics --active` (the watchlist) and surfaces it as a context-only block in the curated view — "Active epics: PLAT-11014, PLAT-10025, ..." — but does not pull Jira state. Future Phase wires Jira MCP.
- **brief --for LLM-branch removal** is the queued follow-up from 7b. Independent of Phase 8.
- **Reconsider Rule 1 deferral if backfill not started by ship** (per C6 review). The honest framing now is: Phase 8 ships Rules 2+3 fully active and Rule 1 ready-but-degraded-until-backfill. If by ship date the user has not yet backfilled even 30% of top-50 counterparties, consider deferring Rule 1 to a follow-up phase + shipping Phase 8 with explicit "Rule 1 disabled pending backfill" note. Not changing scope today; flagging for sub-orch handoff to surface if relevant.
- If Phase 8's AC11 triggers a revert during soak, the v2 roadmap's user-felt-win is delayed. Plan accepts this risk; no fallback design.
- Schema-layer Phase 6 conditional consumer story: Phase 8 reconciler is the strongest consumer candidate. After Phase 8 soaks, evaluate whether codifying reconciler state in `state.json` (Phase 6) is justified.
