---
title: Slack Conversation Capture — Phase 1
slug: slack-integration
status: draft
size: large
created: 2026-02-18T19:59:27.611Z
updated: 2026-02-19T14:38:59.042Z
completed: null
has_review: false
has_pre_mortem: true
has_prd: true
backlog_ref: dev/backlog/features/slack-conversation-capture.md
steps: 6
---

## Overview

Phase 1: Manual ingestion of Slack conversations into durable `conversation` artifacts with extracted insights.

## PRD

The build spec lives at: `dev/prds/slack-conversation-capture-phase-1/prd.md`

## Delivery Steps (from PRD §11)

1. Define `conversation` artifact schema and save contract
2. Implement manual ingestion + parsing + insight extraction flow
3. Add edit/redact-before-save UX
4. Integrate with memory/people intelligence pathways
5. Instrument metrics and run pilot
6. Phase review: Go / Iterate / Stop for Phase 2

## Next Actions

- [x] Run `/pre-mortem` before build handoff → `dev/plans/slack-integration/pre-mortem.md`
- [ ] Review pre-mortem mitigations and update PRD scope (especially: integration = file-based only, edit/redact = conversational, no Slack-specific parsing)
- [ ] Convert PRD to `prd.json` for autonomous execution
- [ ] Begin build

## Related

- Initiative: `dev/backlog/features/slack-conversation-capture.md`
- Phase 2 backlog: `dev/backlog/features/slack-conversation-capture-phase-2.md`
