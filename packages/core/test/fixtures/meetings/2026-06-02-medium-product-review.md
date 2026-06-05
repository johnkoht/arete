---
title: "POP Product Review (medium fixture)"
date: "2026-06-02"
source: "phase-10a-pre-baseline-fixture"
attendees: "John Koht, Lindsay Gray, Anthony Avina, Dave Wiedenheft"
attendee_ids: ["john-koht", "lindsay-gray", "anthony-avina", "dave-wiedenheft"]
company: ""
pillar: "Product"
---

# POP Product Review

## Summary

Mid-quarter product review for the POP MVP. Covered scope, risk log,
go-to-market readiness, and the partner integration question for
Coral. Decisions logged inline; action items captured at the end.

## Transcript

John: OK let's get started. Lindsay, want to kick off with the scope
recap?

Lindsay: Sure. Three workstreams for POP MVP — the ingestion pipeline,
the dashboards, and the partner API. Ingestion is on track for the 6/30
demo. Dashboards landed last week but the React migration ate four
days, so we're behind on the persona-three view. Partner API is the
open question.

Anthony: On the partner API — Coral wants the integration spec by EOM.
If we slip past 6/20 they re-prioritize their side and we lose Q3
visibility. I think we need to commit a path forward today.

Dave: Engineering side, the spec is 60% done. We're blocked on the
auth model. We had three options: shared JWT, mTLS, or signed JWT
with rotation. The team is leaning signed JWT but it's not unanimous.

John: What's holding back the unanimous call?

Dave: Concerns about key rotation on Coral's side. Their infra is older;
mTLS would be cleaner but it pushes their work by a sprint.

Lindsay: I'd rather not push Coral's work. Let's go signed JWT and
build the rotation tooling on our side so Coral doesn't have to.

Anthony: Agreed. I'll loop in their architect today and confirm.

John: Decision made. Signed JWT with us-owned rotation tooling. Anthony,
own the comms to Coral. Dave, get the spec to 100% by Friday.

Dave: On it.

John: OK, dashboards. Lindsay, where are we on persona-three?

Lindsay: Behind. Two engineering days needed for the chart components,
one for the filter logic. I'm going to redirect Greg from his current
work to unblock — he's been on the migration cleanup and we can push
that.

John: Fine with me. Update the sprint board and let Anthony know.

Lindsay: Will do today.

John: Risk log. Anything new?

Dave: Calendar invite for the Runyon walkthrough conflicts with the
6/15 deploy window. We need to either move the walkthrough or stagger
the deploy.

John: Move the walkthrough. I'll talk to Runyon. Anthony, can you sync
with their team on a replacement slot?

Anthony: Yes. I'll send options by EOD.

John: Anything else?

Lindsay: One — I want to flag that we're underinvested on partner
documentation. Coral keeps asking for an SDK guide and we don't have
one. Can we scope this for Q3?

John: Open question for the planning offsite. Add it to the agenda.

Lindsay: Will do.

John: OK that's it. Action items: Anthony — Coral comms + replacement
walkthrough slot. Dave — POP MVP API spec to 100% by Friday. Lindsay —
redirect Greg + update sprint board, add SDK guide to Q3 agenda. I'll
talk to Runyon on the walkthrough. Anything else?

Dave: All good.

John: Thanks all.

## Action Items

- [ ] Anthony: loop in Coral architect today, confirm signed JWT path
- [ ] Anthony: send Runyon walkthrough replacement-slot options by EOD
- [ ] Dave: POP MVP API spec to 100% by Friday
- [ ] Lindsay: redirect Greg from migration cleanup to persona-three dashboards
- [ ] Lindsay: update sprint board with Greg redirect
- [ ] Lindsay: add SDK guide scoping to Q3 planning agenda
- [ ] John: talk to Runyon about moving the 6/15 walkthrough

## Decisions Made

- Coral partner API uses signed JWT auth with our-side rotation tooling (avoids pushing Coral's sprint).
- Move Runyon walkthrough to avoid the 6/15 deploy conflict.
- Greg redirect from migration cleanup approved; migration work paused for the sprint.

## Learnings

- React migration cleanup consistently eats more days than estimated — flag for retro.
- Partner integrations need an SDK guide as standard scope, not afterthought.
