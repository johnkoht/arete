# PRD: Onboarding Improvements

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-02-18

---

## Goal

Ship a phased onboarding strategy that accelerates first-value activation while preserving modularity: 
1) Onboarding shell for first-session success, 
2) Rapid Context Dump as reusable capability, and 
3) People Intelligence as a parallel ingestion layer.

---

## Problem Statement

Current onboarding scope is fragmented across overlapping concepts (onboarding shell, context ingestion, and people classification), risking over-coupling and delayed value. We need clear stream boundaries, phased delivery, and measurable adoption quality signals so teams can ship independently and avoid “smart but unused” functionality.

---

## Baseline + Deltas

### Baseline
- `dev/backlog/features/onboarding-mvp.md` is the canonical v1 baseline for the conversational onboarding shell.

### Deltas in this PRD
- Add company website + context dump inputs/outputs to onboarding Path A.
- Define Rapid Context Dump as standalone capability with integrated entry points.
- Define People Intelligence MVP with unknown queue and evidence-based recommendations.
- Add stream contracts, phased rollout, KPIs, and kill criteria.

---

## Non-Goals

- Full self-guided onboarding tool with adaptive checkpoints (later phase).
- Mandatory coupling between onboarding and people intelligence at ship time.
- Automated promotion of generated context without user review.
- Advanced enrichment/policy tuning in Phase 1.

---

## Stream Model

- **Stream A: Onboarding MVP shell** — first 15–30 minute activation conversation.
- **Stream B: Rapid Context Dump MVP** — ingestion + draft generation capability, reusable by onboarding and standalone flows.
- **Stream C: People Intelligence MVP** — cross-ingestion people suggestions, unknown queue, low-friction review.

Each stream must remain independently shippable.

### Stream Ownership Table (v1)

| Stream | Owns | Explicitly does not own |
|---|---|---|
| A — Onboarding MVP | First-session activation flow, discovery prompts, first-win handoff, profile capture entry points | Context ingestion internals, people triage/classification policy |
| B — Rapid Context Dump | Input handling (URL/folder/paste), draft artifact generation, review-before-promote flow | Onboarding journey orchestration, people classification decisions |
| C — People Intelligence | Unknown queue, evidence-based suggestions, low-friction review mode, classification model | Onboarding shell UX, context extraction pipeline internals |

### Task-to-Stream Mapping Rule

- Every implementation task must declare exactly one **primary stream** (`A`, `B`, or `C`).
- Shared dependencies are modeled as contracts, not co-owned implementation tasks.
- A task that spans multiple streams must be split into per-stream tasks plus a contract task.

### Independent Ship Constraints

- Stream A + B (Phase 1) must ship without Stream C implementation.
- Stream C must degrade gracefully if Stream A/B hints are missing.
- No release gate may require all three streams simultaneously unless explicitly marked as a post-MVP integration milestone.

---

## User Stories / Tasks

### Task 1: Lock stream boundaries and ownership

Define explicit ownership boundaries for streams A/B/C and publish in PRD + delivery docs.

**Acceptance Criteria**
- Stream ownership table is explicit (A/B/C).
- Every implementation task maps to exactly one primary stream.
- No task requires all 3 streams to ship.

---

### Task 2: Adopt onboarding-mvp as baseline shell

Implement onboarding scope by extending `onboarding-mvp` rather than replacing it.

**Acceptance Criteria**
- PRD references `dev/backlog/features/onboarding-mvp.md` as baseline.
- Path A includes company website + context dump extension.
- Self-guided onboarding infrastructure remains out-of-scope for Phase 1.

---

### Task 3: Deliver Rapid Context Dump MVP interface

Define supported inputs/outputs and review-first flow for context generation.

**Acceptance Criteria**
- Inputs: website URL, `inputs/onboarding-dump/` folder, pasted text.
- Outputs: draft context files, draft strategy summary, review checklist.
- Promotion to canonical files requires explicit user confirmation.

---

### Task 4: Deliver People Intelligence MVP foundations

Introduce low-friction triage and uncertainty-safe classification.

**Acceptance Criteria**
- Unknown queue exists; uncertain contacts are never force-classified as customers.
- Suggestions include evidence snippets/rationale.
- Default review mode is batch/digest, not blocking per-person prompts.

---

### Task 5: Define and implement lightweight stream contracts

Create minimal cross-stream data contracts without runtime over-coupling.

**Acceptance Criteria**
- Onboarding captures identity/profile fields reusable by People Intelligence.
- Context Dump emits company/domain hints consumable by People Intelligence.
- Contract docs specify optional dependency behavior (streams can ship independently).

---

### Task 6: Implement 3-phase delivery gates

Sequence delivery for speed-to-value and isolate complexity.

**Acceptance Criteria**
- Phase 1: Onboarding shell + Context Dump basics.
- Phase 2: People Intelligence unknown queue + evidence suggestions.
- Phase 3: richer extraction, policy tuning, optional enrichment.
- Each phase has user-visible win and explicit exit criteria.

---

### Task 7: Define KPI schema and kill criteria

Introduce measurable success/fail criteria per stream before implementation.

**Acceptance Criteria**
- Onboarding KPIs: completion rate, second-skill usage in 7 days.
- Context Dump KPIs: time-to-first-usable-context, review acceptance rate.
- People Intelligence KPIs: misclassification rate, triage burden, interruption complaints.
- Kill criteria are documented for each stream.

---

### Task 8: Package umbrella + child PRDs and governance

Finalize governance artifacts for execution readiness.

**Acceptance Criteria**
- One umbrella PRD + three child PRDs are created and linked.
- Explicit non-goals are documented in umbrella and child PRDs.
- One pre-mortem is attached before execution handoff.

---

## Phase Mapping

- **Phase 1**: Tasks 1–3, plus required subset of Task 5 and Task 7
- **Phase 2**: Task 4, remaining Task 5, KPI continuation from Task 7
- **Phase 3**: Extended capabilities from Task 6 with enriched extraction/tuning

---

## Dependencies

- `dev/backlog/features/onboarding-mvp.md` baseline alignment
- Agreed input channel constraints in IDE/chat
- Shared profile/config model for cross-stream contracts

---

## Contract v1 (Cross-Stream)

| Contract field | Produced by | Consumed by | Required | Fallback behavior |
|---|---|---|---|---|
| `profile.name` | Stream A | Stream C | yes | If missing, classify as unknown and queue |
| `profile.role` | Stream A | Stream C | no | Keep unknown role lens |
| `profile.company` | Stream A | Stream C | no | Infer from context hints when available |
| `context.companyDomains[]` | Stream B | Stream C | no | Skip domain inference |
| `context.sourceHints[]` | Stream B | Stream C | no | Suggestions rely on direct evidence only |
| `context.artifactRefs[]` | Stream B | Stream C | yes for evidence traceability | Suggestion without refs is not auto-recommended |

Contract ownership:
- Producer schemas: owned by producing stream (A or B)
- Consumer interpretation + confidence policy: owned by Stream C

---

## Phase Gates + Independent Ship Checks

| Phase | Required streams | Gate criteria | User-visible win | Independent ship check |
|---|---|---|---|---|
| 1 | A + B | Activation flow + draft generation + review gating complete | New user reaches first value and sees draft context quickly | A+B release succeeds with C absent |
| 2 | C (+ contracts from A/B) | Unknown queue + evidence suggestions + digest review complete | People suggestions reduce manual triage friction | C functions with graceful degradation if A/B hints sparse |
| 3 | B + C enhancements | Extraction tuning/enrichment policy complete | Higher-quality context and people signal quality | Enhancements can be toggled without breaking Phase 1/2 behavior |

---

## KPI Thresholds + Kill Criteria (Initial)

| Stream | KPI | Initial threshold | Pause/Kill trigger |
|---|---|---|---|
| A — Onboarding | Completion rate | >= 60% | < 45% for two consecutive measurement windows |
| A — Onboarding | 7-day second-skill usage | >= 35% | < 20% after prompt-flow iteration |
| B — Context Dump | Time-to-first-usable-context (p50) | <= 15 minutes | > 25 minutes for two windows |
| B — Context Dump | Draft acceptance rate | >= 70% | < 50% after quality iteration |
| C — People Intelligence | Misclassification rate | <= 15% | > 25% after evidence policy tuning |
| C — People Intelligence | Triage burden (median) | <= 10 min/week | > 20 min/week or rising across two windows |
| C — People Intelligence | Interruption complaints | <= 5% of active users | > 10% active users reporting disruption |

Measurement window: weekly for MVP phase reviews.

---

## Success Criteria

- Stream boundaries remain intact through implementation.
- Phase 1 ships independently and delivers first-session value.
- Review-first context generation maintains trust.
- People Intelligence reduces misclassification and triage friction.
- KPI/kill criteria drive continue/stop decisions.

---

## Source Plan + Child PRD Links

- Source plan: `dev/plans/onboarding-improvements/plan.md`
- Stream A (Onboarding MVP): `dev/prds/onboarding-improvements/child-onboarding-mvp.md`
- Stream B (Rapid Context Dump MVP): `dev/prds/onboarding-improvements/child-rapid-context-dump-mvp.md`
- Stream C (People Intelligence MVP): `dev/prds/onboarding-improvements/child-people-intelligence-mvp.md`

## Execution Handoff Checklist

- [x] Umbrella PRD present and linked to child PRDs
- [x] Child PRDs present for streams A/B/C
- [x] Pre-mortem saved at `dev/plans/onboarding-improvements/pre-mortem.md`
- [x] Review saved at `dev/plans/onboarding-improvements/review.md`
- [x] Autonomous task list initialized at `dev/autonomous/prd.json`
- [x] Progress tracking initialized at `dev/autonomous/progress.txt`

## Pre-Mortem Reference

Detailed risk analysis is tracked in:
- `dev/plans/onboarding-improvements/pre-mortem.md`
