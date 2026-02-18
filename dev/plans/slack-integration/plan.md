---
title: Slack Integration
slug: slack-integration
status: draft
size: large
created: 2026-02-18T19:59:27.611Z
updated: 2026-02-18T21:37:07.555Z
completed: null
has_review: false
has_pre_mortem: false
has_prd: false
backlog_ref: null
steps: 6
---

Perfect. Since we’re in **Plan Mode**, I won’t write files yet — but here are **copy-ready drafts** for both docs.

---

### Draft: `dev/backlog/features/slack-conversation-capture.md`

```md
# Slack Conversation Capture (Initiative)

Status: Proposed  
Owner: Product  
Type: Multi-phase initiative  
Last updated: 2026-02-18

## 1) Problem

PMs in Slack-heavy teams lose valuable context buried in threads. Important decisions, action items, risks, and stakeholder signals do not consistently make it into durable Areté context/memory.

## 2) Users

Primary:
- Product Managers at startups (small to large) who use Slack threads in a structured way.

Secondary:
- Product builders who need reliable context carryover across planning/execution cycles.

## 3) Outcome / Success

A user can turn a Slack conversation into a durable `conversation` artifact with high-quality extracted insights (summary, decisions, actions, questions, stakeholders, risks), then reuse that context in Areté workflows.

## 4) Product Boundary

This initiative is **conversation intelligence**, not “just Slack integration.”

- Core product value = extraction quality + durable context + memory reuse.
- Ingestion is pluggable:
  - Manual copy/paste (always available)
  - Slack API import (when available)

## 5) Phase Map

### Phase 1 (Now): Manual Ingestion + Intelligence Core
- User pastes conversation text
- Areté parses, generates insights, allows edits/redaction
- Saves as `conversation` artifact
- Integrates with memory/people intelligence

### Phase 2 (Later, optional): BYO Slack App Beta
- Advanced users can connect via user-provided Slack app/token
- Thread URL import supported
- Fallback to manual mode remains

### Phase 3 (Later): Arete-managed Slack OAuth Add-on
- Polished first-party connect flow
- Minimal scopes, admin guidance, blocked-workspace fallback

## 6) Phase Gates

| Gate | Required Evidence | Decision |
|---|---|---|
| Phase 1 → Phase 2 | Value proven in manual flow (activation + quality + reuse) | Go / Iterate / Stop |
| Phase 2 → Phase 3 | BYO demand proven and support burden acceptable | Go / Iterate / Stop |

## 7) Default Metrics (to tune during PRD)

Phase 1:
- Activation: ≥60% complete first capture
- Insight usefulness: ≥70% rate 4/5+
- Edit burden: median rewrite <30%
- Reuse: ≥30% referenced in later workflows

Phase 2:
- Setup success: ≥70%
- Setup time: median ≤20 min
- Import success after setup: ≥80%
- Approval-friction rate measured and acceptable

## 8) Risks

- Slack approvals block API-based ingestion in many orgs
- Low trust if extraction quality is weak
- Privacy concerns around pasted/imported content
- Support burden for BYO path may exceed value

## 9) Out of Scope (for this initiative right now)

- Two-way Slack sync
- Real-time slash-command push from Slack
- Continuous channel ingestion
- Auto-posting back to Slack

## 10) Backlog Follow-ups

- [ ] Create Phase 2 backlog ticket (BYO beta) with gate-trigger criteria
- [ ] Create Phase 3 backlog ticket (managed OAuth add-on) with gate-trigger criteria
```

---

### Draft: `dev/prds/slack-conversation-capture-phase-1/prd.md`

```md
# PRD: Slack Conversation Capture — Phase 1 (Manual Ingestion)

Status: Draft  
Owner: Product + Engineering  
Target: Phase 1 ship, then close PRD  
Last updated: 2026-02-18

## 1) Problem Statement

PMs lose critical context in Slack conversations. Without a fast way to capture and structure that context in Areté, decisions and action items are not reliably carried into planning and execution.

## 2) Goal

Deliver a high-quality manual ingestion flow that converts pasted Slack conversation text into a durable `conversation` artifact with reliable extracted insights and memory integration.

## 3) Users

Primary:
- PMs at startups who use Slack threads heavily.

## 4) Scope

### In Scope
1. Manual paste flow for conversation text
2. Parse and normalize conversation content
3. Generate insights:
   - summary
   - decisions
   - action items
   - open questions
   - stakeholders
   - risks
4. Edit/redact before save
5. Save as `conversation` artifact with provenance `source=manual`
6. Hook into memory/people intelligence (reuse existing extraction pathways where possible)

### Out of Scope
- Slack API integration (BYO or managed OAuth)
- Thread URL import
- Two-way sync
- Real-time push from Slack
- Continuous ingestion

## 5) User Stories

1. As a PM, I can paste a Slack conversation and get a clean structured summary I can trust.
2. As a PM, I can edit/redact extracted output before it is saved.
3. As a PM, I can save the result as a reusable `conversation` artifact for future planning/memory use.

## 6) Functional Requirements

1. Input accepts multiline pasted conversation text.
2. System parses speaker turns/timestamps when detectable.
3. System outputs structured sections for key insights.
4. User can edit each section before save.
5. User can redact sensitive content before save.
6. Save operation creates a `conversation` artifact with:
   - raw transcript
   - normalized content
   - derived insights
   - provenance metadata
7. Artifact is discoverable by existing context/memory workflows.

## 7) Non-Functional Requirements

- Deterministic save behavior (no partial writes)
- Graceful handling of malformed paste input
- Clear user messaging on extraction confidence
- No Slack API dependencies in Phase 1

## 8) Acceptance Criteria

### AC-1: Capture
- Given pasted conversation text, user can generate draft insights in one flow.

### AC-2: Quality
- Output contains all required sections (summary, decisions, actions, questions, stakeholders, risks).
- Pilot users rate usefulness at target threshold.

### AC-3: Editability
- User can edit/redact extracted content before save.

### AC-4: Artifact integrity
- Saved artifact includes raw + derived + provenance fields.

### AC-5: Reuse
- Saved conversation can be referenced by downstream context/memory workflows.

## 9) Metrics (Phase 1 Gate Inputs)

- Activation: % users who complete first capture
- Insight usefulness rating (4/5+)
- Median edit burden (% rewritten)
- Reuse rate in subsequent workflows

## 10) Risks & Mitigations

1. **Low extraction trust**
   - Mitigation: editable sections + confidence markers + pilot tuning loop
2. **Ambiguous conversation formatting**
   - Mitigation: robust parser fallback + user-edit step
3. **Privacy concerns**
   - Mitigation: explicit redaction step + provenance metadata

## 11) Delivery Plan (High-level)

1. Define `conversation` artifact schema and save contract
2. Implement manual ingestion + parsing + insight extraction flow
3. Add edit/redact-before-save UX
4. Integrate with memory/people intelligence pathways
5. Instrument metrics and run pilot
6. Phase review: Go / Iterate / Stop for Phase 2

## 12) Definition of Done (Close This PRD)

- All Phase 1 acceptance criteria met
- Metrics collected for agreed pilot window
- Phase review completed with recommendation
- PRD marked complete and archived
- Any Phase 2/3 work remains backlog-only until explicitly approved
```

---

## Plan:
1. Review and approve naming: **“Slack Conversation Capture”** + artifact name **`conversation`**.
2. Finalize thresholds (activation, usefulness, rewrite %, reuse) for your pilot size.
3. Approve these two drafts as the source of truth for initiative + executable Phase 1 scope.
4. Run `/pre-mortem` on Phase 1 (quality/trust/privacy risks).
5. Convert Phase 1 PRD to executable handoff once thresholds are locked.
6. Keep Phase 2/3 as backlog only until the Phase 1 gate review.

If you want, next I can produce a **tightened v2** of both docs with your preferred metric thresholds filled in (e.g., conservative vs aggressive targets).