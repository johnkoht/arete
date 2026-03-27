# Child PRD: Onboarding MVP (Stream A)

**Parent PRD**: `dev/prds/onboarding-improvements/prd.md`  
**Stream**: A — Onboarding shell  
**Phase Target**: Phase 1

---

## Goal

Deliver a clear 15–30 minute conversational onboarding flow that gets a new user from empty workspace to first meaningful value.

---

## Problem Statement

Users install Areté but stall at an empty workspace. They need a guided flow that quickly establishes context and leads to an immediate “first win.”

---

## Baseline + Deltas

### Baseline
- `dev/backlog/features/onboarding-mvp.md` is canonical for conversational shell behavior.

### Deltas for this stream
- Path A explicitly includes company website + context dump handoff.
- Add minimal profile capture fields for downstream contract reuse.

## Scope

### In Scope
- Guided discovery questions for setup intent and available inputs.
- Onboarding shell based on `dev/backlog/features/onboarding-mvp.md`.
- Path A extension that includes company website + context dump handoff.
- First-win recommendation and handoff (e.g., meeting prep / synthesize / week plan).

### Out of Scope
- Full self-guided adaptive onboarding infrastructure/checkpoints.
- Deep ingestion internals (owned by Context Dump stream).
- People triage/classification workflow details (owned by People Intelligence stream).

---

## Acceptance Criteria

1. Onboarding flow explicitly covers first-session activation in ≤ 30 minutes.
2. Baseline behavior from `onboarding-mvp.md` is preserved; this stream adds deltas only.
3. Path A includes company website + context dump entry points.
4. Onboarding captures minimal identity/profile fields using agreed contract schema.
5. Flow ends with one concrete first-win suggestion and next-step guidance.

---

## Dependencies

- Baseline onboarding spec: `dev/backlog/features/onboarding-mvp.md`
- Stream contract spec from umbrella PRD (identity/profile fields)

---

## Success Metrics (Phase 1)

- Onboarding completion rate
- Second-skill usage within 7 days

### Initial kill criteria (proposed)
- If completion rate remains below agreed threshold after iteration window, pause feature expansion.
- If second-skill usage remains low despite prompt tuning, revisit flow before adding complexity.

---

## Risks (linked)

See parent pre-mortem: `dev/plans/onboarding-improvements/pre-mortem.md`
- Boundary collapse with other streams
- Phase leakage from People Intelligence
