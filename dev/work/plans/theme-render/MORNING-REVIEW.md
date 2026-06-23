# Theme-render — morning review packet (2026-06-19)

Overnight: drafted `plan.md`, ran a pre-mortem + an independent critique, and verified the one
load-bearing claim that disagreed across them. Read order: this file → `plan.md` (corrected) →
the two raw reviews are in the agent transcripts if you want them. Nothing built — this is a plan.

## TL;DR
- **Both reviewers: the architecture is right.** Pre-mortem = SHIP-WITH-CHANGES; critique =
  APPROVE-WITH-CHANGES. The core bet (D4: meeting-scoped anchors → reuse the W4 apply machinery
  unchanged) is **verified TRUE at the apply layer** — provably grouping-agnostic.
- **The biggest improvement is a scope reframe:** ship **v1 coarse** — whole-meeting → dominant
  theme — using the *already-shipped* Step-2.0 / `writeMeetingTopicsToFile` surface, and defer
  item-level assignment + cross-cutting decomposition to v2. This gets the #22 supersession prize
  soonest with **zero new plumbing**, and dissolves the single biggest risk both reviews raised.
- **One reviewer "blocker" REJECTED on evidence:** the "meeting `date:` is date-only → ordering
  broken" claim is false for the live data (75/75 meetings have full datetime; verified). Moot fix
  and D5 stand. Reclassified to a cheap defensive fallback.

## The verification that overrode a review
Critique B1 called the timestamp substrate the "#1 build blocker" — meeting `date:` is date-only
(`.toISOString().slice(0,10)` in `krisp/save.ts:67` et al.), so same-day meetings can't be ordered,
breaking AC1 + the moot fix. **I checked the real workspace: all 75 recent meeting files carry a full
datetime (`2026-06-01T19:00:00.000Z`), none date-only.** The cited importers are not the live
MCP-pull path. So D5/AC1 are sound and the shipped moot fix is sound. **Defensive kernel kept:** the
codebase DOES have date-only importers, so the chronological logic should fall back gracefully
(staging order + Slack epoch) if a meeting ever lacks a time — added as a note, not a blocker.

## Headline recommendation — v1 = COARSE assignment (my strong rec, both reviews concur)
The plan's W1 framed item-level assignment as "extend Step-2.0." Both reviews found that's actually a
**new B-2-sized surface**: there is no `item→theme` map today; `meeting topics` /
`writeMeetingTopicsToFile` are meeting-level. Item-level needs a new `staged_item_theme` frontmatter
map + parser + cleanup-filter wiring (the finding-#12 orphan trap) + verb + renderer read.

**Reframe:** v1 assigns the **whole meeting to its dominant theme** (reusing the shipped meeting-level
`topics:` surface verbatim — no new plumbing) → cluster → within-theme chronological reconcile →
theme render. That delivers supersession-by-construction (the actual #22 prize) immediately, and
defers the expensive/risky item-level split + decomposition (W4) to v2. A cross-cutting meeting in v1
lands all its items on one theme — which is exactly what coarse assignment does anyway, so no payoff
is lost by deferring. This also sidesteps the meeting-`topics:`-vs-per-item coexistence gap (B3).

## Disposition of every finding

**APPLIED to plan.md tonight (factual corrections — so you're not reading wrong claims):**
- **D4 prose corrected** — apply-reuse is verified TRUE; the render IS a real rewrite (ChecklistView
  is meeting-keyed: new theme-grouped view type + render fn + re-homed FYI/Your-call/tier-sort).
  "Render only groups them" was an over-claim; W3 is scoped honestly now.
- **D5 timestamp claim corrected** — datetime confirmed present on the live path (75/75); added the
  date-only defensive fallback note.

**RECOMMENDED revisions (teed up here; I'll apply on your nod — they restructure work-items):**
1. **Coarse-first v1** (above) — re-sequence W1 to meeting-level assignment; move item-level +
   decomposition to a v2 section. [Biggest change; both reviews + me agree.]
2. **`## Uncategorized` = structural default, not a judgment outcome** (pre-mortem R2 + critique) —
   the render iterates the FULL staged-item set and routes any item with no/invalid theme to
   Uncategorized, so silent loss is impossible by construction (mirrors how apply surfaces unknown
   anchors as warnings, never drops). **New AC: count-conservation** — every staged item appears in
   exactly one section. *This is the single most important missing AC.*
3. **Keep open-commitment dedup GLOBAL** (pre-mortem R10) — theme-scope only supersession/moot; Rule-4
   dedup retains CHR's all-commitments scope, else a cross-theme duplicate commitment escapes (a
   latent regression against the CHR contract). Reconcile with #20 before W2 freezes.
4. **False-supersession AC** (pre-mortem R3) — a fixture where a later item refines a *different
   facet* → BOTH survive, neither marked superseded (the silent-loss twin of W4's AC-A2). Superseded
   items must stay `[ ]`-with-reason **carrying anchors** so a wrongly-superseded item is
   re-elevatable via the apply rescue path.
5. **Define meeting-`topics:` ↔ assignment coexistence** (critique B3) — moot under coarse-first
   (assignment == the meeting `topics:`/dominant theme, same object); revisit when item-level lands.
6. **Name the theme-grouped render data model + AC that anchors are byte-identical** (critique B4).
7. **Cheap adds:** AC3 assignment-accuracy threshold (≥90% on-label, 0 lost); AC8 latency ≤ +20%
   (inherit CHR, kill the `+X%` placeholder); cross-mode baseline-grouping invariant test; per-line
   provenance label in the theme narrative (R7); soak degenerate-distribution alarm (>70% one theme
   or >40% misc → flag — catches "reverted to per-meeting narration"); explicitly **punt cross-day
   supersession** (today's item reversing a memory item from last week) to avoid scope creep.

**REJECTED (with reason):**
- Critique B1 "timestamp blocker" → rejected; live data has datetime (verified 75/75). Kept only the
  defensive-fallback note.

## My answers to your 4 open questions (both reviews + my read)
1. **Assignment granularity → COARSE first (whole-meeting → dominant theme), item-level in v2.**
   Reuses shipped plumbing, gets #22 soonest, de-risks B2/B3. Strong rec.
2. **Misc/emergent → flag-only, conservative:** one `## Uncategorized` nudge per emergent *cluster*,
   suppressed if it recurs unactioned (don't re-nag daily). Never auto-create projects.
3. **Render shape → per-theme decisions/actions/learnings + ignored, with the ARC INLINE at the
   superseded item** (not a trailing "superseded" block — the whole point is seeing the flip in
   context). I'll draft a concrete mock and make it the golden fixture's expected output, so AC1 is
   literally a diff against the mock.
4. **v1 scope → ship W1–W3 coarse + defer W4 decomposition.** Correct, and pairs with #1: "single
   theme per item" in v1 = whole-meeting→dominant, NOT item-level-without-decomposition (which is the
   worst of both — new plumbing, no cross-cutting payoff).

## What's genuinely strong (don't lose it)
- D4's apply-layer bet is real and verified → honest flip-the-flag rollback, no data migration.
- Shadow-soak + golden-replay gating (W6, mirroring CHR) is the right discipline.
- Misc-bucket "never silently drop" is the correct safety valve for the #1 risk (make it structural).
- "Supersession is fragile *because* we extracted per-meeting" is the correct root-cause framing —
  the architecture follows from it.

## Decisions I need from you
- **Greenlight coarse-first v1?** (drives the W1–W4 restructure)
- **Render mock** — want me to draft the per-theme doc layout (arc-inline) for you to react to before
  any build?
- Then I apply the recommended revisions, and we decide build timing.
