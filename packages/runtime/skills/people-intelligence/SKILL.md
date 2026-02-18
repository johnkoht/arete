---
name: people-intelligence
description: Uncertainty-safe people classification with evidence-backed suggestions and batch review
category: core
work_type: analysis
requires_briefing: false
triggers:
  - "classify these people"
  - "triage people mentions"
  - "review contact suggestions"
  - "people intelligence"
---

# People Intelligence Skill

Classify people mentions into an uncertainty-safe queue with evidence-backed suggestions.

## When to Use

- You have new people mentions from meetings, notes, or context dump artifacts
- You want low-noise triage in a batch/digest flow
- You need confidence + rationale before assigning internal/customer/user labels

## When NOT to Use

- You want to force classify every person immediately
- You need enrichment/policy tuning beyond MVP scope

## MVP Scope (Phase 2)

### In Scope
- Unknown queue as default for low-confidence suggestions
- Evidence-backed role suggestions (customer/user/partner/unknown)
- Batch/digest review mode as the default (non-blocking)
- Suggestion payload includes confidence, rationale, evidence snippets, source pointers

### Out of Scope
- Forced defaults when confidence is low
- Per-person interruptive prompts as primary UX
- Phase 3 enrichment and advanced policy tuning

## Workflow

1. Gather candidate records from ingestion sources
2. Build evidence from profile/domain hints + mention text
3. Produce recommendation payload
4. Route low-confidence suggestions to unknown queue
5. Return digest summary for batch review

## Output Contract

Each suggestion includes:
- recommendation (affiliation + role lens + tracking intent)
- confidence (0..1)
- rationale
- evidence[] with source pointers
- queue destination (`internal`, `customers`, `users`, or `unknown_queue`)

## Contract Notes

This skill consumes optional hints from:
- `context/profile.md` (Stream A)
- `context/domain-hints.md` (Stream B)

If hints are missing, degrade gracefully and rely on direct evidence only.
