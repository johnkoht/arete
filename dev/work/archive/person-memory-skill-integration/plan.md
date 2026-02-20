---
title: Person Memory Skill Integration
slug: person-memory-skill-integration
status: completed
size: medium
created: 2026-02-17T06:58:00Z
updated: 2026-02-17T07:23:00Z
completed: 2026-02-17T07:23:00Z
blocked_reason: null
previous_status: null
has_review: false
has_pre_mortem: true
has_prd: true
backlog_ref: dev/backlog/features/people-intelligence.md
steps: 7
---

# Overview

Integrate person-memory highlights into planning/prep workflows with a lazy-refresh model, staleness checks, and low-friction UX. Prioritize meeting-prep first, then expand to agenda/daily/week planning.

## Goals

1. Meeting prep automatically uses fresh person memory when available.
2. Refresh is lazy and targeted (only relevant attendees), not global.
3. Users can choose meetings from calendar for prep when meeting identity is ambiguous.
4. Daily/weekly planning surfaces concise stakeholder watchouts without overwhelming output.

## Non-Goals (for this plan)

- Full topic graph and chain reasoning
- Heavy proactive autonomy (auto actions without user confirmation)
- Large schema redesign for people profiles

## Execution Plan

### 1) Meeting-prep: lazy refresh + stale policy (MVP)

- Add freshness check for attendee memory highlights (based on `Last refreshed`).
- If stale/missing, do targeted refresh for resolved attendees only.
- If refresh is expected to be expensive (many attendees/meetings), ask: "Refresh now?"
- Fail-open: if refresh fails, continue with existing context.

**Acceptance Criteria**
- `meeting-prep` includes fresh highlights when stale/missing.
- No hard failure when refresh errors.
- User-visible note indicates whether refresh occurred.

### 2) Meeting-prep: calendar meeting selection UX

- If user asks for prep without clear attendees/title, offer selectable list from `arete pull calendar --today --json` (optionally next N days).
- User can select one meeting; resolved attendees feed prep flow.
- If calendar unavailable, fallback to current manual prompt.

**Acceptance Criteria**
- Ambiguous prep requests prompt meeting selection when calendar exists.
- Selection path resolves attendees and runs prep normally.
- No regression when calendar integration is absent.

### 3) Prepare-meeting-agenda: conditional person-memory use

- Only run person-memory refresh when attendees are known/resolved.
- If attendees unknown, skip refresh and proceed with template.
- If attendees are added later in flow, run targeted refresh then.

**Acceptance Criteria**
- Agenda creation remains fast for attendee-unknown flows.
- Attendee-known flows include memory-based agenda callouts.

### 4) Daily-plan integration (lightweight)

- For today’s meetings, run targeted stale-aware refresh for attendees.
- Add one concise watchout per meeting when available (e.g., recurring concern).

**Acceptance Criteria**
- Daily plan output adds stakeholder context without becoming verbose.
- Refresh remains scoped to today’s meetings only.

### 5) Week-plan integration (summary-level)

- Aggregate likely stakeholder concerns for meetings this week.
- Add a compact section like "Stakeholder watchouts this week".

**Acceptance Criteria**
- Week plan includes high-signal summary (not per-person dump).
- Meets strategic planning tone of week-plan.

### 6) Tests + docs

- Add/extend tests for each workflow path:
  - stale vs fresh behavior
  - calendar selection path
  - attendee-known vs attendee-unknown agenda flow
  - daily/week summary rendering
- Update skill docs and GUIDE where behavior changes.

**Acceptance Criteria**
- New behavior covered by tests in `packages/core/test` and `packages/cli/test` as applicable.
- Skill docs match implemented behavior.

### 7) Verify and rollout

- Run quality gates:
  - `npm run typecheck`
  - `npm test`
- Soft rollout default: refresh lazily with clear messaging.
- Consider a future setting for default refresh behavior (always ask vs auto-if-stale).

## Risks & Mitigations (summary)

- **Latency creep**: limit refresh to relevant attendees; ask before expensive refresh.
- **Noisy highlights**: preserve mention threshold and evidence-based formatting.
- **Workflow verbosity**: cap memory callouts to 1–2 lines per meeting in planning skills.
- **Calendar dependency fragility**: maintain robust fallback when calendar unavailable.
