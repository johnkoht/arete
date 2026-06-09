---
title: "Q2 Quarterly Business Review (large fixture)"
date: "2026-06-03"
source: "phase-10a-pre-baseline-fixture"
attendees: "John Koht, Lindsay Gray, Anthony Avina, Dave Wiedenheft, Greg Singh, Jamie Park, Sam Carter, Priya Nair"
attendee_ids: ["john-koht", "lindsay-gray", "anthony-avina", "dave-wiedenheft", "greg-singh", "jamie-park", "sam-carter", "priya-nair"]
company: ""
pillar: "Strategy"
---

# Q2 Quarterly Business Review

## Summary

Full 90-minute Q2 review. Topics: financial performance vs plan,
product roadmap delivery, customer health, partner integrations,
hiring + retention, OKR scoring, and Q3 planning kickoff. Multiple
decisions logged; action items distributed across owners; learnings
captured for retro.

## Transcript

John: Welcome everyone. Long agenda, so let's keep moving. Priya,
finance first.

Priya: Q2 actuals vs plan. Revenue: $4.2M actual vs $4.0M plan, so
105%. Mostly driven by the Coral renewal landing two weeks early and
the Anthem upsell closing in May. Gross margin: 71.4%, plan 70%. Net
revenue retention: 119%. Logo retention: 96%. Churn: two logos lost,
both small, both expected. Burn rate trending down — $1.8M Q2 vs $2.1M
Q1. Cash runway: 22 months at current burn.

John: Good number on NRR. Anthem upsell — what's the renewal exposure
on the master agreement?

Priya: Anthem master comes up in February. We need to start positioning
in November. I'll work with Anthony on the renewal strategy.

Anthony: Already on my radar. I'll get a preview deck to John by end
of June so we can stress-test the narrative.

John: Good. Move on. Lindsay, product roadmap.

Lindsay: Q2 roadmap was four bets — POP MVP, dashboards persona-three,
partner API for Coral, and the cost-allocation feature. POP MVP is on
track for the 6/30 demo. Persona-three dashboard slipped two weeks due
to the React migration overrun — we're catching up with Greg redirect.
Coral partner API landed the spec last week, implementation runs through
July. Cost-allocation feature deprioritized in May after the customer
council pushed back; we shifted scope to Q3.

John: On cost-allocation — what did the council push back on
specifically?

Lindsay: The cohort-based bucketing model. They wanted per-team
visibility, not per-cohort. We were optimizing for the wrong unit. The
Q3 version reframes to per-team, which means a different data model.

Dave: Engineering note — the per-team reframe means we need the new
identity-tagging work we deferred from Q1. That's a 3-week ramp.

John: OK. Note that for Q3 planning. Sam, customer health.

Sam: Three reds: Aspen, Beacon, and Cinder. Aspen is the executive
sponsor transition we flagged in Q1. New EVP is unconvinced of the
value story; I'm running a 90-day re-onboard. Beacon is a platform
issue — they hit two SEV-2s in May, neither resolved within their MTTR
SLA. Engineering owes them a postmortem write-up. Cinder is a feature
parity gap with their incumbent; we won't close it for two quarters
and they know it.

John: Beacon — Dave, where's the postmortem?

Dave: Drafted, in review with the platform team. I'll get it to Sam by
Friday for customer delivery.

John: Sam, when can we schedule the Beacon exec sync?

Sam: I'm targeting the week of 6/16. I'll send invites today.

John: Aspen — I should probably be on the re-onboard. Slot me in
where it makes sense.

Sam: Will do. I'll send you the timeline this week.

John: Cinder — accept the loss or fight?

Sam: Accept. The renewal is December, modest ARR, not worth pulling
engineering. I'll keep them warm but won't escalate.

John: OK. Anthony, partners.

Anthony: Three active partner integrations: Coral, Vertex, and Polara.
Coral is on track per Lindsay's update. Vertex went GA in April and is
processing 600K events/day, growing 20% MoM. Polara signed the LOI in
May but hasn't started spec work — I've been chasing them. I think we
need to either lock a kickoff date by end of June or de-prioritize
them for Q3.

John: How big is Polara at scale?

Anthony: Estimated $1.2M ARR over 18 months if they integrate fully.
Their backlog is real — they want this. Their delay is internal
political.

John: Push for a 6/30 kickoff date. If they can't commit, drop to Q4
priority and we'll revisit at the Q3 board.

Anthony: Agreed. I'll send the firm-up email today.

John: Dave, engineering org.

Dave: Headcount: 24 engineers, plan was 27. Three open reqs — two for
the platform team, one for partner-integrations. The platform reqs are
hard, we've interviewed 14 candidates and made one offer that's still
in the negotiating phase. Partner-integrations is easier, two strong
candidates in final rounds.

John: What's the platform-team gap costing us?

Dave: Two things. Postmortem velocity — Beacon was supposed to land in
48 hours, took 9 days. And feature work; the cost-allocation per-team
reframe is going to need that team and we don't have the bandwidth
without those hires.

John: Are we being too narrow on the candidate profile?

Dave: Probably. We've been holding for senior-with-distributed-systems
depth. I'm going to open the bar to mid-level with the right slope.

John: Do it. Greg, anything from your side on retention?

Greg: One concern. Two engineers on the platform team have given soft
signals — neither is actively interviewing as far as I know, but both
have flagged burnout from the SEV-2 firefight in May. I want to
schedule 1:1s next week to assess. May need a workload redistribution.

John: Loop me in on findings. If we lose someone from platform, it
compounds Dave's hiring problem. Move fast.

Greg: Will do.

John: Lindsay, hiring on product?

Lindsay: One open PM req, candidate accepted last week, starts 6/16. I
think we're good for Q3 capacity.

John: OK, OKRs. Anthony, run the scoring.

Anthony: O1: "Hit Q2 revenue plan" — 1.05, exceeds. O2: "Launch POP
MVP" — 0.85, on track to land but not yet shipped. O3: "Improve
platform reliability (MTTR < 4h on SEV-2)" — 0.55, missed the bar.
Two SEV-2s exceeded MTTR in May. O4: "Sign two strategic partners" —
1.0, Coral + Vertex both signed.

John: O3 is the one to talk about. Dave, what's the plan?

Dave: Two angles. First, the platform reqs we just discussed — once
those land we have the headcount to run an on-call rotation that
doesn't burn anyone out. Second, I want to bring in an SRE consultant
for a 6-week assessment in July. Cost is around $80K.

John: Approve the consultant. We need an external lens. Anthony, work
with Dave on the SOW.

Anthony: Will do.

John: Q3 planning. Lindsay, you're driving the offsite?

Lindsay: Yes, 6/22-6/23. I'll send pre-reads by 6/15. Format is
unchanged — Day 1 retrospective, Day 2 forward planning. I'll include
the cost-allocation per-team reframe, the SDK guide scoping, and the
partner-doc gap on the agenda.

John: Add the platform-org reliability investment as a topic. We need
to align on whether we're funding the SRE consultant work as the
primary lever or scaling the team.

Lindsay: Got it.

John: Anything else?

Sam: One — I'm going to circulate a customer-feedback synthesis next
week. Six themes from Q2 churn + at-risk interviews. Useful for the
offsite.

John: Great. Send it to me first so I can flag anything that needs
positioning.

Sam: Will do.

John: OK, thanks all. Long session. I'll send a follow-up note with
the decision log and action items.

## Action Items

- [ ] Priya: build Anthem renewal preview deck by end of June
- [ ] Anthony: get Anthem renewal preview to John by end of June (joint with Priya)
- [ ] Dave: deliver Beacon SEV-2 postmortem to Sam by Friday
- [ ] Sam: schedule Beacon exec sync week of 6/16
- [ ] Sam: send John the Aspen re-onboard timeline this week
- [ ] Anthony: send Polara firm-up email today; 6/30 kickoff or drop to Q4
- [ ] Dave: open platform-team req bar to mid-level + the right slope
- [ ] Greg: 1:1s with both platform engineers showing burnout signals; report back to John
- [ ] Anthony: work with Dave on SRE consultant SOW (Q3, ~$80K)
- [ ] Lindsay: send Q3 offsite pre-reads by 6/15
- [ ] Lindsay: add SDK guide, per-team cost allocation, partner docs, platform reliability investment to offsite agenda
- [ ] Sam: circulate Q2 customer-feedback synthesis to John first, then broader team

## Decisions Made

- Cost-allocation feature deprioritized from Q2; reframes to per-team in Q3 (needs Q1-deferred identity-tagging work as dependency).
- Cinder churn accepted; no engineering escalation.
- Polara partner: 6/30 kickoff is the gating commitment, else drops to Q4 review at Q3 board.
- Approve SRE consultant engagement (~$80K, 6-week assessment, July) as external-lens lever on platform reliability.
- Q3 offsite agenda includes: SDK guide, per-team cost allocation, partner-doc gap, platform reliability investment.

## Learnings

- Platform headcount gap is now blocking BOTH reliability (O3 miss) AND product velocity (cost-allocation reframe). The req constraint is the single highest-leverage thing to unblock in Q3.
- Customer council feedback caught a wrong-unit modeling decision early — keep the council loop tight on data-model decisions, not just feature scoping.
- React migration cleanup consistently overruns engineering estimates — flag estimation pattern for retro.
- Anthem renewal positioning needs a 5-month lead, not 3 — restart pattern earlier next cycle.
