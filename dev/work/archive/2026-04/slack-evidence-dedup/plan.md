---
title: "Slack-digest as dedup evidence for meeting extraction"
slug: slack-evidence-dedup
status: idea
size: unknown
tags: [cli, core, backend, meetings, extraction, slack, dedup]
created: "2026-04-22T00:00:00.000Z"
updated: "2026-04-22T00:00:00.000Z"
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Slack-digest as dedup evidence for meeting extraction

## Status

**Stub.** Deferred from `fewer-llm-calls-open-task-dedup` plan after review revealed the digest schema assumption was wrong. Needs schema investigation before this can be properly scoped.

## Goal

Use slack-digest daily notes as a third source of completion/resolution evidence in the meeting-extraction post-filter (alongside `- [x]` completed tasks and open `- [ ]` tasks). When a meeting action item has already been completed/resolved via Slack and captured by the slack-digest pipeline, flag it as skipped with `staged_item_source: slack-resolved`.

## Motivation

Concrete example observed: `2026-04-22-glance-mvp-weekly.md` extracted `ai_001` "Post in advisory channel requesting ~10 adjusters…" — work that was completed via Slack. The meeting extractor is blind to this. User complaint: "I actually completed this and my slack-digest should have picked it up."

## Why this is its own plan

Folded into the parent `fewer-llm-calls-open-task-dedup` plan, but the review agent sampled 9 real digests in `arete-reserv/resources/notes/` and found only 4/9 match the `## Reconciliation Summary → ### Week Tasks Updated` schema the parent plan assumed. The other 5 use:

- `## Task Updates`
- `## Commitments Resolved`
- `## Action Items Applied`
- `## Commitments Summary`
- Variants like `Commitments Added (7)` vs `Commitments Added` vs `Commitments (2 resolved, 12 added)`

A loader tuned to the assumed schema would silently no-op on ~56% of days. This is a data-shape investigation, not a 1-step addition. Deferred.

## Investigation needed (prerequisite to plan)

1. **Digest schema survey.** Read all historical slack-digests in `resources/notes/*-slack-digest.md` in `arete-reserv` and `arete-reserv-test`. Catalog every top-level section header and sub-section header. Identify which sections carry completion/resolution signal vs. which are narrative.

2. **Decide: retrofit or canonicalize?**
   - **Retrofit path**: build a tolerant parser that handles all observed schema variants. Higher parser complexity; fixtures against all variants.
   - **Canonicalize path**: update the slack-digest skill (`packages/runtime/skills/slack-digest` or `.agents/skills/slack-digest`) to write a canonical schema going forward. Older digests handled by fallback OR explicitly ignored by date.
   - **Hybrid**: canonicalize the writer AND accept the dominant historical shape via adapter.

3. **Commitment-ID pattern.** Some digests reference commitment IDs like `fd38fa2c` under `Commitments Resolved`. If those IDs are real commitment-service references, ID-based matching may be more reliable than Jaccard. Worth evaluating as a supplementary match mechanism.

4. **Staleness window.** Parent plan assumed 14 days. Validate against real usage — how far back should digest evidence influence new-meeting extraction?

5. **Double-counting.** When a task gets checked off in week.md based on a slack resolution, the `- [x]` path already catches it. Is slack-digest then a redundant signal for some items? If so, is it still valuable as a first-class source for items that never made it to week.md?

## Out of scope (inherits from parent plan)

- Computed topic/area memory layer (separate plan, `computed-topic-memory`).
- Prompt tuning for decision/learning taxonomy.
- Cross-invocation reconciliation-context cache.

## Dependencies

- Parent plan `fewer-llm-calls-open-task-dedup` must land first. Specifically:
  - Shared `ItemSource` type with `'slack-resolved'` member already included
  - Post-filter Jaccard pipeline (threshold, min-token guard) established
  - Backend allowlist already widened (`workspace.ts::parseStagedItemSource`)
- Means: when this plan activates, implementation is primarily the loader + wiring, not infrastructure.

## Open questions for the builder

- Retrofit vs canonicalize vs hybrid?
- Is there appetite to modify the slack-digest skill to emit a canonical schema?
- Should commitment-ID matching be first-class or just a fallback?
- Do we need per-source configurability (e.g. users who don't run slack-digest should skip this loader entirely)?

## Next step

Run the schema survey on all historical digests. Produce a short memo at `dev/work/plans/slack-evidence-dedup/schema-survey.md` before drafting the full plan.
