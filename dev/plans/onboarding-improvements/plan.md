---
title: Onboarding Improvements
slug: onboarding-improvements
status: in-progress
size: large
created: 2026-02-18T03:12:45.227Z
updated: 2026-02-18T14:16:27.596Z
completed: null
blocked_reason: null
previous_status: null
has_review: true
has_pre_mortem: true
has_prd: true
backlog_ref: null
steps: 8
---

Plan:
1. **Establish portfolio boundaries (3 streams, one vision)** — Lock what belongs where.
   - AC: Onboarding MVP owns the first 15–30 minute activation flow.
   - AC: Rapid Context Dump is a capability used by onboarding and as a standalone entry point.
   - AC: People Intelligence is a cross-ingestion layer (not onboarding-only).

2. **Adopt onboarding-mvp as the primary near-term shell** — Use existing backlog as baseline.
   - AC: Scope from `dev/backlog/features/onboarding-mvp.md` is the v1 baseline.
   - AC: Include “company website + context dump” as an explicit extension of Path A.
   - AC: Keep full self-guided onboarding-tool infrastructure in a later phase.

3. **Define Rapid Context Dump MVP (separate capability, integrated entry points)** — Keep scope tight.
   - AC: v1 inputs: company website URL, folder/drop zone (`inputs/onboarding-dump/`), and pasted text.
   - AC: v1 outputs: draft context files, draft strategy summary, review checklist.
   - AC: UX always requires user review/confirmation before promoting drafts.

4. **Define People Intelligence MVP (parallel track)** — Prevent misclassification and triage noise.
   - AC: Introduce unknown queue (no forced customer default when uncertain).
   - AC: Ingestion emits recommendations with evidence (e.g., “looks like user interview → suggest user”).
   - AC: Default review mode is low-friction batch/digest, not per-person interruption.

5. **Connect streams via lightweight contracts (not full coupling)** — Shared touchpoints only.
   - AC: Onboarding captures identity/profile inputs reusable by People Intelligence.
   - AC: Context Dump outputs company/domain hints reusable by People Intelligence.
   - AC: Each stream remains independently shippable if another stream slips.

6. **Sequence delivery into 3 phases for speed-to-value** — Prioritize user-visible wins.
   - AC: Phase 1 ships Onboarding MVP + Context Dump basics.
   - AC: Phase 2 ships People Intelligence MVP (unknown queue + recommendations).
   - AC: Phase 3 ships richer ingestion (improved extraction, policy tuning, optional enrichment).
   - AC: Each phase has at least one user-visible win and a measurable KPI.

7. **Define success metrics and kill criteria per stream** — Avoid shipping “smart but unused” features.
   - AC: Onboarding metrics: completion rate, second-skill usage in 7 days.
   - AC: Context Dump metrics: time-to-first-usable-context, review acceptance rate.
   - AC: People Intelligence metrics: misclassification rate, triage burden, interruption complaints.
   - AC: Kill criteria are explicit for each stream if adoption/quality thresholds are missed.

8. **PRD packaging and governance** — Convert strategy into executable delivery artifacts.
   - AC: Create one umbrella PRD with 3 child PRDs (Onboarding MVP, Context Dump MVP, People Intelligence MVP).
   - AC: Mark explicit non-goals to prevent scope creep.
   - AC: Run one pre-mortem before execution, then hand off via execute-prd workflow.

- **Size**: large
- **Steps**: 8
- **Key risks**: scope creep across related streams, over-coupling onboarding to ingestion internals, triage UX becoming noisy
- **Dependencies**: onboarding-mvp baseline, input/upload constraints in chat, shared config/profile model
