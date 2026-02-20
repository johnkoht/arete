---
title: Conversation Capture — Phase 2: People Modes & Improvements
slug: slack-conversation-capture-phase-2
status: idea
size: unknown
tags: [feature]
created: 2026-02-19T00:00:00Z
updated: 2026-02-20T15:43:00Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Slack Conversation Capture — Phase 2: People Modes & Improvements

Status: Backlog (gated on Phase 1 completion)
Owner: Product
Type: Feature enhancement
Parent: `dev/work/plans/slack-conversation-capture/plan.md`
Last updated: 2026-02-19

## Gate Trigger

Phase 1 must be complete with value proven (activation + quality + reuse metrics met) before this work begins.

## 1) Problem

Phase 1 delivers conversation capture with insights extraction. However, different users have different needs around people intelligence:

- **Insights-first users**: Want summary, decisions, actions, questions, risks only. People mapping is noise or overhead.
- **Context-rich users**: Want insights plus people mapping/intelligence for relationship tracking.

Without explicit modes, either people mapping runs for everyone (slowing insights-first users) or is skipped for everyone (losing value for context-rich users).

## 2) Proposed Solution: People-Processing Modes

Introduce explicit modes for people intelligence during conversation capture:

| Mode | Behavior |
|------|----------|
| `off` | Insights only — no people mapping |
| `ask` | Prompt user each run, with "remember this" option |
| `on` | Insights + people mapping always |

### Workspace Preference

- Persisted in workspace config (e.g., `arete.yaml`) as `conversation.defaultPeopleMode: off | ask | on`
- Scoped to workspace only (not global)

### Precedence Rules

1. Per-run override flag (`--people-mode ...`)
2. Saved workspace preference (`conversation.defaultPeopleMode`)
3. System default (`ask`)

## 3) Acceptance Criteria

1. Conversation insights extraction and save succeed when people mode is `off`.
2. People mapping is a non-blocking secondary step when enabled.
3. If people mapping fails/times out, insights artifact is still saved.
4. Users can set and persist default mode at workspace level.
5. Chat and CLI both respect the same mode semantics and precedence rules.
6. Deterministic behavior table with examples documented.

## 4) Out of Scope

- Advanced people enrichment workflows
- Mandatory people graph updates
- Any feature requiring people mapping before saving insights

## 5) Success Signals

- Higher conversation capture completion/save rate for insights-first workflows
- Clear mode split in usage (off/ask/on)
- Low abandonment on `ask` prompt
- No regression for users who prefer people intelligence

## 6) Risks

- `ask` mode may create friction if prompted too often → Mitigation: "remember this choice" + minimal prompt copy
- Mode mismatch confusion → Mitigation: clear CLI output showing active mode
- Hidden coupling in processing flow → Mitigation: ensure insights pipeline is fully independent of people mapping

## 7) Related

- **Initiative**: `dev/work/plans/slack-conversation-capture/plan.md`
- **Phase 1**: `dev/work/plans/slack-integration/plan.md`
- **Phase 3**: `dev/work/plans/slack-conversation-capture-phase-3/plan.md` (BYO Slack App beta)
