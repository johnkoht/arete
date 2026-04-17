---
title: "Fix Meeting Extraction Fragmentation"
slug: fix-meeting-extraction-fragmentation
status: complete
size: small
tags: [meeting-extraction, prompt, ai-tier]
created: "2026-04-16T22:30:00.000Z"
updated: "2026-04-17T00:00:00.000Z"
completed: "2026-04-17T00:00:00.000Z"
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 5
---

# Fix Meeting Extraction Fragmentation

## Goal
Reduce over-fragmentation in meeting action-item extraction by routing to Opus + tightening prompt. Two concrete regression cases drive the work.

## Context
Two recent meetings showed the same failure mode: single units of work emitted as multiple separate action items.

- **`2026-04-16-pop-20-check-in.md`** — one Claude damage-estimation pilot was split into 3 items (ai_001/002/003). Collaborative initiative with multiple contributors → N items.
- **`2026-04-16-glance-email-templates-weekly.md`** — one state-case-sensitivity bug was split into 2 items (ai_001 "Anthony to fix" + ai_002 "Tim to pick up"). Handoff chain → duplicate items. Also ai_003 ("find CA claim to test") was an obsolete mid-meeting commitment — resolved by live-debug later in the meeting, but extracted anyway.

Root causes:
1. **Owner × verb pattern** — extractor treats every utterance with an owner + verb as an action item, not outcomes/deliverables
2. **No narrative tracking** — no concept that later discussion can obviate earlier utterances
3. **Tier mismatch** — extraction currently at `standard` (Sonnet 4.6); Opus handled all three patterns naturally in a manual test

Four failure patterns identified:
- **Collaborative initiative split** (pop-20 Claude pilot)
- **Handoff duplicate** (glance case-sensitivity)
- **Narrative obsolescence** (glance ai_003 "find CA claim")
- **Speculation framing** (pop-20 ai_004/005 "I wonder if..." → treated as commitment)

## Plan

1. **Build local eval harness** (`scripts/eval-meeting-extraction.ts`, not committed)
   - Loads meeting file, strips prior staged sections, calls `extractMeetingIntelligence` via real `AIService`
   - Prints item report + regression checks encoding the known fragmentation cases above
   - AC: Running against either meeting prints action items + pass/fail on each regression check

2. **Run baseline** at current tier (`extraction: standard` in user's arete-reserv yaml)
   - Capture output as ground truth for current behavior
   - AC: Baseline saved, fragmentation cases confirmed as reproducible

3. **Bump `extraction` tier to `frontier`** in `~/code/arete-reserv/arete.yaml` (user-scoped, not framework default)
   - Re-run eval
   - AC: Clear before/after comparison on each regression case

4. **If residual: tighten prompt** (`packages/core/src/services/meeting-extraction.ts:654`)
   - Add collapse test: "If completing X would also complete Y, emit one item"
   - Add two negative examples: handoff split + initiative split
   - Add speculation cap: "I wonder if..." / "Maybe we try..." → confidence ≤ 0.5
   - Re-run eval
   - AC: Regression cases pass

5. **If still residual (esp. narrative obsolescence): add Stage 1 narrative map** — DEFERRED, only if step 4 insufficient
   - Opus-tier pre-pass emits thread map with resolution status
   - Extractor works against the map
   - AC: Obsolete-commitment case (ai_003 in glance) clears

## Out of Scope
- Framework-default tier change in `packages/core/src/services/ai.ts:83` (per user: project-scope only)
- The broader annotated eval suite in `dev/work/plans/meeting-extraction-eval/plan.md` (separate initiative)
- Fixing other extraction categories (decisions, learnings) beyond what the tier change naturally improves

## Risks
- Opus cost/latency jump: extraction moves from Sonnet → Opus, ~3–5x cost per meeting. Acceptable since meetings are low-volume.
- Prompt change regresses other extractions: mitigated by keeping the existing rules and adding to them, plus eval harness validation.
- Narrative-obsolescence case may need stage-1 pass even with Opus: if so, plan has a step for it.
