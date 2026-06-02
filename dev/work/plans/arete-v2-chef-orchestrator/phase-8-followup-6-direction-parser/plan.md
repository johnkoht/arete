---
title: "Phase 8 followup-6 — direction-parser mirror-pair fix"
slug: phase-8-followup-6-direction-parser
created: "2026-05-27"
revised: "2026-06-01 — post review-1"
parent: arete-v2-chef-orchestrator
owner: meta-orchestrator (Claude)
status: revised-post-review-1
---

## Revisions from review-1 (eng-lead, 2026-06-01)

- **C1 [HIGH]**: AC5 eval is one-sided (false-negative only). Added **AC5b**: contrast set of 5-10 historical meetings with hand-labeled legitimate bilateral pairs (or synthetic test fixtures). Re-extract; confirm ZERO false-positive drops. Without this, eval cannot detect R1 (false-positive on legitimate bilateral).
- **C2 [MED]**: Jaccard threshold raised from 0.85 to **0.90**. Mirror-pair text pathology is "identical or near-identical" (likely ≥0.95 in structural-failure case); tighter threshold = fewer false-positives on legitimate bilateral pairs at minimal catch-rate cost. If AC5 catches <100% at 0.90, ratchet down with logged rationale.
- **C3 [MED]**: Added explicit AC: confirm `validationWarnings[]` entries with `reason: 'mirror-pair duplicate'` render VISIBLY in chef-curated meeting view (not buried in JSON). R1 mitigation depends on user seeing the drops; verify the surface.
- **C4 [MINOR]**: Step 4 ordering fixed — verbatim-actor heuristic runs FIRST, owner-match second, arbitrary third (per pre-mortem R5 mitigation). Plan body now matches pre-mortem.

# Phase 8 followup-6 — direction-parser mirror-pair fix

## Why this exists

The Phase 3.5 followup-3 stopgap (chef SKILL.md batch-resolution prose for
mirror-pairs) assumed pair volume would be ~5/day. Today's Phase 8 winddown
(2026-05-27) generated ~10 pairs across 8 approved meetings — defeating the
"engage once at curated view" win because the user had to do a 10-item batch
drop AFTER curated engagement. Pattern recurrence: 2026-05-14 (11 pairs),
2026-05-15 (11 pairs), 2026-05-27 (10 pairs). Stopgap is leaking; the bug
must be killed at the source.

**The bug**: when a compound transcript sentence names two actors
(e.g., "John to reach out to compliance, then follow up with Anthony"),
the extraction LLM emits TWO `action_items[]` entries — one
`direction=i_owe_them owner_slug=john-koht counterparty=compliance` AND one
`direction=they_owe_me owner_slug=anthony-avina` with identical or near-identical
verbatim `description`. Both pass validation, both flow to person-files,
both create commitments. `arete meeting extract --reconcile` tiers them
"LOW relevance, no matches" because the bug is intra-meeting (same source) —
the cross-person dedup at `entity.ts:1431-1454` only suppresses owner-self
duplicates, not mirror pairs across two non-owner counterparties.

**One-line goal**: zero mirror-pair commitments per approved meeting, with
the canonical direction preserved and the duplicate dropped at staging time.

## Scope discovery (informs ACs)

Code-read findings:

- **Extraction prompt**: `packages/core/src/services/meeting-extraction.ts:934-1058`.
  `buildMeetingExtractionPrompt()`. The "Consolidation — emit ONE item per
  unit of work" block (lines 991-1006) covers Pattern 1 (handoff chains),
  Pattern 2 (collaborative initiatives), Pattern 3 (same-outcome-different-verbs)
  — but does NOT have a "compound-sentence mirror-direction" anti-pattern.
  This is the prompt gap.
- **Validation pass**: `meeting-extraction.ts:1217-1287`. Per-item filtering
  (garbage, trivial, valid direction) but no cross-item awareness. This is
  where a post-LLM dedup pass could detect mirror pairs in the raw
  `action_items[]` array.
- **Apply path**: `meeting-apply.ts` writes `Staged Action Items` to the
  meeting body. Items move to `## Approved Action Items` on user approval
  (chef-curated). No dedup at apply or approve time.
- **Cross-person dedup (existing)**: `entity.ts:1431-1454`. Suppresses
  owner self-reminders when bilateral entries exist under the counterparty.
  Scoped to same-source. Pattern is `(normalizedText, source)` keyed.
  Does NOT cover mirror pairs (two non-owner slugs with opposite directions).
- **Commitment creation**: `commitments.ts:530-574` `sync()` is hash-keyed
  on `(text + personSlug + direction)` — so a mirror pair has DIFFERENT
  hashes (different personSlug and direction), so dedup doesn't fire.
- **Existing test for dedup**: `person-memory.test.ts:605-734` covers
  bilateral owner-self-reminder suppression. No test for mirror pairs
  across two counterparties.
- **Stopgap doc**: `daily-winddown/SKILL.md:755-768` batch-resolution rules.

**Scope is bounded**: 1 prompt block to add (extract), 1 dedup pass to add
(extract validator), 1 SKILL.md stopgap block to retire (or keep as belt-
and-suspenders), tests at both surfaces.

## Surface decision: **C (combined, extract-side defense-in-depth)**

**A (prompt-only)** — risk of LLM-prompt-tweak unreliability; mirror-pair
emission is a structural failure mode that prompt language alone can't
guarantee against.

**B (approve-time dedup only)** — would work, but adds judgment to
meeting-apply.ts which is currently a pure pipe-through. Apply runs AFTER
the user has already approved the staged list — by then the user has
already seen the duplicate. Moving dedup to apply means staged-section
output still shows mirror garbage that the user must engage with at
curate-time.

**C (both, extract-side)** — fix the prompt (best-case prevention) AND add
a deterministic post-LLM dedup pass inside `extractMeetingIntelligence`
BEFORE items reach `actionItems[]`. The dedup pass runs on the raw
`action_items[]` array returned by the LLM, detecting:
- Identical-or-near-identical `description` text (normalized + Jaccard ≥ 0.85),
- Opposite `direction` values,
- Different `owner_slug` values (i.e., mirror pair, not the existing same-owner
  same-direction dedup),
- (At least one slug is the workspace owner OR both slugs are mentioned
  with opposite directions — distinguishes mirror-pair from genuine bilateral
  ask.)

When detected, keep the canonical one (the one where `owner_slug` matches
the actor in the verbatim sentence — heuristically, where description begins
"<owner> to ..." or "<owner> will ...", which matches Areté's existing
verbatim-action convention). If ambiguous, keep `i_owe_them` when owner_slug
== workspace owner (the actionable direction); else keep `they_owe_me`.

**Pros**: deterministic backstop (catches what prompt misses); fixes at
source (no garbage in staged section); SKILL.md stopgap can retire (or
remain as final-stage belt-and-suspenders).
**Cons**: dedup heuristics need tuning; mis-classification could drop a
legitimate bilateral.

Mitigation for false-positive: log every mirror-pair drop to
`validationWarnings[]` (existing channel) so the user sees what was
suppressed and can adjust. Threshold tuning happens via the same channel.

## Scope (acceptance criteria)

### AC1 — Extract prompt: add Pattern 4 mirror-direction anti-pattern (GATE)

`meeting-extraction.ts:991-1006` (Consolidation block). Add Pattern 4:

> **Pattern 4 — Compound sentence with mirror direction.** A single sentence
> naming TWO actors with one verb and one object is ONE action item, not two.
> The direction is relative to the workspace owner; if the owner is one of
> the actors, emit `i_owe_them` (owner owes the other). If the owner is
> neither actor (third-party observation), emit ONE item with the actor as
> owner_slug.
> ✗ BAD: ai_001 "John to reach out to compliance" (direction: i_owe_them,
>   owner: john-koht) + ai_002 "John to follow up with Anthony" (direction:
>   they_owe_me, owner: anthony-avina) — these are the SAME sentence split
>   into mirror items.
> ✓ GOOD: ONE item: "John to reach out to compliance, then follow up with
>   Anthony" (direction: i_owe_them, owner: john-koht).

Rationale prose added to "Direction is relative to workspace owner" rule
(line 1051): explicitly forbid mirror-direction pairs from a single sentence.

### AC2 — Extract validator: deterministic mirror-pair dedup pass (GATE)

`meeting-extraction.ts:1217-1287`. After the per-item validation loop (the
existing `for (const item of raw.action_items)` block populates `actionItems[]`),
add a post-pass `dedupMirrorPairs(actionItems, ownerSlug, validationWarnings)`
that:

1. For each pair `(a, b)` in `actionItems` where `a.direction !== b.direction`:
2. Compute `jaccard(normalize(a.description), normalize(b.description))`
   using the existing normalize helper (lowercase, strip non-alphanum, split
   words).
3. If `jaccard ≥ 0.85` AND `a.ownerSlug !== b.ownerSlug`:
4. Determine canonical via:
   a. If exactly one of `a.ownerSlug` / `b.ownerSlug` equals `ownerSlug`
      (workspace owner): keep the one where owner is actor + direction is
      `i_owe_them` (i.e., the owner's commitment to the other party).
   b. Else: keep the item whose `description` begins with `ownerSlug`-stem
      (verbatim-actor heuristic).
   c. Else (ambiguous): keep `a`, log both in `validationWarnings`.
5. Drop the non-canonical item from `actionItems[]`; record
   `{ item: dropped.description.slice(0,50)+..., reason: 'mirror-pair duplicate (kept canonical)' }`
   in `validationWarnings[]`.

Helper lives in `meeting-extraction.ts` (alongside `isGarbageItem` etc.).
Pure function, no I/O. Threshold (0.85) extracted as a named constant
`MIRROR_PAIR_JACCARD_THRESHOLD` for testability.

### AC3 — Tests: extraction-level mirror-pair dedup (GATE)

`packages/core/test/services/meeting-extraction.test.ts`:
- T1: two action items with mirror direction, identical text, different
  slugs (one is owner) → one survives, canonical = owner's i_owe_them, the
  other recorded in `validationWarnings`.
- T2: two items, same text, same direction, different slugs → both survive
  (genuine bilateral, not a mirror pair).
- T3: two items, opposite direction, but Jaccard 0.4 (genuinely different
  asks) → both survive.
- T4: two items, opposite direction, near-identical text, neither slug is
  owner → falls into ambiguous branch; keep `a`, log both.
- T5: regression — single-item extraction unchanged.

Run via `cd packages/core && tsx --test test/services/meeting-extraction.test.ts`.

### AC4 — SKILL.md stopgap status update (GATE — light touch)

`packages/runtime/skills/daily-winddown/SKILL.md:755-768`:
- Mark the "Batch-resolution rules (parser-bug mirror-pairs — stopgap until
  Phase 5)" block as **legacy** / **belt-and-suspenders**. New header:
  "Batch-resolution rules (parser-bug mirror-pairs — extraction-side fix
  in Phase 8 followup-6; this remains as defense-in-depth for any
  pre-existing or escaped pairs)."
- Keep the rules themselves (one-line surface + single batch action). They
  serve any rare escape past AC2 + existing pre-fix commitments still in
  the workspace.

### AC5 — Eval / observation: verify post-fix mirror-pair rate (GATE)

After build + merge:
- Re-extract the 8 meetings from 2026-05-27 (the day that triggered this
  followup) with the new extractor. Manually compare the action_items[] to
  the pre-fix output. Expected: zero mirror-pairs survive.
- If even one mirror-pair survives, surface the case + tune threshold or
  add a Pattern 5 prompt example. Document outcome in build-report.md.

This is a one-shot eval (not committed scripts; per "eval harness local-only"
memory: scripts/ stays uncommitted).

### AC6 — Discipline ledger (per parent plan AC8)

| Item | LOC delta |
|---|---|
| Prompt addition (Pattern 4 block) | +20 to +25 |
| `dedupMirrorPairs` helper + invocation | +35 to +45 |
| Tests T1-T5 | +60 to +80 |
| SKILL.md status header update | +3 to +5 |
| **Net** | **~+130 LOC code-only** |

Net positive (~+130). Justification: structural bug fix, not feature
sprawl. The alternative (keep stopgap, accept user friction every winddown)
fails Principle 1 (engage once at curated view). Cumulative through 8f6:
prior cumulative was ~-354 LOC (per 8f2); 8f6 adds +130 → ~-224 LOC.
Still solidly negative. AC8 holds.

### AC7 — Rollback path

`git revert <build commit>` cleanly restores extraction without dedup pass
and without Pattern 4 prompt block. SKILL.md prose change is trivial revert.
If post-merge a legitimate bilateral pair gets mis-dropped, revert the
`dedupMirrorPairs` call (keep the helper) and re-engage with threshold
tuning.

## Skeptical view (per parent plan principle #9)

**Strongest case against:**

"The 2026-05-15 diary entry calls this a parser-bug observation, which
suggests it's been recurring for ~2 weeks and the user has lived with it.
The Phase 3.5 followup-3 stopgap handles it at chef time. Today's 10-pair
spike might be a one-off transcript anomaly (8 meetings approved in a
batch, unusually high). Adding a deterministic dedup heuristic inside the
extractor risks false-positives that silently drop legitimate bilateral
asks ('John to send proposal AND Anthony to send red-line') — a worse
failure mode than the visible mirror-pair (which the chef pattern handles
deterministically). The stopgap is working; the bug-volume estimate of
~5/day was an under-count, not a sign the stopgap is wrong."

**Counter:**
1. Pattern recurrence is structural (2026-05-14: 11 pairs, 2026-05-15: 11
   pairs, 2026-05-27: 10 pairs). This is not a one-off.
2. The chef stopgap defeats the "engage once at curated view" win — the
   batch-drop happens AFTER curation, which is the failure mode that
   Phase 8 was supposed to fix.
3. AC2 dedup is GATED on Jaccard ≥ 0.85 + opposite direction + different
   slugs. Legitimate bilateral asks normally have DIFFERENT text
   ("send proposal" vs "send red-line") and pass Jaccard < 0.85.
4. AC5 eval (re-extract the 2026-05-27 meetings) gives empirical signal
   before merge. If false-positive rate is non-zero, threshold tunes up
   or pattern reverts.
5. SKILL.md stopgap is RETAINED as belt-and-suspenders (AC4) — not
   removed. Any escaped pair still gets the chef-side cleanup.

**Risks** (R1-R5 enumerated in pre-mortem):
- R1: false-positive drops legitimate bilateral pair
- R2: prompt change doesn't propagate (LLM ignores Pattern 4)
- R3: threshold (0.85) is wrong for the actual data
- R4: AC5 re-extract reveals deeper bug (not just mirror pairs)
- R5: ambiguous case (neither slug is owner) is more common than expected

## Phase plan requirements

- **MC1 (gates vs stretch)**: All ACs are gates. No stretch.
- **MC2 (per-skill rollback)**: SKILL.md change is one prose block; `git revert`.
- **MC3 (shadow validation)**: AC5 IS the shadow validation (re-extract pre-fix
  meetings, compare).
- **MC4 (PATTERNS.md ship first)**: N/A — bounded fix, no new pattern.
- **MC5 (legacy interaction)**: SKILL.md stopgap retained as defense-in-depth.

## Build orchestration

**Recommendation: hotfix-shaped sub-orchestrator.**

This is small (1 file changed in core/src, 1 test file, 1 prose doc), bounded
(scope discovery already walked the call graph), and high-value (defeats
recurring user friction). It does NOT need full Phase-cycle ceremony
(eng-lead review pre-build, build-report ceremony, multi-day soak).

Pattern: single sub-orchestrator working in a sub-worktree, sequential 5-step
build, single eng-lead review pass at end before merge.

Branch: `worktree-phase-8-followup-6-direction-parser`
Worktree path: `.claude/worktrees/phase-8-followup-6-direction-parser`

Steps:
1. **Pre-flight**: verify base + 8f2 final commit reachable. Snapshot
   2026-05-27's 8 meetings' raw `action_items[]` to a local scratch file
   (uncommitted) for AC5 re-extract comparison.
2. **AC1 build** — prompt Pattern 4 addition. Commit.
3. **AC2 build** — `dedupMirrorPairs` helper + invocation. Commit.
4. **AC3 build** — tests T1-T5. `tsx --test` green. Commit.
5. **AC4 build** — SKILL.md status update. Commit.
6. **AC5 eval** — re-extract the 8 meetings via dev script (uncommitted
   scripts/). Verify zero mirror-pairs. Document outcome in
   `build-report.md`. If non-zero, halt + escalate.
7. **Rebuild dist**. Commit.
8. **Write build-report.md** (includes AC5 eval results).

Eng-lead review at end. Fix-ups if needed. Merge to parent.

**Why hotfix-not-full-phase**: this is a single-file core bug fix with
deterministic acceptance (AC5 mirror-pair count goes 10 → 0 on the same
meetings). No new patterns, no skill-surface changes, no cross-cutting
refactor. Full-phase ceremony is overkill; soak is the user's next winddown
on 2026-05-28 (one day, not two weeks).

## Open questions / parking lot

- If AC5 reveals the LLM still emits mirror pairs despite Pattern 4 prompt
  block (i.e., dedup pass catches everything), document the prompt-side
  failure rate. May inform future prompt-engineering audits.
- Should `dedupMirrorPairs` also catch SAME-direction same-owner near-dups?
  Out of scope here; existing same-owner dedup in `deduplicateActionItems()`
  handles per-person. Cross-person same-direction is rare and likely a
  separate failure mode.
- The Jaccard threshold (0.85) is a guess. If AC5 false-positive rate > 0,
  tune up; if mirror-pair detection rate < 100%, tune down. Default 0.85
  matches Areté's other dedup heuristics (commitments reconcile uses 0.6
  for Jaccard, but that's looser for cross-source matching).
- Verbatim-actor heuristic ("description begins with owner-stem") relies
  on the existing prompt convention "<Owner> to ..." or "<Owner> will ...".
  If that convention drifts, the heuristic fails open (ambiguous branch
  kicks in, keep `a`, log both). Acceptable.
