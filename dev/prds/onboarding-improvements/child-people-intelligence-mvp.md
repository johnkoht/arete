# Child PRD: People Intelligence MVP (Stream C)

**Parent PRD**: `dev/prds/onboarding-improvements/prd.md`  
**Stream**: C — People Intelligence layer  
**Phase Target**: Phase 2

---

## Goal

Introduce an uncertainty-safe, low-noise people intelligence layer that improves classification quality without interrupting core workflows.

---

## Problem Statement

Forced classification and interruptive triage degrade trust. The system needs evidence-based suggestions and a low-friction queue that handles ambiguity gracefully.

---

## Scope

### In Scope
- Unknown queue as first-class destination for uncertain entities.
- Evidence-backed role suggestions (e.g., user/customer/internal signals with rationale).
- Batch/digest review mode as default (non-blocking).
- Suggestion payload includes confidence + evidence snippets + source pointers.
- Multi-dimensional classification model:
  - affiliation (internal/external)
  - role lens (customer/user/partner/unknown)
  - tracking intent (track/defer/ignore)

### Out of Scope
- Forced default classification when confidence is low.
- Per-person interruptive review as primary UX.
- Optional enrichment/policy tuning beyond MVP (Phase 3).

---

## Acceptance Criteria

1. Unknown queue exists and is default for low-confidence classifications.
2. Recommendations include evidence snippets and confidence/rationale.
3. Suggestions under confidence threshold default to unknown queue (no forced classification).
4. Default review flow is digest/batch and non-blocking.
5. Data model supports mixed identities and unknown state.
6. Triage burden is measurable and visible through defined KPIs.

---

## Dependencies

- Profile/config contract from Stream A
- Domain/company hints from Stream B

---

## Success Metrics (Phase 2)

- Misclassification rate
- Triage burden
- Interruption complaints

### Initial kill criteria (proposed)
- If misclassification remains high after thresholded iterations, hold rollout and tighten evidence standards.
- If triage burden/interruptions exceed acceptable range, simplify review UX before adding enrichment.

---

## Risks (linked)

See parent pre-mortem: `dev/plans/onboarding-improvements/pre-mortem.md`
- Triage noise and alert fatigue
- Taxonomy ambiguity / long-term entity drift
- Phase leakage into Phase 1
