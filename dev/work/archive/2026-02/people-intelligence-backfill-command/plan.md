---
title: People Intelligence Backfill Command
slug: people-intelligence-backfill-command
status: idea
size: unknown
tags: [improvement]
created: 2026-02-20T03:47:16Z
updated: 2026-02-20T03:47:16Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# People Intelligence Backfill Command

**Status**: Backlog  
**Priority**: Low (not urgent)  
**Effort**: Small-Medium

## What

Add a bulk backfill command for People Intelligence classification across existing meetings/people data.

Proposed command shape (example):

```bash
arete people intelligence backfill --all --dry-run
arete people intelligence backfill --from-meetings --days-back 30 --apply
arete people intelligence backfill --reclassify-existing --dry-run
```

## Why

Current flow is strong for forward processing (`arete meeting process --latest` / `--file`), but users may need catch-up scenarios:

1. Bulk imports during onboarding
2. Late Fathom setup after days/weeks of use
3. Older meetings processed before intelligence was enabled

## Key Product Risk (Builder note)

Backfilling old data may reduce trust if stale/irrelevant history is mixed with current signal.

Potential user confusion risks:
- obsolete stakeholders resurfacing
- historical classifications overriding current reality
- larger unknown queue causing triage fatigue

## Suggested Guardrails

- Default to **dry-run** (explicit `--apply` required)
- Default to **recency window** (e.g., last 30-60 days), not all history
- Tag outputs with source recency metadata
- Provide summary before apply: total candidates, unknown queue count, likely low-value stale items
- Optional exclude filters (inactive projects, old date cutoff)

## Suggested UX Direction

Prefer a “moving-forward first” recommendation in docs/UI:
- “Use ongoing processing by default”
- “Use backfill only when onboarding or migration needs justify it”

## Acceptance Criteria (when implemented)

- Backfill command exists with dry-run and apply modes
- Recency cutoff is default-on and configurable
- Output clearly distinguishes stale vs recent candidates
- Does not auto-force unknowns into customers
- Integration tests cover dry-run safety and recency filtering
