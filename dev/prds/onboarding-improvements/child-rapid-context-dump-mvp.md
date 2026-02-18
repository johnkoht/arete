# Child PRD: Rapid Context Dump MVP (Stream B)

**Parent PRD**: `dev/prds/onboarding-improvements/prd.md`  
**Stream**: B — Rapid Context Dump capability  
**Phase Target**: Phase 1

---

## Goal

Provide a reusable context-ingestion capability that converts user-provided inputs into reviewable draft artifacts quickly and safely.

---

## Problem Statement

Users have context in scattered sources (docs, websites, notes) and need a low-friction way to bootstrap usable workspace context without manual file-by-file authoring.

---

## Scope

### In Scope
- MVP inputs:
  - company website URL
  - `inputs/onboarding-dump/` folder/drop zone
  - pasted text
- MVP outputs:
  - draft context files
  - draft strategy summary
  - review checklist
- Mandatory review-before-promote behavior for all generated artifacts.
- Input fallback matrix for channel constraints.

### Out of Scope
- Autonomous draft promotion without user confirmation.
- Advanced extraction/enrichment/policy tuning (Phase 3).
- People classification and triage logic (owned by Stream C).

---

## Input Fallback Matrix (v1)

| Priority | Input type | If unavailable/fails | Fallback |
|---|---|---|---|
| 1 | Pasted text | User has little/no structured content | Prompt for website URL or folder drop zone |
| 2 | `inputs/onboarding-dump/` folder | Files missing/unsupported | Continue with pasted text + website URL |
| 3 | Company website URL | Site inaccessible/low signal | Continue with folder/pasted text only |
| 4 | Chat file upload (optional) | Unsupported in environment | Never block; route to folder/paste path |

## Acceptance Criteria

1. All three MVP input types are supported with deterministic fallback behavior.
2. Output artifacts are explicitly labeled draft and include source/evidence references.
3. User must confirm review before draft promotion to canonical context files.
4. UX does not block onboarding when one input channel fails.
5. Capability can be invoked from onboarding and as standalone flow.
6. Consent checkpoint and exclusion guidance are shown before ingestion begins.

---

## Dependencies

- Input constraints in IDE/chat environments
- Contract for domain/company hints emitted to Stream C

---

## Success Metrics (Phase 1)

- Time-to-first-usable-context
- Draft review acceptance rate

### Initial kill criteria (proposed)
- If time-to-first-usable-context is consistently too high, simplify input/output scope.
- If acceptance rate remains low, improve evidence quality before expanding capability.

---

## Risks (linked)

See parent pre-mortem: `dev/plans/onboarding-improvements/pre-mortem.md`
- Input-channel mismatch
- Low-quality extracted drafts
- Privacy/compliance exposure
