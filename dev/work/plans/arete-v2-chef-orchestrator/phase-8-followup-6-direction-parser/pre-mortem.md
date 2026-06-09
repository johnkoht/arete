---
title: "Phase 8 followup-6 — pre-mortem"
slug: phase-8-followup-6-pre-mortem
created: "2026-05-27"
parent: phase-8-followup-6-direction-parser
---

# Pre-mortem

If 8f6 ships and 2 weeks later we say "that was a mistake," what would have
caused it?

## R1 — Dedup false-positive drops a legitimate bilateral pair

**Failure mode**: a real meeting produces two genuine action items —
"John to send the proposal" (i_owe_them, owner=john-koht) and
"Anthony to review the proposal" (they_owe_me, owner=anthony-avina) —
that happen to have near-identical descriptions (Jaccard ≥ 0.85 because
"proposal" + "the" + structural words dominate the word set). AC2's
mirror-pair dedup silently drops one. The user never knows; only one
commitment surfaces; the other person's accountability vanishes.

**Mitigation**:
- AC2 logs every drop in `validationWarnings[]` — surfaced in meeting
  extract output. User sees what was dropped at curate-time and can
  add it back.
- AC5 eval (re-extract 2026-05-27 meetings) catches false-positives
  before merge if the threshold is too loose.
- Jaccard 0.85 is conservative; legitimate bilateral pairs typically
  differ in verb ("send" vs "review") which drops similarity below 0.85.
- Heuristic prefers `i_owe_them` (owner-actionable) — the kept side is
  always the user's commitment, so the worst case is "user thinks they
  owe Anthony review, but actually Anthony owes them review" — the
  symmetric version, still surfaces as a tracked item.

**Residual**: subjective. If AC5 surfaces even one false-positive on the
8 known-good meetings, threshold ramps to 0.9 or pattern reverts.

## R2 — Pattern 4 prompt block is ignored by the LLM

**Failure mode**: the prompt addition (AC1) doesn't propagate — Sonnet
keeps emitting mirror pairs at the same rate, and the dedup pass (AC2)
becomes the sole line of defense. Not a regression, but the
defense-in-depth argument weakens to defense-of-one.

**Mitigation**:
- AC2's deterministic pass is the load-bearing fix. Prompt addition is
  belt-and-suspenders.
- AC5 measures mirror-pair count pre-prompt vs post-prompt
  (out-of-loop, on the raw LLM output before dedup) — observable signal
  on prompt efficacy.
- If prompt ineffective: tune via a worked example. If dedup catches
  100%, prompt drift doesn't matter.

**Residual**: acceptable. Prompt is documentation, dedup is the contract.

## R3 — Jaccard threshold 0.85 is wrong for actual data

**Failure mode**: real mirror pairs hit Jaccard 0.7-0.8 because the LLM
paraphrases ("John to contact compliance" vs "John needs to talk to
compliance team about issue"). Dedup misses them. Mirror-pair volume
persists; SKILL.md stopgap continues to be the catch.

**Mitigation**:
- AC5 eval directly measures detection rate on the 2026-05-27 meetings
  (~10 known pairs). If detection rate < 90%, tune threshold down to
  0.75 or 0.7. Document tuning rationale in build-report.md.
- Test T4 (ambiguous case) gives signal on how the helper behaves
  near-threshold.
- SKILL.md stopgap (AC4) retained as final catch.

**Residual**: tuning iteration is bounded; eval surfaces the answer in one
re-extract pass.

## R4 — AC5 reveals the bug isn't (just) mirror pairs

**Failure mode**: re-extracting the 2026-05-27 meetings shows the
extractor is also emitting (a) duplicate same-direction items the dedup
misses, (b) self-referential `i_owe_them` items where owner_slug ==
counterparty (the original feedback called these out — "self-referential
i_owe_them duplicates"), or (c) Pattern 1-3 violations the existing
prompt should catch but doesn't. Scope creep risk.

**Mitigation**:
- The plan's AC2 helper is narrowly scoped: mirror-direction +
  different-slug + near-identical. It WON'T fix (b) self-referential
  same-slug items.
- If AC5 reveals (b) or (c), document as separate followups (8f7,
  8f8); do NOT expand 8f6 scope. The mirror-pair fix is independent
  and ships on its own merits.
- Self-referential `i_owe_them` (where owner_slug == counterparty_slug)
  could be a 1-line additional check in `meeting-extraction.ts:1262`
  validation — out of scope for 8f6 but trivial follow-up.

**Residual**: bounded by discipline. Don't bloat 8f6.

## R5 — Ambiguous case (neither slug is owner) is more common than expected

**Failure mode**: AC2 step 4c (ambiguous: keep `a`, log both) fires
often because many meetings discuss third-party action between two
non-owner people ("Sara to send Mark the data"). The "keep first, log
both" heuristic effectively becomes "keep arbitrary, log both" — surfaces
noisy warnings without resolving direction.

**Mitigation**:
- For non-owner mirror pairs, the verbatim-actor heuristic (description
  begins with owner-stem) is actually the better signal than which slug
  matches the user.
- Re-order step 4: try verbatim-actor heuristic FIRST, owner-match
  second, arbitrary last. Document order in code comment.
- If ambiguous-case volume exceeds clear-case in AC5 eval, treat as a
  signal that the heuristic needs rethinking; punt the helper to "log
  but don't drop" mode (validation warning surfaces both, user decides).

**Residual**: the helper can fail open (log without drop) without
breaking anything; existing chef stopgap catches what dedup leaves.

## What's the single most likely thing to go wrong?

**R1 (false-positive on legitimate bilateral)**. The other risks have
deterministic mitigations (eval signals, threshold tuning, scope discipline,
fail-open path). R1 is the one where the user might never notice the bad
drop — silent failure of "Anthony to review the proposal" vanishing means
the user thinks the commitment doesn't exist. Mitigation is the
`validationWarnings[]` log surfaced at extract time, but only if the user
reads it.

**Concrete check at AC5**: include "validationWarnings is non-empty —
review each drop" as an explicit step in the build-report's AC5 section.
If the user signs off on the drops on the 2026-05-27 set, the threshold is
likely correct.
