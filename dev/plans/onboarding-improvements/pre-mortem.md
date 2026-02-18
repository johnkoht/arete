# Pre-Mortem: Onboarding Improvements

Date: 2026-02-18
Scope: Onboarding MVP + Rapid Context Dump MVP + People Intelligence MVP (phased)

## Risk 1: Stream boundary collapse (scope creep across 3 streams)

**Category**: Scope Creep

**Problem**: Onboarding shell, context dump capability, and people intelligence ingestion get treated as one coupled mega-feature, delaying delivery and increasing coordination failures.

**Mitigation**: Freeze stream boundaries in PRD sections and task tagging:
- Stream A: Onboarding shell
- Stream B: Rapid Context Dump
- Stream C: People Intelligence

Require each implementation task to map to exactly one stream.

**Verification**: PRD and task list show stream tags; no Phase 1 task requires all 3 streams to ship.

---

## Risk 2: Rework from not anchoring to onboarding-mvp baseline

**Category**: Dependencies

**Problem**: New requirements diverge from `dev/backlog/features/onboarding-mvp.md`, creating duplicate or conflicting onboarding flows.

**Mitigation**: Treat onboarding-mvp as canonical baseline; express only deltas in new PRD (website ingest + context dump + people hooks).

**Verification**: PRD contains “Baseline + Deltas” section referencing onboarding-mvp.

---

## Risk 3: Input-channel mismatch for Rapid Context Dump

**Category**: Integration

**Problem**: UX may over-promise file upload behavior that is inconsistent across IDE/chat environments.

**Mitigation**: Define deterministic MVP input order with explicit fallback matrix:
1) pasted text,
2) `inputs/onboarding-dump/` folder,
3) website URL,
4) chat upload optional.

**Verification**: PRD includes input fallback matrix and per-input failure behavior.

---

## Risk 4: Low-quality extracted context drafts

**Category**: Code Quality

**Problem**: Fast extraction can produce incorrect or incomplete context, reducing trust in generated files.

**Mitigation**: All generated artifacts are drafts with evidence snippets, confidence indicators, and required review checklist before promotion.

**Verification**: Generated outputs include `[DRAFT]`, source references, and explicit promote-gating language.

---

## Risk 5: People triage UX becomes noisy

**Category**: Integration

**Problem**: Per-person interruption prompts cause alert fatigue and feature abandonment.

**Mitigation**: Default to batch/digest review queue; never block ingestion on per-contact triage prompts.

**Verification**: Default flow has no mandatory per-person interruption; unresolved entities accumulate in unknown queue.

---

## Risk 6: Taxonomy ambiguity causes long-term entity drift

**Category**: Context Gaps

**Problem**: Forced “customer vs user vs internal” labeling misclassifies platform/internal stakeholders and mixed-role contacts.

**Mitigation**: Use multi-dimensional model:
- affiliation (internal/external)
- role lens (customer/user/partner/unknown)
- tracking intent (track/defer/ignore)

Allow mixed identities and unknown state.

**Verification**: PRD data model supports combinations (e.g., internal + user) and unknown as first-class.

---

## Risk 7: Privacy/compliance exposure during ingestion

**Category**: Platform Issues

**Problem**: Sensitive docs can be ingested without clear user intent, violating trust and policy expectations.

**Mitigation**: Add explicit consent checkpoint, exclusion guidance (“do not ingest”), and local-workspace-only assumptions for MVP.

**Verification**: PRD includes consent UX, exclusions guidance, and privacy guardrails.

---

## Risk 8: Metrics defined too late to guide decisions

**Category**: State Tracking

**Problem**: Features ship without reliable KPI instrumentation, making continuation/rollback decisions subjective.

**Mitigation**: Define KPI schema and collection points before implementation starts:
- onboarding completion + 7-day second-skill usage
- context draft acceptance and time-to-usable-context
- misclassification rate + triage burden + interruption complaints

**Verification**: PRD includes KPI definitions, collection points, and phase exit/kill criteria.

---

## Risk 9: Phase leakage blocks Phase 1 value

**Category**: Dependencies

**Problem**: Phase 2 People Intelligence requirements leak into Phase 1, blocking initial onboarding/context value.

**Mitigation**: Enforce phase gates:
- Phase 1: onboarding + context dump independently shippable
- Phase 2: people unknown queue + recommendations
- Phase 3: richer extraction/enrichment

**Verification**: Phase 1 acceptance criteria have zero hard dependency on People Intelligence implementation.

---

## Summary

- Total risks: 9
- Most critical: stream coupling, input mismatch, triage fatigue, taxonomy ambiguity, delayed metrics
- Pre-execution gate: PRD must include stream boundaries, phase gates, fallback matrix, and KPI/kill criteria before implementation begins.
