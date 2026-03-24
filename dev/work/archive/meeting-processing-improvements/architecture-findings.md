# Architecture Findings: Meeting Processing

**Date**: 2026-03-10

---

## Key Files

### UI Processing Path
- **Entry**: `packages/apps/web/src/api/meetings.ts` → `processMeeting(slug)`
- **Route**: `packages/apps/backend/src/routes/meetings.ts` → `POST /api/meetings/:slug/process`
- **Logic**: `packages/apps/backend/src/services/agent.ts` → `runProcessingSession()`
- **AI**: `packages/core/src/services/ai.ts` → `AIService.callStructured()`

### Commitments Path
- **Parser**: `packages/core/src/services/meeting-parser.ts` → `parseActionItemsFromMeeting()`
- **Sync**: `packages/core/src/services/entity.ts` → `CommitmentsService.sync()`
- **Storage**: `.arete/commitments.json`
- **Service**: `packages/core/src/services/commitments.ts`

### Better Extraction (Unused by UI)
- **Logic**: `packages/core/src/services/meeting-extraction.ts`
- **CLI**: `packages/cli/src/commands/meeting.ts` → `arete meeting extract`

### Meeting Storage
- **Approval**: `packages/core/src/integrations/staged-items.ts` → `commitApprovedItems()`
- **Template**: `packages/runtime/skills/krisp/templates/meeting.md`

---

## Section Names (Current)

| Stage | Section Name | Format |
|-------|-------------|--------|
| After processing | `## Staged Action Items` | `- ai_001: Text` |
| After approval | `## Approved Action Items` | `- [ ] Text` |
| Commitments expects | `## Action Items` | `- [ ] Text (@owner → @counterparty)` |

**Problem**: Names don't match, formats don't match.

---

## Extraction Prompt Comparison

### agent.ts (UI) — Simple
```
Analyze this meeting transcript and extract:
1. A 2-4 sentence summary
2. Action items - specific tasks assigned or committed to
3. Decisions - choices or conclusions made
4. Learnings - insights or important information

For each item, provide confidence 0-1...
```
- No attendee context
- No owner attribution
- No direction classification
- No validation beyond confidence

### meeting-extraction.ts (CLI) — Sophisticated
```
Extract ONLY high-confidence, specific items.
- Skip vague intentions
- Skip trivial follow-ups  
- Skip items without clear owner AND concrete deliverable

action_items: [{
  owner, owner_slug, description, direction,
  counterparty_slug, due, confidence
}]
```
- Owner attribution with slugs
- Direction: `i_owe_them` / `they_owe_me`
- Counterparty tracking
- Validation: garbage detection, dedup, limits

---

## Data Flow Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Krisp Sync   │────▶│ Meeting File     │────▶│ UI: Process Meeting │
│ (transcript) │     │ (## Transcript)  │     │ (agent.ts)          │
└──────────────┘     └──────────────────┘     └──────────┬──────────┘
                                                         │
                                                         ▼
                                              ┌─────────────────────┐
                                              │ ## Staged Action    │
                                              │ Items (ai_001: ...) │
                                              └──────────┬──────────┘
                                                         │ User Approval
                                                         ▼
                                              ┌─────────────────────┐
                                              │ ## Approved Action  │
                                              │ Items (- [ ] ...)   │
                                              └──────────┬──────────┘
                                                         │
                                                         ▼
                                              ┌─────────────────────┐
                                              │ Commitments System  │
                                              │ looks for:          │
                                              │ ## Action Items     │ ← MISMATCH!
                                              │ (- [ ] @x → @y)     │
                                              └─────────────────────┘
                                                         │
                                                         ▼
                                              ┌─────────────────────┐
                                              │ commitments.json    │
                                              │ (EMPTY - items      │
                                              │ never get here)     │
                                              └─────────────────────┘
```

---

## LEARNINGS.md Locations

Relevant existing LEARNINGS files:
- `packages/apps/backend/LEARNINGS.md` — AIService integration, gray-matter gotchas
- `packages/core/src/services/LEARNINGS.md` — if exists
- `packages/core/src/integrations/LEARNINGS.md` — staged items gotchas
