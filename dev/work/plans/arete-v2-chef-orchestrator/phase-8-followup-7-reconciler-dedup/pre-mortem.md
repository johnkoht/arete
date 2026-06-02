---
title: "Phase 8 followup-7 — pre-mortem"
slug: phase-8-followup-7-pre-mortem
created: "2026-06-01"
parent: phase-8-followup-7-reconciler-dedup
---

# Pre-mortem

If Rule 4 ships and 2 weeks later we say "that was a mistake," what
would have caused it?

## R1 — Silent over-dedup drops fresh captures

**Failure mode**: Rule 4 collapses a freshly-extracted action item
against an open commitment that is **textually similar but semantically
different** (e.g., "Send Anthony the API spec" → 0.75 Jaccard against
"Send Anthony the design doc"). The fresh capture is silently skipped;
user never sees it; the original commitment was for a different
artifact entirely. Two weeks later, the user notices the new ask was
never tracked.

**Mitigation**:
- Conservative threshold (0.7, stricter than `reconcile()`'s 0.6).
- Direction guard prevents the most-common mirror-pair false-collapse.
- All Rule 4 collapses are **PROPOSED**, never auto-executed (AC4 from
  Phase 8 review-1 C3 carries forward — uniform-proposed surface).
- Fuzzy band (0.5 ≤ Jaccard < 0.7) goes to `## Uncertain`, not
  silently dropped.
- Soak window: first 7 winddowns the user spot-checks each Rule 4
  proposed-collapse against the named commitment to confirm semantic
  match.

**Residual**: medium. Detection latency is real — a missed capture
surfaces days/weeks later when the user expects it on a task list and
doesn't find it. The proposed-collapse review surface catches this AT
collapse time, but only if the user actually reads the CT line
carefully. The 14-day Phase 8 soak window already conditions the user
toward `all`-approval muscle memory.

## R2 — Threshold tuning wrong (0.7 too strict / too loose)

**Failure mode**: 0.7 is a guess informed by `reconcile()`'s 0.6 + a
conservative bump. Real-world distribution may peak at 0.65 (Rule 4
under-fires; bug persists) OR at 0.75+ (Rule 4 over-fires; R1
recurs).

**Mitigation**:
- Plan locks 0.7 as starting point + names threshold-revisit as a
  parking-lot item explicitly contingent on soak findings.
- Test asserts the threshold literal in SKILL.md prose, so a future
  tuning shows up as a deliberate prose edit (auditable in git
  history), not a silent drift.
- Soak metric: count of Rule 4 proposed-collapses approved vs
  rejected. If reject-rate > 30% over 7 days, threshold needs raising.
  If user manually creates duplicates (Rule 4 didn't fire when it
  should have) over 7 days, threshold needs lowering.

**Residual**: medium. Threshold tuning is iterative; the first
production threshold is unlikely to be the right one. But the
revert+adjust loop is bounded (one SKILL.md prose edit).

## R3 — Recurring-item false positives (weekly standing actions)

**Failure mode**: a cadence intent ("send the weekly status update to
Anthony") matches the prior week's open commitment with ≥0.7 Jaccard.
Rule 4 collapses today's fresh intent against last week's still-open
commitment. The user has TWO weekly status updates to send, but Rule
4 thinks they're the same one. Last week's gets resolved when the
user marks today's done; the prior obligation silently lapses.

**Mitigation (partial)**:
- Direction guard catches the mirror-pair case but does NOT catch
  this. Both are `i_owe_them` to the same person with similar text.
- Possible mitigation in soak: add a **time-since-creation gate**
  (only collapse against commitments < 5 days old, say) as a
  follow-up if R3 fires in production.
- Recurring-meeting cadence items are called out in the plan's
  parking lot for soak observation.

**Residual**: high for John specifically — he runs weekly 1:1s with
~5-7 people, several with recurring action items. This is the most
likely production failure mode for Rule 4. The plan acknowledges this
in the parking lot but does NOT ship a fix in followup-7 — soak
findings drive the v2 mitigation.

## R4 — Rule-order collision with Rule 1 fulfillment evidence

**Failure mode**: A fresh intent matches both:
- An open commitment (Rule 4 ≥ 0.7 Jaccard) → collapse to commitment
- A slack message sent today (Rule 1 fulfillment evidence)

Rule 4 fires first (per F7-D3 order). The intent collapses against the
commitment, NOT against the slack fulfillment. User sees CT4 "skip
staging — already tracked as commitment X" but the user actually JUST
FULFILLED that commitment via slack today; the right action is
`arete commitments_resolve X --reason "fulfilled via slack today"`,
not "skip staging."

**Mitigation**:
- Rule 4 prose explicitly notes the rule-order interaction: when Rule
  4 collapses against an open commitment, the chef SHOULD also check
  if that commitment is itself a Rule 1 candidate in the same loop
  ledger. If yes, propose the **Rule 1 collapse** (resolve commitment
  + cite slack fulfillment), not the Rule 4 collapse (skip stage). 
  This is a cross-rule join, but bounded — Rule 4's match output
  carries the commitment ID, and Rule 1 already scans for fulfilling
  actions against open commitments.
- Build-report sub-orch verifies this cross-rule prose is present.

**Residual**: medium. The cross-rule join is the kind of thing that
sounds clean in prose but takes the agent more reasoning steps per
loop. Risk is the agent picks one or the other without the join.
Soak surface: user notices "you said skip-stage but I actually did
this on slack" — auditable, recoverable.

## R5 — Direction guard insufficient for mirror-pair case

**Failure mode**: parser bug emits a mirror-pair where the DIRECTION
of one commitment is wrong (e.g., compound sentence wrongly extracts
`personSlug=john-koht direction=i_owe_them` for what should have been
`direction=they_owe_me`). Rule 4's direction guard now MASKS the
mirror-pair issue: a new outgoing-ask matches the broken (wrong-
direction) mirror-pair commitment because both are
`direction=i_owe_them`. Rule 4 collapses; the wrong-direction
duplicate persists in `commitments.json`; mirror-pair cleanup is now
deferred indefinitely.

**Mitigation**:
- Track Phase 5 parser-bug fix as the structural solution. Rule 4 is
  symptomatic relief, not structural.
- The Step 4 batch-resolution rules (already in SKILL.md) call out
  parser-bug mirror-pairs explicitly. Rule 4 SHOULD NOT collapse
  against a known mirror-pair commitment; if the chef can detect a
  mirror-pair pattern (e.g., same text + same person + opposite
  direction both open), exclude it from Rule 4 candidate set.
- Soak window: user can manually flag any mirror-pair-masked
  collapse; track as "Rule 4 over-collapse against parser-bug data"
  failure mode.

**Residual**: low-medium. Mirror-pairs are a known issue with a
structural fix planned (Phase 5). Rule 4's interaction with the bug
is annoying but bounded.

## R6 — Agent confusion: 4 rules harder to apply than 3

**Failure mode**: the chef agent (LLM) reasoning over a single loop
now must consider 4 rules + tier placement + reason labels + cross-
rule joins (per R4). Each additional rule increases the chance of
agent reasoning errors — applying the wrong rule, applying multiple
rules where one should win, missing a rule entirely. The 3-rule
Phase 8 baseline is the calibrated quality bar; adding a 4th rule
without empirical validation is a quality-regression risk.

**Mitigation**:
- Rule 4 prose is **explicitly shorter and simpler** than Rules 1-2
  (no MCP resolution chain, no calendar attendee logic — just
  Jaccard + direction guard against an already-fetched list).
- Rule order (3 → 4 → 1 → 2) puts the two cheapest, most-mechanical
  rules first. Agent applies them as a pre-filter before reasoning
  about Rules 1+2.
- Per-rule prose explicitly states "evidence required" + "fuzzy →
  Uncertain" + "no auto-execute". Reinforces conservative-collapse
  framing.
- Soak validates: if reconciler quality drops, revert is one commit.

**Residual**: low. The chef pattern has shipped 5+ rules of judgment
across other skills (Step 0.5, 0.6, 0.7, 1, 2, 3, 4 in
daily-winddown alone). Adding one more bounded rule is incremental.

## What's the single most likely thing to go wrong?

**R3 — recurring-item false positives**. This is the failure mode
John's actual workflow most directly exposes (weekly 1:1s, recurring
deliverables). The mitigation in followup-7 is partial; the real fix
is the time-since-creation gate flagged in the parking lot, deferred
to soak findings.

**Detection signal**: user marks a Rule 4-collapsed commitment as
resolved, but the underlying obligation persists (a fresh weekly
status report wasn't actually sent). User notices the lapse and
files diary entry "Rule 4 over-collapsed against my weekly cadence."

**Triage**: revert followup-7 OR ship a v2 with the time gate (≤5
days old open commitments only) — fast-follow within the same week.

## Adjacency to mirror-pair plan (cross-reference)

This pre-mortem deliberately does NOT try to solve mirror-pair —
that's a separate plan track (parser bug in Phase 5). Rule 4
INTERACTS with mirror-pair (R5) but does not depend on or block its
fix. The two plans can land independently. If mirror-pair lands
first, Rule 4's false-positive surface shrinks. If Rule 4 lands
first, mirror-pair is still the structural cause.
