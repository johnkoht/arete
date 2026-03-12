---
title: Meeting Processing Improvements
slug: meeting-processing-improvements
status: draft
size: large
tags: [meetings, extraction, intelligence]
created: 2026-03-10T00:00:00.000Z
updated: 2026-03-10T00:00:00.000Z
completed: null
execution: null
has_review: false
has_pre_mortem: false
has_prd: false
steps: 4
---

# Meeting Processing Improvements

## Problem Statement

Meeting processing currently scores ~5-6/10. Key issues:

1. **No context injection** — LLM extracts without knowing who attendees are, what projects are relevant, or user's role
2. **Architecture mismatch** — UI creates `## Approved Action Items` but commitments system looks for `## Action Items`
3. **Generic prompting** — No few-shot examples, single-pass extraction, no validation
4. **Action items lack structure** — No owner attribution, no entity linking

### Example Failure

> "John will take over communications work from Jamie, focusing on getting email with POP out the door"

This was extracted as an action item, but it's describing John's existing role (what he was hired for), not a new commitment. The LLM had no context about John's responsibilities.

---

## Architecture Discovery

### Two Disconnected Systems

**System 1: UI Meeting Processing** (`packages/apps/backend/src/services/agent.ts`)
- Uses `AIService.callStructured()` with a generic extraction prompt
- Creates `## Staged Action Items` → after approval → `## Approved Action Items`
- Format: `- [ ] Bob will draft Q2 plan` (no owner notation)

**System 2: Person Memory / Commitments** (`packages/core/src/services/entity.ts`)
- Looks for `## Action Items` section (different name!)
- Uses `parseActionItemsFromMeeting()` expecting arrow notation
- Format: `- [ ] Text here (@john-smith → @sarah-chen)`
- Syncs to `.arete/commitments.json`

**Result**: Approved action items never flow into commitments because:
1. Section name mismatch (`Approved Action Items` vs `Action Items`)
2. Format mismatch (no arrow notation)

### Better Extraction Exists

`packages/core/src/services/meeting-extraction.ts` has a more sophisticated extraction:
- Owner attribution with slugs
- Direction classification (`i_owe_them` / `they_owe_me`)
- Counterparty tracking
- Confidence scoring
- Validation filters (garbage detection, dedup, limits)

But the **backend UI doesn't use it**.

---

## Phased Approach

### Phase 1: Foundation — Unify Extraction Pipeline
**Goal**: Single extraction path, commitments flow works

**Tasks**:
1. Replace `agent.ts` extraction with `meeting-extraction.ts` logic
2. Unify section naming:
   - Processing creates `## Staged Action Items`
   - Approval creates `## Action Items` (not "Approved Action Items")
3. Update `meeting-parser.ts` if needed to handle both formats
4. Add attendee context to extraction prompt (names from frontmatter)
5. Test end-to-end: process → approve → commitments.json

**Acceptance Criteria**:
- [ ] Approved action items appear in commitments
- [ ] Action items have owner attribution (`@slug → @slug`)
- [ ] Single extraction code path for UI and CLI

---

### Phase 2: Context Injection
**Goal**: Extraction has full context about people, projects, and user

**Tasks**:
1. Resolve attendees → fetch `people/*.md` profiles
2. Inject attendee context into prompt:
   - Role, company, relationship
   - Recent meeting history with them
3. Inject user profile (workspace owner):
   - Role, responsibilities
   - What they were "hired for"
4. Check for linked agenda → inject if exists
5. Pull relevant project context (from `projects/` if attendees are linked)

**Acceptance Criteria**:
- [ ] Extraction prompt includes attendee profiles
- [ ] User's role/responsibilities are in context
- [ ] "John taking over communications" case is handled correctly

---

### Phase 3: Improved Prompting
**Goal**: Higher quality extractions with better accuracy

**Tasks**:
1. Add few-shot examples:
   - Good action item extractions (with confidence scores)
   - NOT action items (role descriptions, past decisions, vague intentions)
   - Good decision extractions
   - Good learning extractions
2. Leverage Krisp summaries as input (if available)
   - Use as additional signal, not replacement
3. Improve confidence calibration
4. Add extraction reasoning (why this is/isn't an action item)

**Few-Shot Example Structure**:
```markdown
### Example: Action Item (INCLUDE)
Transcript: "Sarah, can you send me the API docs by Friday?"
✅ Extract: "Send API docs" | Owner: @sarah | Due: Friday | Confidence: 0.95

### Example: NOT an Action Item (EXCLUDE)
Transcript: "John's been handling all customer comms since he joined"
❌ Do NOT extract — describes existing responsibility, not new commitment
```

**Acceptance Criteria**:
- [ ] Few-shot examples in prompt
- [ ] Krisp summaries used as input signal
- [ ] Confidence scores are well-calibrated (high = real commitments)

---

### Phase 4: Multi-Step Pipeline (Enhancement)
**Goal**: Production-grade extraction with validation

**Pipeline**:
```
Step 1: Context Assembly
  - Resolve attendees → fetch profiles
  - Find linked agenda
  - Search recent meetings with same people
  - Pull project context

Step 2: Transcript Understanding
  - Who said what (speaker attribution)
  - Topics discussed
  - Key moments identified

Step 3: Extraction with Context
  - Given: transcript + context + understanding
  - Extract: action items, decisions, learnings
  - Attribute: owner, counterparty, project

Step 4: Validation & Enrichment
  - Check: Is this new or describing existing state?
  - Link: @person-slug, [[project-slug]]
  - Score: Confidence with reasoning
```

**Acceptance Criteria**:
- [ ] Multi-step pipeline implemented
- [ ] Validation catches "existing role" false positives
- [ ] Entity linking works

---

## Design Decisions

### Section Naming
**Decision**: After approval, section becomes `## Action Items` (not `## Approved Action Items`)
**Rationale**: Matches what `meeting-parser.ts` expects for commitments flow

### Action Item Format
**Decision**: Use inline arrow notation `(@owner → @counterparty)`
**Rationale**: 
- Human-readable in markdown
- Already implemented in `meeting-extraction.ts`
- Parser already supports it

### Context Injection Strategy
**Decision**: Pre-fetch and inject (not agentic)
**Rationale**: Predictable, testable, no tool-calling complexity

### Krisp Summaries
**Decision**: Use as additional input signal, not ignored
**Rationale**: Free information that might catch things our extraction misses

---

## Files to Modify

### Phase 1
- `packages/apps/backend/src/services/agent.ts` — replace extraction logic
- `packages/core/src/integrations/staged-items.ts` — change "Approved Action Items" to "Action Items"
- `packages/core/src/services/meeting-parser.ts` — verify compatibility
- Tests for all above

### Phase 2
- `packages/apps/backend/src/services/agent.ts` — add context assembly
- `packages/core/src/services/entity.ts` — expose profile fetching for reuse
- New: context injection utilities

### Phase 3
- `packages/core/src/services/meeting-extraction.ts` — add few-shot examples
- Prompt templates (could externalize to file)

### Phase 4
- New: multi-step pipeline orchestration
- New: validation service

---

## Open Questions

1. **Phase 1 scope**: Should we also fix the CLI `arete meeting extract` to use the same unified path, or defer?

2. **Backward compatibility**: Existing meetings have `## Approved Action Items`. Should we:
   - Add migration to rename sections?
   - Have parser check both section names?

3. **Performance**: Context injection adds latency. Should we:
   - Cache person profiles?
   - Parallelize fetches?
   - Make context depth configurable?

---

## Success Metrics

- **Accuracy**: Action item extraction precision improves from ~60% to ~85%+
- **Commitments flow**: 100% of approved action items appear in commitments
- **False positive reduction**: "Existing role" descriptions no longer extracted
- **User satisfaction**: Meeting processing feels "actually useful" (qualitative)

---

## Next Steps

1. Review and refine this plan
2. Run pre-mortem (Phase 1 is foundational — identify risks)
3. Convert to PRD for execution
