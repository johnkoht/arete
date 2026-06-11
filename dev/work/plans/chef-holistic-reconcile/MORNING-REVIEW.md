# Morning review packet — 2026-06-10 overnight run

Everything below was produced overnight per your ask: investigate F1 properly,
plan it with solid ACs + testing strategy, pre-mortem, then independent review.

## What's in the package (read in this order)

1. `../single-pass-extraction/plan.md` — extraction refactor (revised ×3 tonight)
2. `../single-pass-extraction/benchmark-evidence.md` — ground-truth corpus
3. `plan.md` (this dir) — chef holistic reconcile (the F1 big feature)
4. `pre-mortem.md` — 18 risks across both plans, verdict: ship-with-changes
5. `review.md` — independent critique, verdict: REQUEST-CHANGES
6. This file — disposition of every finding

## Already fixed in the plans (no action needed)

From the pre-mortem:
- ✅ Approval-volume control: tier-derived auto-approval (blocker only) + AC11
  approval budget gating the mode flip (SP)
- ✅ Sequencing: W4 view ranking now lands BEFORE the default-mode flip (SP)
- ✅ Silent-drop enumeration: the 0.65 confidence `continue` and friends must
  persist-or-die; `## Parser-dropped` visibility contract preserved (SP W3)
- ✅ Consumer-audit list corrected (draft cited nonexistent files); W1 now
  starts with a fresh grep-verified inventory (SP)
- ✅ W7 shadow soak redesigned: pre-reconcile raw extraction snapshots so the
  shadow engine sees the unmutated day (CHR)
- ✅ AC6 measures false collapses two ways incl. sampled re-audit (CHR)
- ✅ Degraded-mode contract for SP-rollback-during-CHR (CHR)

From the review:
- ✅ CRITICAL: priorItems "skip these" exclusion framing → rewritten to
  mark-don't-skip; new AC6 inverse fixture (superseding item must be
  RE-emitted) (SP)
- ✅ CRITICAL: threshold-unity test scoped to nomination only — no longer
  force-deletes Rule 4's deliberate 0.6/uncertain band (CHR)
- ✅ AC6 "or explained" escape hatch deleted — 0/10 hard bar (CHR)
- ✅ Jira: VERIFIED no Atlassian MCP connector in your environment → W3
  deferred out of v1 entirely; engine ships with display-only posture (CHR)

## Open calls — yours to make in the morning

1. **Reviewer's "Stage-0" proposal (the big one).** A simpler interim step
   both I and the pre-mortem missed: move the EXISTING `reconcileMeetingBatch`
   call from per-file extract time to one day-level call at winddown Step 2.
   Kills collapse-to-oldest in days, not weeks, with zero new machinery — then
   the full engine replaces it. Recommend: YES as a fast first PR inside CHR
   (becomes W0), unless you'd rather not touch the old code twice.
2. **Cut or pin SP-W6 (agentic tool loop).** Reviewer: it's unsequenced
   relative to the CHR soak and the benchmark shows Layer 1 alone wins.
   Recommend: pin explicitly after CHR-W6, or cut from SP and fold into a
   later plan.
3. **Reviewer's eval-rigor asks** (gameable ACs): commit the ground-truth
   manifest + scorecards to the plan dir (vs. session transcript), write a
   judge rubric for AC7's "≥ B+", one full-meeting HUMAN audit per gate, p90
   (not median) for the AC11 approval budget. All cheap; recommend taking all
   four.
4. **Soak abort triggers.** Neither plan defines when a soak auto-aborts
   (e.g., "3 winddowns >N min ⇒ revert flag"). Recommend adding to W7 + SP
   soak. Your winddown is the test rig — you set the pain threshold.
5. **Pre-mortem fold-ins I dropped** (reviewer caught ~9 unaddressed
   checkboxes in pre-mortem.md's checklist — e.g., weekly decoupling, soak
   event minima, D4 permanent telemetry, cost AC, W1.5 negative AC,
   open_questions surfacing). Each needs a fold-in or an explicit "rejected
   because" line. I did not adjudicate these unilaterally; the checklist is in
   pre-mortem.md §mitigations.
6. **Calendar reality.** Reviewer estimates 7–10 weeks end-to-end given the
   two sequential soaks, with your nightly winddown as the test rig
   throughout. If that's too slow, the levers are: Stage-0 first (immediate
   relief), shorter SP detector soak (2wk → 1wk), parallel W5 eval work.

## One-paragraph status

Both plans are drafted, pre-mortemed, independently reviewed, and revised
twice (pre-mortem fold-ins + the review's critical fixes). The remaining
review verdict is REQUEST-CHANGES on items that are either your judgment
calls (above) or cheap rigor additions — nothing structural is contested.
Nothing is committed to git yet.
