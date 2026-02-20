---
title: Conversation Capture — Phase 1
slug: slack-conversation-capture-phase-1
status: complete
size: medium
tags: [feature]
created: 2026-02-18T19:59:27.611Z
updated: 2026-02-20T22:16:01.096Z
completed: 2026-02-20T22:16:01.096Z
execution: null
has_review: false
has_pre_mortem: true
has_prd: true
steps: 4
---

## Problem

PMs lose critical context buried in Slack threads. Decisions, action items, and stakeholder signals don't make it into durable Areté context. There's no way to turn a conversation into a reusable artifact.

## Solution (Phase 1)

Manual paste-based conversation capture: user pastes text → system parses and extracts insights → user reviews → saves as `conversation` artifact discoverable by `arete context`.

**Source-agnostic**: works with any pasted conversation text (Slack, Teams, email threads, etc.). No Slack-specific parsing.

## Delivery Steps

### Step 1: Conversation artifact schema + save infrastructure
- Define `ConversationForSave` type following `MeetingForSave` pattern
- Fields: title, date, source (`manual`), participants (text list), raw transcript, normalized content, insights (each optional: summary, decisions, actions, questions, stakeholders, risks), provenance metadata
- Save function: `saveConversationFile()` → `resources/conversations/{date}-{slug}.md`
- Add `resources/conversations` to `BASE_WORKSPACE_DIRS` in `workspace-structure.ts`
- Conversation markdown template with frontmatter (title, date, source)
- **AC**: Type exists, save function writes valid markdown with frontmatter, unit tests pass for save + filename generation

### Step 2: Manual ingestion pipeline (parse + extract)
- Text parser with fallback chain: structured with timestamps → structured without timestamps → raw text paragraphs → always succeeds (never throws)
- LLM insight extraction via single prompt: structured JSON output with optional sections (summary, decisions, actions, questions, stakeholders, risks)
- Empty/missing sections handled gracefully (omitted, not blank headers)
- **AC**: Parser tests for 4+ input formats (all produce valid output). Extraction produces structured output for real conversation samples. Pipeline end-to-end: paste text → parsed + extracted result.

### Step 3: Review + save flow
- Conversational UX: agent presents extracted output, user reviews, says "change X" or confirms
- On confirm → save via `saveConversationFile()`
- No custom editor, no interactive CLI prompts — just chat-based review
- **AC**: Full flow works: paste → extract → review → save. Saved file exists at expected path with correct content.

### Step 4: Context discoverability
- Verify saved conversations are found by `arete context --for "topic"` via existing glob patterns
- If not: add glob pattern for `resources/conversations/*.md` to context service
- **AC**: After saving a conversation about topic X, `arete context --for "X"` includes it in results.

## What's Explicitly Out of Scope (Phase 1)

- People intelligence / people mapping (Phase 2)
- Slack API integration / thread URL import (Phase 2)
- Slack-specific parsing (emoji, mentions, threads)
- Custom interactive editor for edit/redact
- People-processing modes (off/ask/on) (Phase 2)
- Metrics instrumentation (post-ship follow-up)
- Two-way sync, real-time push, continuous ingestion

## Pre-Mortem

Completed: `dev/work/plans/slack-conversation-capture-phase-1/pre-mortem.md`

Key mitigations incorporated:
- Source-agnostic naming (not "Slack parser")
- Parser fallback chain (never fails on input)
- Each insight section optional
- Integration = file-based discovery only (no service changes unless glob fix needed)
- Edit/redact = conversational flow (no custom UI)

## Related

- Initiative: `dev/work/plans/slack-conversation-capture/plan.md`
- Phase 2: `dev/work/plans/slack-conversation-capture-phase-2/plan.md` (People modes)
- Phase 3: `dev/work/plans/slack-conversation-capture-phase-3/plan.md` (BYO Slack App)
- PRD: `dev/work/plans/slack-conversation-capture-phase-1/prd.md`
