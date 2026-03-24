## Pre-Mortem: Unify Meeting Extraction

### Risk 1: Import Already Exists But Not Used — Partial Migration State

**Problem**: The code already imports `extractMeetingIntelligence` (line 19) but doesn't use it — it still calls `callStructured` (line 512). This suggests either a partially-started migration or an intended-but-not-executed change. Starting Step 3 without understanding why it wasn't completed could hit the same blocker.

**Mitigation**: Before Step 3, investigate the import. Check git log for when it was added and why. Look for TODOs or comments. If there was a blocker (e.g., format incompatibility, missing adapter), understand it before proceeding.

**Verification**: Step 3 tasks should start with "Investigate existing import history" and document what was found.

---

### Risk 2: Test Mock Response Format Is Deeply Embedded

**Problem**: The 30 tests use `makeMockDeps()` which returns `{ text: string, confidence: number }` items. This format is used in assertions throughout. Changing the mock to return `ActionItem[]` (with owner, ownerSlug, direction, description, confidence) requires updating every test that inspects the response, not just the mock factory.

**Mitigation**: 
1. Create a `mockCoreExtractionResponse()` helper that generates valid core format
2. Create a `mockActionItem()` helper with sensible defaults (owner: 'me', direction: 'i_owe_them')
3. Update tests incrementally — one describe block at a time

**Verification**: After Step 2, all 30 tests still pass. Run `npm test -- --grep "agent.test.ts"` after each test file change.

---

### Risk 3: Dedup Logic Uses `.text` But Core Uses `.description`

**Problem**: The existing dedup logic (line ~385-430 in agent.ts) compares `item.text` against user notes using Jaccard similarity. The core `ActionItem` type uses `.description` instead of `.text`. A direct swap will break dedup because the field doesn't exist.

**Mitigation**: In Step 3, create an adapter that maps core `ActionItem` to backend format:
```typescript
const adaptedItems = result.actionItems.map(ai => ({
  text: ai.description,  // Core uses description
  confidence: ai.confidence ?? 0.8,
  owner: ai.owner,
  direction: ai.direction,
  // ... other fields
}));
```

**Verification**: Dedup tests (there are 6 of them: "marks items matching user notes as dedup source", "auto-approves dedup items", etc.) must pass after Step 3.

---

### Risk 4: Confidence Score Calibration Mismatch

**Problem**: Backend uses 0.5/0.8 thresholds (include/auto-approve). Core extraction may produce different confidence distributions. If core's prompt or few-shot examples calibrate differently, you might filter out too many items or auto-approve too few.

**Mitigation**: 
1. Keep confidence thresholds unchanged initially
2. After integration, run a manual comparison: process 2-3 real meetings and compare old vs new extraction quality
3. If needed, adjust thresholds in Step 4

**Verification**: Step 4 includes "compare extraction quality" — make this explicit: same meeting, both code paths, compare item counts and approval rates.

---

### Risk 5: Core Extraction Returns `nextSteps` and `learnings` as Strings, Not Items with Confidence

**Problem**: Looking at the types, core `MeetingIntelligence` has:
- `actionItems: ActionItem[]` — has confidence
- `nextSteps: string[]` — no confidence
- `decisions: string[]` — no confidence
- `learnings: string[]` — no confidence

But backend expects confidence on all item types for filtering/approval. The plan only addresses action items explicitly.

**Mitigation**: Decisions and learnings in the backend also need confidence. Two options:
1. Assign default confidence (0.9) to decisions/learnings from core — they're already validated
2. Keep old extraction for decisions/learnings, only use core for actionItems

Recommend option 1 — simpler and core's validation is stricter anyway.

**Verification**: Tests for decisions/learnings still pass after Step 3 (there are specific tests for these: "formats decisions with de_XXX IDs").

---

### Risk 6: `formatStagedSections` Already Imported But Never Used

**Problem**: Like `extractMeetingIntelligence`, `formatStagedSectionsCore` is imported (line 20) but not used. The plan mentions using core formatter, but there may be backend-specific formatting (staged_item_status frontmatter, approval badges) that core formatter doesn't handle.

**Mitigation**: Before using core formatter, compare:
1. What does backend formatting produce? (Look at existing output)
2. What does core formatter produce?
3. Are they compatible?

If not compatible, keep backend formatting and only use core extraction.

**Verification**: Compare actual output markdown before/after to ensure owner badges appear without losing existing features.

---

### Risk 7: AIService.call() May Not Exist or Have Different Signature

**Problem**: Plan assumes `AIService.call()` exists with signature `(task, prompt) => Promise<{ text: string }>`. But the backend currently only uses `callStructured`. If `call()` doesn't exist or has a different signature, Step 1 is blocked.

**Mitigation**: Before starting Step 1, verify `AIService.call()` exists:
```bash
grep -n "call\(" packages/core/src/services/ai-service.ts
```
Check the signature matches what `extractMeetingIntelligence` expects.

**Verification**: Step 1 AC explicitly includes "createDefaultDeps wires to AIService.call()" — this will fail fast if call() doesn't exist.

---

## Summary

| Risk | Category | Likelihood | Impact | Step Affected |
|------|----------|------------|--------|---------------|
| Partial migration state | Context Gaps | Medium | Medium | 3 |
| Test mock format embedded | Test Patterns | High | Medium | 2 |
| `.text` vs `.description` field mismatch | Integration | High | High | 3 |
| Confidence calibration mismatch | Integration | Medium | Medium | 3-4 |
| nextSteps/decisions lack confidence | Integration | Medium | Medium | 3 |
| Core formatter may not handle backend needs | Integration | Medium | Medium | 3 |
| AIService.call() signature unknown | Dependencies | Low | High | 1 |

**Total risks identified**: 7
**Categories covered**: Context Gaps, Test Patterns, Integration (×4), Dependencies

**Highest-impact risks**: #3 (field mismatch) and #7 (API signature) — both are easy to verify before starting.
