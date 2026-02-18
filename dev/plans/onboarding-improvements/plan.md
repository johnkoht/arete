---
title: Onboarding Improvements
slug: onboarding-improvements
status: draft
size: large
created: 2026-02-18T03:12:45.227Z
updated: 2026-02-18T03:24:21.374Z
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
1. **Risk: Stream boundary collapse (scope creep across 3 streams)** — Onboarding UX, context dump, and people intelligence get implemented as one coupled initiative.
   - AC: **Problem**: Team treats this as one mega-feature, delaying value and increasing coordination failures.
   - AC: **Mitigation**: Freeze stream boundaries in PRD: (A) Onboarding shell, (B) Context dump capability, (C) People intelligence layer; require per-stream in/out-of-scope.
   - AC: **Verification**: Each task is tagged to exactly one stream; no task depends on all 3 streams to ship.

2. **Risk: Rework from not anchoring to existing onboarding MVP backlog** — Duplicate design/implementation effort.
   - AC: **Problem**: New PRD diverges from `dev/backlog/features/onboarding-mvp.md`, causing conflicting flows.
   - AC: **Mitigation**: Make onboarding-mvp the canonical baseline and only add delta requirements (website ingest + people intelligence hooks).
   - AC: **Verification**: PRD includes an explicit “Baseline + Deltas” section referencing onboarding-mvp.

3. **Risk: Input/upload channel mismatch for rapid context dump** — UX promises uploads that IDE/chat path can’t reliably support.
   - AC: **Problem**: “Drop your docs” flow fails in practice; users stall.
   - AC: **Mitigation**: Define supported inputs for MVP in priority order: pasted text, `inputs/onboarding-dump/` folder, website URL; treat file-upload-in-chat as optional.
   - AC: **Verification**: PRD has a fallback matrix for each input type and failure case.

4. **Risk: Low-quality extracted context (incorrect/incomplete drafts)** — Fast ingestion produces untrustworthy context.
   - AC: **Problem**: Drafts overfit noisy docs and degrade downstream guidance.
   - AC: **Mitigation**: Require draft status + confidence/evidence snippets + user review checklist before promotion to canonical context files.
   - AC: **Verification**: Every generated context artifact includes `[DRAFT]`, source references, and explicit “review before promote” gating.

5. **Risk: People triage becomes noisy and annoying** — Feature reduces trust due to interruptions.
   - AC: **Problem**: Per-person prompts interrupt normal work and get ignored.
   - AC: **Mitigation**: Default to low-friction review mode (batch/digest queue), never blocking ingestion.
   - AC: **Verification**: Default UX has no per-contact blocking prompts; unresolved people are queued.

6. **Risk: Classification ambiguity (customer vs user vs internal-user)** — Wrong labels create long-term entity drift.
   - AC: **Problem**: Platform/internal teams don’t fit simple taxonomy; forced categorization causes misclassification.
   - AC: **Mitigation**: Separate dimensions: affiliation (internal/external), role lens (customer/user/partner/unknown), tracking intent (track/defer/ignore); allow mixed identities.
   - AC: **Verification**: PRD data model supports “internal + user” and “unknown” as first-class states.

7. **Risk: Privacy/compliance exposure during context dump** — Sensitive docs are over-ingested or retained unexpectedly.
   - AC: **Problem**: Users import decks/PRDs with confidential data without clear controls.
   - AC: **Mitigation**: Add explicit consent step, supported-file guidance, and “do not ingest” exclusions; start with local workspace-only processing assumptions.
   - AC: **Verification**: PRD includes privacy guardrails and a user-facing warning/consent checkpoint.

8. **Risk: Metrics defined too late (can’t evaluate success/failure)** — Team ships features without decision-quality telemetry.
   - AC: **Problem**: No baseline means no way to judge onboarding completion, triage burden, or extraction value.
   - AC: **Mitigation**: Define KPI schema before implementation: onboarding completion + 7-day second-skill use, context draft acceptance rate, misclassification/triage burden.
   - AC: **Verification**: PRD includes metric definitions, collection points, and phase-level exit criteria.

9. **Risk: Phase sequencing drift (Phase 2 dependencies leak into Phase 1)** — MVP gets blocked by later-phase complexity.
   - AC: **Problem**: People-intelligence requirements creep into initial onboarding/context-dump release.
   - AC: **Mitigation**: Enforce phased gates: Phase 1 ships onboarding + context dump independently; Phase 2 adds unknown queue/suggestions.
   - AC: **Verification**: Phase 1 acceptance criteria have zero hard dependency on people-intelligence implementation.

- **Size**: large
- **Steps**: 9
- **Key risks**: stream coupling, input-channel mismatch, triage fatigue, taxonomy ambiguity, weak measurement
- **Dependencies**: `dev/backlog/features/onboarding-mvp.md` baseline, agreed MVP input constraints, shared profile/config model, phased release discipline