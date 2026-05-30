---
title: "Phase 8 — pre-mortem"
slug: phase-8-pre-mortem
created: "2026-05-30"
parent: phase-8-loop-reconciler
---

# Pre-mortem

If Phase 8 ships and 2 weeks later we say "that was a mistake," what would have caused it?

## R1 — Silent mis-collapse on a real obligation

**Failure mode**: chef's Rule 1/2/3 fires on a real obligation that wasn't actually fulfilled. Per AC4 revised, ALL collapses are now proposed (not auto), so the proposed-collapse appears in `## Closed today` waiting for user approval. User in low-attention winddown approves `all` without reading carefully → real obligation collapsed.

**Mitigation**:
- D1 conservative collapse (concrete evidence required) makes false positives rare
- AC4's proposal-style surface gives user the chance to reject (vs original plan's auto-collapse-for-staged-only path which had no review surface)
- D2 "Closed today" trace is the audit log; user reviews it post-hoc if they suspect drift
- AC11 hard stop catches catastrophic miss days

Single biggest residual risk: user develops "approve all" muscle memory → safety net eroded. Mitigation: build sub-orch may consider an AC4 prose addition discouraging blanket `all` approval on Closed-today proposals (e.g., "Read each proposal; type the IDs you want to approve, not `all`, for the first 7 winddowns").

## R2 — AC11 regression from heavier gather + reconcile pass

**Failure mode**: Phase 8 adds work to every winddown. Gather pulls 5+ sources in parallel; reconcile pass runs LLM judgment over merged ledger. On a heavy day (5+ meetings + busy slack + busy email), wall time exceeds 45 min → AC11 triggers revert.

**Mitigation**:
- AC6 measured shadow gather BEFORE merge surfaces expected delta; meta evaluates before ship
- AC11 hard stop is the eject button
- Revert path is `git revert <merge commit>` — clean per MC2 post-MC5

Residual risk: shadow gather measures a typical day, not a heaviest day. Heaviest-day exceedance only shows in soak. AC11 catches it; no mitigation removes the soak-discovery latency.

## R3 — Gather-only contract violation (sub-skill writes to disk)

**Failure mode**: slack-digest in gather-only mode also writes `resources/notes/2026-05-30-slack-digest.md` despite SKILL.md saying it shouldn't. User now has duplicate digest writes per winddown.

**Mitigation**:
- AC1 mtime-snapshot check surfaces violation in `## Notes` (per C5 review)
- Best-effort detection; soak is the real fix layer
- If violation recurs, the offending sub-skill's gather-only mode prose gets tightened

**Residual**: mtime detection is "best effort" — a sub-skill writing to a different path (e.g., `resources/notes/` is OK in standalone mode for slack-digest) won't be caught by `now/archive/` mtime snapshot. May need expanded check during build.

## R4 — Calendar attendee resolution gaps

**Failure mode**: Rule 2 needs to match "meet with Nick + Anthony" intent → calendar event with attendees Nick + Anthony. If calendar event has email-only attendees (`anthony.avina@reserv.com`) and reconciler tries to match by slug (anthony-avina), it fails silently.

**Mitigation**:
- Phase 7a AC5 audit-channels surfaces the `email` field is populated for 12% of people only
- Reconciler attendee match should fall back through: slug → email → name string, in that order
- Without slack_user_id, calendar match-via-email is the primary path; with 12% email coverage, this is degraded too

**Residual**: this is a SECOND backfill axis (calendar uses email more often than slack). Phase 8 plan doesn't surface email backfill as separately from slack backfill. May need a second nudge in audit-channels output: "X% of people have email populated; calendar matching depends on this."

## R5 — Backfill gap → Rule 1 effectively dark at ship (per C1)

**Failure mode**: 0% slack_user_id population means Rule 1 emits only Uncertain-tier candidates. User experiences slower winddown (+gather+reconcile time) with marginal Rule 1 value. v2 thesis takes credibility hit.

**Mitigation**:
- Plan's "What ships degraded at MVP" section makes this explicit upfront
- Rules 2+3 catch 2 of 3 anchor cases at ship — meaningful immediate value
- AC5 nudge surfaces the gap every winddown
- Backfill is workspace-agent ad-hoc work (decided 2026-05-29); user can do partial backfill anytime

**Residual**: if user doesn't backfill within first 2 weeks of soak, Rule 1's value is theoretical. Parking-lot item suggests reconsidering Rule 1 deferral if backfill is 0% at ship.

## R6 — Recurring 1:1 false positive (addressed in AC2 Rule 2 guard, but residual)

**Failure mode**: "Set up call with Lindsay about Q3 priorities" → standing weekly Lindsay 1:1 on calendar → Rule 2 fires.

**Mitigation**: AC2 Rule 2 explicitly guards recurring events with generic titles → drops to Uncertain.

**Residual**: defining "generic title" is itself a judgment call. The chef's heuristic may incorrectly classify "Lindsay / John 1:1" as generic when the topic happens to be a regular recurring topic. Soak surfaces.

## R7 — Re-run idempotency (addressed in AC4, but residual)

**Failure mode**: user runs winddown twice same day. Second run re-proposes collapse for IDs the first run already resolved.

**Mitigation**: AC4 requires chef to check `arete commitments list --json` first and skip proposals for items resolved earlier today.

**Residual**: works for committed items. For staged-only items (intents from today's meeting extracts), the chef has no persistent "I already proposed this earlier today" memory. Could re-propose pre-staging collapses on each run. AC4 prose doesn't address this; soak surfaces if it's actually annoying.

## What's the single most likely thing to go wrong?

**R5 + R1 hybrid**: user ships, doesn't backfill (because it requires manual work + workspace-agent time), Rule 1 stays dark, Rule 2+3 catch some things, user finds the new winddown takes longer (per AC6 shadow gather + the reality of more sources to gather from) AND only catches what they would have hand-skipped anyway on Rules 2+3. Net: slightly slower winddown, marginal Closed-today section, "approve all" muscle memory builds on the proposed-collapses → R1 starts being a real risk for false positives that weren't load-bearing under "auto-collapse for staged" but become potential silent drops under "all proposed approved en masse."

**Second-most-likely**: AC11 trigger on a heavy day in week 1 due to slow gather; explicit revert; user momentum on the cross-skill chef vision stalls.
