---
title: Conversation Capture — Phase 3: BYO Slack App Beta
slug: slack-conversation-capture-phase-3
status: idea
size: unknown
tags: [feature, slack]
created: 2026-02-20T15:43:00Z
updated: 2026-02-20T15:43:00Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 0
---

# Slack Conversation Capture — Phase 3: BYO Slack App Beta

Status: Backlog (gated on Phase 2 completion)
Owner: Product
Type: Feature enhancement
Parent: `dev/work/plans/slack-conversation-capture/plan.md`
Last updated: 2026-02-20

## Gate Trigger

Phase 2 must be complete with BYO demand proven and support burden acceptable before this work begins.

## 1) Problem

Phase 1 requires users to manually copy/paste conversation text. This works but creates friction for power users who frequently capture Slack conversations. They want to point at a thread URL and have Areté pull it directly.

## 2) Proposed Solution: BYO Slack App

Advanced users can connect their own Slack app/token for direct thread import:

- **User-provided Slack app**: User creates a Slack app in their workspace, provides the token to Areté
- **Thread URL import**: Paste a Slack thread URL → Areté fetches via API → runs through existing parse + extract pipeline
- **Minimal scopes**: Only `channels:history`, `groups:history`, `users:read` needed
- **Fallback**: Manual paste mode always available if API fails or isn't configured

### Setup Flow

1. User creates Slack app via Slack's app creation page (guided instructions)
2. Installs app to their workspace
3. Provides bot token to Areté (stored in workspace config)
4. Areté validates token with a test API call

## 3) Acceptance Criteria

1. Clear setup guide for creating a BYO Slack app with minimal required scopes
2. Token storage in workspace config (not committed to git)
3. Thread URL import fetches full thread including replies
4. Fetched content flows through existing parser + extraction pipeline
5. Graceful fallback to manual mode when API unavailable
6. Setup success rate ≥70%, setup time median ≤20 min
7. Import success after setup ≥80%

## 4) Out of Scope

- Areté-managed OAuth flow (Phase 4 / future)
- Channel-wide ingestion or continuous sync
- Real-time slash commands or webhooks
- Two-way Slack sync
- Posting back to Slack

## 5) Success Signals

- Setup success: ≥70% complete setup on first attempt
- Setup time: median ≤20 min
- Import success after setup: ≥80%
- Approval-friction rate measured and acceptable
- Support burden manageable (< X tickets/month per BYO user)

## 6) Risks

- Slack app approval policies vary by org — many orgs restrict custom apps
  - Mitigation: Clear docs on required admin permissions, fallback to manual
- Token management complexity — security, rotation, revocation
  - Mitigation: Store in local config only, validate on each use, clear error on expired token
- API rate limits for high-volume users
  - Mitigation: Implement basic rate limiting, queue imports
- Support burden may exceed value
  - Mitigation: Gate on Phase 2 metrics, comprehensive setup guide, self-service troubleshooting

## 7) Related

- **Initiative**: `dev/work/plans/slack-conversation-capture/plan.md`
- **Phase 1**: `dev/work/plans/slack-integration/plan.md` (Manual capture — complete)
- **Phase 2**: `dev/work/plans/slack-conversation-capture-phase-2/plan.md` (People modes)
