# Pre-Mortem: Intelligence Tuning (INT-1 through INT-5)

**Date**: 2026-03-08
**Work Type**: New feature (intelligence quality improvements)
**Size**: Medium-Large (5 components)

---

## Risk 1: INT-1 ↔ INT-3 Interaction Confusion

**Problem**: Both INT-1 (filtering heuristics) and INT-3 (confidence-based pre-selection) reduce items. Without clear boundaries, implementers may:
- Over-filter in INT-1, leaving nothing for INT-3 to score
- Under-filter in INT-1, making INT-3 do redundant work
- Introduce conflicting thresholds that confuse the pipeline

**Mitigation**: Define explicit roles before implementation:
- **INT-1**: Filter garbage (transcript artifacts, vague statements, >150 char) — quality gate
- **INT-3**: Rank remaining items by confidence — prioritization layer
- Document this split in PRD task descriptions and acceptance criteria

**Verification**: Check that INT-1 ACs focus on "remove bad" and INT-3 ACs focus on "rank good"

---

## Risk 2: INT-2 Schema Dependency Not Surfaced

**Problem**: INT-2 requires distinguishing "user notes" from "AI-extracted" items. Current `ReviewItem` type has no `source` field. If this isn't addressed first, INT-2 implementation will stall.

**Mitigation**: 
1. Add schema dependency as explicit pre-task in PRD: "Add `source: 'user' | 'ai' | 'dedup'` field to ReviewItem"
2. Scope down INT-2 to deduplication-only if schema change is too disruptive
3. Alternative: Use fuzzy matching against meeting body text (no schema change needed)

**Verification**: Check PRD tasks include schema work before INT-2 implementation

---

## Risk 3: Frontend Auto-Approve Conflicts with INT-3

**Problem**: MeetingDetail.tsx already transforms `pending` → `approved` on load:
```tsx
const transformedItems = meeting.reviewItems.map((item) =>
  item.status === "pending" ? { ...item, status: "approved" as const } : item
);
```
INT-3 introduces backend-driven pre-selection. If frontend still overrides, INT-3's confidence logic is invisible to users.

**Mitigation**:
1. INT-3 must include task: "Remove frontend pending→approved transform"
2. Backend returns items with correct status based on confidence threshold
3. Test: verify frontend displays backend-provided status unchanged

**Verification**: After INT-3, check MeetingDetail.tsx no longer has pending→approved transform

---

## Risk 4: INT-5 "New Service" Duplicates Existing Code

**Problem**: `CommitmentsService.reconcile()` already implements Jaccard-based fuzzy matching. Plan describes "new reconciliation service" which would duplicate this.

**Mitigation**:
1. Update INT-5 scope: "Expose existing reconcile() via API endpoint + build UI"
2. Read `packages/core/src/services/commitments.ts` before starting
3. Extend reconcile() if needed, don't rebuild

**Verification**: INT-5 implementation imports existing CommitmentsService.reconcile()

---

## Risk 5: LLM Prompt Tuning Overshoots (Signal Loss)

**Problem**: INT-1's prompt changes ("be selective") might filter too aggressively. Important action items could be lost, and users won't notice until commitments are missed weeks later.

**Mitigation**:
1. **Preserve raw extractions**: Store original LLM response before filtering for N days
2. **Staged rollout**: Test on 5-10 existing meetings, manually verify no signal loss
3. **A/B capability**: Add feature flag for new vs old prompts (optional, if time permits)
4. **Negative test cases**: Include test cases for "items that MUST be extracted"

**Verification**: Check that raw extractions are logged/stored before filtering applied

---

## Risk 6: Context Gaps for Subagents

**Problem**: Subagents implementing individual INT-* tasks need to understand:
- Current extraction flow (meeting-extraction.ts)
- ReviewItem schema and status flow
- Frontend/backend contract
- Existing test patterns

Without this, they'll make incompatible changes.

**Mitigation**: Before each subagent task, provide explicit context:
- "Read these files first: meeting-extraction.ts, types.ts, MeetingDetail.tsx"
- Include mini-summary: "Extraction returns MeetingIntelligence, which becomes ReviewItem[] in API"
- Reference testDeps pattern from existing tests

**Verification**: Check prompts include file reading lists and architectural context

---

## Risk 7: Test Coverage Gaps

**Problem**: INT-1 changes prompts, INT-2 adds schema fields, INT-3 adds confidence logic, INT-4/5 modify commitments. Each needs tests, but test patterns may not be obvious for prompt-based code.

**Mitigation**:
1. **Prompt tests**: Test parseMeetingExtractionResponse() with varied inputs (existing pattern in meeting-extraction.test.ts)
2. **Schema tests**: Test ReviewItem serialization/deserialization with new fields
3. **Integration tests**: Test full flow from extraction → review → approval
4. Follow testDeps injection pattern from commitments.test.ts for LLM mocking

**Verification**: Each task's ACs include specific test requirements

---

## Risk 8: Acceptance Criteria Unmeasurable

**Problem**: Current ACs include:
- "No loss of genuinely important items" — how verified?
- "Signal-to-noise ratio improved" — how measured?
- "User approval rate > 80%" — no baseline captured

**Mitigation**:
1. Add baseline capture task: "Run current extraction on 10 test meetings, record counts"
2. Replace unmeasurable ACs with testable ones:
   - "Extraction test suite passes with expected item counts"
   - "Manual review of 5 meetings shows 0 false negatives for action items with owners"
3. Define approval rate formula: (approved / (approved + skipped)) × 100

**Verification**: PRD acceptance criteria can be evaluated with automated or documented tests

---

## Summary

**Total risks identified**: 8
**Categories covered**: Context Gaps, Integration, Scope Creep, Code Quality, Dependencies, Platform Issues, State Tracking, Test Patterns

**Critical mitigations**:
1. Define INT-1 vs INT-3 roles explicitly (filter vs rank)
2. Add schema dependency for INT-2
3. Remove frontend auto-approve in INT-3
4. Reuse existing reconcile() for INT-5
5. Preserve raw extractions for rollback
6. Include file-reading context for all subagent tasks

**Ready to proceed with these mitigations incorporated into PRD.**
