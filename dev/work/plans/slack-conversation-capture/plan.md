---
title: Slack Conversation Capture
slug: slack-conversation-capture
status: idea
size: unknown
tags: [feature]
created: 2026-02-20T03:47:16Z
updated: 2026-02-20T03:47:16Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

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

### Phase 2 (Later): People Modes & Improvements
- People-processing modes: off / ask / on
- Workspace-level preference persistence
- Insights pipeline fully independent of people mapping

### Phase 3 (Later): BYO Slack App Beta
- Advanced users can connect via user-provided Slack app/token
- Thread URL import supported
- Fallback to manual mode remains

### Phase 4 (Future): Arete-managed Slack OAuth Add-on
- Polished first-party connect flow
- Minimal scopes, admin guidance, blocked-workspace fallback

## 6) Phase Gates

| Gate | Required Evidence | Decision |
|---|---|---|
| Phase 1 → Phase 2 | Value proven in manual flow (activation + quality + reuse) | Go / Iterate / Stop |
| Phase 2 → Phase 3 | People modes stable, BYO demand signal from users | Go / Iterate / Stop |
| Phase 3 → Phase 4 | BYO demand proven and support burden acceptable | Go / Iterate / Stop |

## 7) Default Metrics (to tune during PRD)

Phase 1:
- Activation: ≥60% complete first capture
- Insight usefulness: ≥70% rate 4/5+
- Edit burden: median rewrite <30%
- Reuse: ≥30% referenced in later workflows

Phase 2:
- People mode adoption spread (off/ask/on)
- Completion rate improvement for insights-first workflows

Phase 3:
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

## 10) Related Artifacts

- **Phase 1 Plan**: `dev/work/plans/slack-conversation-capture-phase-1/plan.md` (Manual ingestion + intelligence core)
- **Phase 1 PRD**: `dev/work/plans/slack-conversation-capture-phase-1/prd.md`
- **Phase 1 Pre-mortem**: `dev/work/plans/slack-conversation-capture-phase-1/pre-mortem.md`
- **Phase 2 Plan**: `dev/work/plans/slack-conversation-capture-phase-2/plan.md` (People modes)
- **Phase 3 Plan**: `dev/work/plans/slack-conversation-capture-phase-3/plan.md` (BYO Slack App)

## 11) Backlog Follow-ups

- [x] Create Phase 1 PRD
- [x] Create Phase 2 plan (people modes + improvements) with gate-trigger criteria
- [x] Create Phase 3 plan (BYO Slack App beta) with gate-trigger criteria
- [ ] Create Phase 4 plan (managed OAuth add-on) with gate-trigger criteria
