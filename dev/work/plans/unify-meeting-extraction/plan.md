---
title: Unify Meeting Extraction
slug: unify-meeting-extraction
status: building
size: medium
tags: [meetings, extraction, backend, refactor]
created: 2026-03-12T00:00:00.000Z
updated: 2026-03-12T14:24:05.461Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 4
---

# Unify Meeting Extraction

## Problem Statement

Arete has **two separate meeting extraction implementations** that do the same thing differently:

| Aspect | Web UI (agent.ts) | CLI (meeting-extraction.ts) |
|--------|-------------------|----------------------------|
| Location | `packages/apps/backend/src/services/agent.ts` | `packages/core/src/services/meeting-extraction.ts` |
| Created | Earlier (basic) | Mar 4-9, 2026 (sophisticated) |
| Owner attribution | ❌ None | ✅ Full (owner, direction, counterparty) |
| Confidence scoring | ✅ Basic (text + confidence) | ✅ Rich (per-item with calibration) |
| Validation filters | ❌ None | ✅ Garbage, length, dedup |
| Few-shot examples | ❌ None | ✅ Positive and negative examples |
| Prompt quality | Basic | Production-grade |

**Result**: Users processing meetings via Web UI get inferior extractions compared to CLI.

## User Value

When complete:
- **Owner attribution in Web UI**: "@sarah → @john: Send report" instead of just "Send report"
- **Better extraction quality**: Fewer garbage items, better confidence calibration
- **Consistency**: Same extraction quality regardless of how you process meetings

## Technical Context

### Current Web UI Flow (agent.ts)
```typescript
// 1. Call AI with basic prompt
const result = await aiService.callStructured('extraction', basicPrompt, schema);
// Returns: { actionItems: [{ text, confidence }] }

// 2. Filter by confidence (< 0.5 excluded)
const filtered = filterByConfidence(result);

// 3. Dedup against user notes (Jaccard > 0.7)
const sources = determineItemSources(filtered, userNotes);

// 4. Auto-approve high confidence (> 0.8)
const status = determineItemStatus(sources, confidences);

// 5. Format to markdown
const markdown = formatStagedSections(filtered, summary);
```

### Target Flow (using core extraction)
```typescript
// 1. Call core extraction service (sophisticated prompt, owner attribution)
const result = await extractMeetingIntelligence(transcript, callLLM, { attendees });
// Returns: { actionItems: [{ owner, ownerSlug, direction, description, confidence }] }

// 2. Core service already filters and validates

// 3. Apply backend-specific logic (dedup, auto-approval)
// ... keep existing logic but adapt to new types

// 4. Format using core formatter (includes owner notation)
const markdown = formatStagedSections(result);
```

### Key Challenge: Test Refactoring

The backend has **30+ tests** that mock `callStructured` and expect the old response format. These need to be updated to:
1. Mock the new `call` method (raw text, not structured)
2. Return JSON matching the core extraction schema
3. Validate the same behaviors (confidence filtering, dedup, auto-approval)

---

## Plan

### Step 1: Add call() Method to ProcessingDeps
**Goal**: Enable agent.ts to make raw LLM calls (required by extractMeetingIntelligence)

**Tasks**:
- Add `call` method to `ProcessingDeps` interface in agent.ts
- Update `createDefaultDeps()` to include the call adapter
- Verify existing tests still pass (no behavior change yet)

**Acceptance Criteria**:
- [ ] ProcessingDeps has `call(task, prompt) => Promise<{ text: string }>`
- [ ] createDefaultDeps wires to AIService.call()
- [ ] All existing tests pass

**Estimate**: 0.5 day

---

### Step 2: Refactor Test Mocks for New Format
**Goal**: Update test infrastructure to support both old and new extraction formats

**Tasks**:
- Create helper to generate mock responses in core extraction format
- Update `makeMockDeps` to support both `call` and `callStructured`
- Add option to specify which format tests use (for gradual migration)
- Update individual tests to use new format where appropriate

**Acceptance Criteria**:
- [ ] Mock helper generates valid core extraction format responses
- [ ] Tests can specify old or new extraction format
- [ ] All tests pass with updated mocks

**Estimate**: 1 day

---

### Step 3: Wire Backend to Core Extraction Service
**Goal**: Replace inline prompting with extractMeetingIntelligence

**Tasks**:
- Import `extractMeetingIntelligence` and `formatStagedSections` from core
- Create `callLLM` adapter function that uses `deps.aiService.call()`
- Replace inline extraction with core service call
- Map `ActionItem[]` to existing downstream types where needed
- Keep dedup logic (matching user notes) — this is backend-specific
- Keep auto-approval logic — adapt to work with new confidence scores

**Acceptance Criteria**:
- [ ] Web UI extraction uses extractMeetingIntelligence
- [ ] Owner/direction appear in extracted action items
- [ ] Dedup against user notes still works
- [ ] Auto-approval based on confidence still works
- [ ] All tests pass

**Estimate**: 1.5 days

---

### Step 4: Validate and Clean Up
**Goal**: Ensure parity and remove dead code

**Tasks**:
- Manual testing: process a real meeting via Web UI, verify owner attribution
- Compare extraction quality: Web UI vs CLI should produce similar results
- Remove old `buildExtractionPrompt` and related dead code
- Update any documentation or comments
- Run full test suite

**Acceptance Criteria**:
- [ ] Manual test confirms owner badges appear in Web UI
- [ ] No dead code remains
- [ ] Full test suite passes
- [ ] LEARNINGS.md updated if any gotchas discovered

**Estimate**: 0.5 day

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Test refactoring takes longer than expected | Medium | Medium | Step 2 is isolated; can timebox |
| Behavior differences between old and new extraction | Medium | High | Keep existing filtering/approval logic, only replace LLM call |
| Core extraction returns different confidence scores | Low | Medium | Calibrate thresholds if needed |
| Dedup logic doesn't work with new format | Low | Medium | ActionItem.description maps to text; should work |

---

## Out of Scope

- Changing confidence thresholds (keep existing 0.5/0.8)
- Modifying core extraction service behavior
- Adding new extraction capabilities (context injection, etc.)

---

## Success Metrics

- **Parity**: Web UI extraction includes owner/direction (currently 0%)
- **Quality**: Fewer garbage items extracted (qualitative)
- **Tests**: All 30+ backend tests pass
- **No regressions**: Existing approval→commitments flow works

---

## Effort Estimate

| Step | Effort |
|------|--------|
| Step 1: Add call() method | 0.5 day |
| Step 2: Refactor test mocks | 1 day |
| Step 3: Wire backend | 1.5 days |
| Step 4: Validate and clean up | 0.5 day |
| **Total** | **3.5 days** |

**Size**: Medium (4 steps)

---

## Dependencies

- Meeting Processing Improvements plan (complete) — provides type infrastructure
- Commit 38be75e — provides approval→commitments flow

---

## Next Steps

1. Review this plan
2. Run `/pre-mortem` (recommended for medium plans)
3. Run `/review` for second opinion
4. `/approve` and `/build`
