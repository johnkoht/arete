# PRD: Conversation Capture — Phase 1 (Manual Ingestion)

**Status**: Ready  
**Owner**: Product + Engineering  
**Size**: Medium (4 steps)  
**Date**: 2026-02-20  
**Plan**: `dev/work/plans/slack-integration/plan.md`  
**Pre-mortem**: `dev/work/plans/slack-integration/pre-mortem.md`

---

## 1) Problem Statement

PMs lose critical context in Slack conversations. Decisions, action items, risks, and stakeholder signals don't reliably make it into Areté context/memory. Without a fast way to capture and structure that context, planning and execution suffer from missing information.

## 2) Goal

Deliver a manual ingestion flow that converts pasted conversation text into a durable `conversation` artifact with extracted insights, discoverable by existing Areté context workflows.

## 3) Users

Primary: PMs at startups who use Slack threads heavily and need context carryover into Areté.

## 4) Scope

### In Scope
1. Manual paste flow for conversation text (source-agnostic — works with Slack, Teams, email, etc.)
2. Parse and normalize conversation content with fallback chain
3. Extract insights via LLM: summary, decisions, action items, open questions, stakeholders, risks (each optional)
4. Conversational review-before-save (user confirms or requests changes in chat)
5. Save as `conversation` artifact to `resources/conversations/` with provenance `source=manual`
6. Discoverable by `arete context` via existing file-based patterns

### Out of Scope
- Slack API integration (BYO or managed OAuth) — Phase 2+
- Thread URL import — Phase 2+
- People intelligence / people mapping — Phase 2
- People-processing modes (off/ask/on) — Phase 2
- Slack-specific parsing (emoji, `<@U123>` mentions, thread detection)
- Custom interactive editor or redaction UI
- Two-way sync, real-time push, continuous ingestion
- Metrics instrumentation (post-ship follow-up)

## 5) User Stories

1. As a PM, I can paste a conversation and get a clean structured summary with extracted insights I can trust.
2. As a PM, I can review and edit the extracted output conversationally before it's saved.
3. As a PM, the saved conversation is automatically discoverable when I use `arete context` for related topics.

## 6) Functional Requirements

### FR-1: Conversation Artifact Schema
- `ConversationForSave` type with: title, date, source, participants (text list), raw transcript, normalized content, insights object, provenance metadata
- Each insight section (summary, decisions, actions, questions, stakeholders, risks) is **optional** — don't force sections when content doesn't warrant them
- Save function `saveConversationFile()` following `saveMeetingFile()` pattern
- Filename convention: `{date}-{title-slug}.md`
- Output directory: `resources/conversations/`
- Add `resources/conversations` to `BASE_WORKSPACE_DIRS`

### FR-2: Text Parser
- Fallback chain: try structured with timestamps → structured without timestamps → raw text paragraph splitting → always succeed
- Detect `Name: message` or `[timestamp] Name: message` patterns
- No Slack-specific parsing (no emoji, no `<@mention>`, no thread markers)
- Extract participant names as plain text list from detected speaker turns

### FR-3: Insight Extraction
- Single LLM prompt producing structured JSON output
- Sections: summary, decisions, action_items, open_questions, stakeholders, risks
- Each section optional — omit if not present in conversation
- Prompt is source-agnostic (may mention "this could be from Slack or another source")

### FR-4: Review + Save Flow
- Agent presents extracted output in chat
- User reviews, requests changes conversationally, or confirms
- On confirm: save via `saveConversationFile()`
- Saved artifact includes: frontmatter (title, date, source), raw transcript, normalized content, all extracted insights

### FR-5: Context Discoverability
- Saved conversations discoverable by `arete context --for "query"`
- If existing glob patterns in ContextService don't cover `resources/conversations/`, add the pattern
- No changes to IntelligenceService, MemoryService, or EntityService

## 7) Non-Functional Requirements

- Deterministic save behavior (no partial writes)
- Graceful handling of malformed/empty input (parser never throws)
- No Slack API dependencies
- All new code has unit tests

## 8) Acceptance Criteria

### AC-1: Schema + Save
- `ConversationForSave` type exists with all required fields
- `saveConversationFile()` writes valid markdown with frontmatter
- `resources/conversations` exists in `BASE_WORKSPACE_DIRS`
- Unit tests for save function and filename generation

### AC-2: Parser
- Tests for 4+ input formats: structured with timestamps, structured without, unstructured blob, empty/minimal
- All produce valid output (never throw)
- No Slack-specific code (search codebase: parser has no emoji/mention/thread handling)

### AC-3: Extraction
- Structured JSON output from LLM with optional sections
- Valid output for at least 3 real conversation samples
- Missing sections omitted gracefully

### AC-4: End-to-End Flow
- Paste text → parse → extract → review → confirm → saved file
- Saved file at `resources/conversations/{date}-{slug}.md`
- File contains frontmatter + raw + insights

### AC-5: Discoverability
- `arete context --for "topic from saved conversation"` includes the conversation in results

## 9) Delivery Plan

| Step | Description | Dependencies |
|------|-------------|--------------|
| 1 | Conversation artifact schema + save infrastructure | None |
| 2 | Manual ingestion pipeline (parse + extract) | Step 1 |
| 3 | Review + save flow | Steps 1, 2 |
| 4 | Context discoverability | Step 1 |

Steps 3 and 4 can be done in parallel after steps 1-2.

## 10) Risks & Mitigations (from pre-mortem)

| Risk | Severity | Mitigation |
|------|----------|------------|
| No conversation artifact type exists | High | Build schema first, follow MeetingForSave pattern |
| Paste format is highly variable | High | Fallback chain parser — always succeeds |
| Insight extraction quality uncertain | Medium | Optional sections, single prompt, edit-before-save is the safety net |
| Edit/redact UX underspecified | Medium | Conversational flow only — no custom UI |
| Integration scope creep | High | File-based discovery only, no service changes |
| Scope creep into Slack-specific features | Medium | Source-agnostic naming, no Slack-specific parsing |

## 11) Definition of Done

- All acceptance criteria met (AC-1 through AC-5)
- `npm run typecheck` passes
- `npm test` passes (including new tests)
- Conversation saved and discoverable in a test workspace
- PRD marked complete
