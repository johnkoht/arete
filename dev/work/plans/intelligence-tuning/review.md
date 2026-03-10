# Review: Intelligence Tuning (INT-1 through INT-5)

**Type**: Plan (pre-execution)  
**Audience**: Builder (internal Areté development)  
**Reviewer**: Cross-model review via review-plan skill  
**Date**: 2026-03-08

---

## Concerns

### 1. **Scope: INT-1 ↔ INT-3 Overlap**
Both INT-1 (filtering heuristics, category limits) and INT-3 (confidence-based pre-selection) reduce items. The plan doesn't clarify their interaction — are they complementary or redundant?

- **Suggestion**: Define the relationship explicitly. Option A: INT-1 filters aggressively, INT-3 becomes unnecessary. Option B: INT-1 filters lightly, INT-3 does the heavy lifting. Option C: INT-1 filters garbage, INT-3 ranks what remains. Pick one.

### 2. **Dependencies: INT-2 Assumes Non-Existent Schema**
INT-2 requires detecting "user-written content vs transcript-derived." Current `ReviewItem` type has no `source` field:
```ts
type ReviewItem = { id: string; type: ItemType; text: string; status: ItemStatus; };
```
There's no way to mark items as "from user notes" vs "AI-extracted."

- **Suggestion**: Add explicit dependency: "INT-2 requires schema change to `ReviewItem` (add `source: 'user' | 'ai'` field)." Or scope down INT-2 to just deduplication (compare extractions against meeting body text).

### 3. **Dependencies: INT-4 References Undefined "Health Score"**
INT-4 mentions "Person importance (health score, category)" for priority scoring. The actual `computeRelationshipHealth()` returns a `HealthIndicator` ('active'|'regular'|'cooling'|'dormant'), not a numeric score.

- **Suggestion**: Clarify: either use the existing indicator (map to numeric: active=3, regular=2, cooling=1, dormant=0) or note that a numeric health score must be added.

### 4. **Patterns: INT-5 Reconciliation Already Partially Exists**
`CommitmentsService.reconcile()` already implements Jaccard-based fuzzy matching. INT-5 describes building this from scratch.

- **Suggestion**: Update INT-5 to "Expose existing `reconcile()` via API + build UI" rather than "New reconciliation service."

### 5. **Completeness: No Baseline Measurement**
Success metrics claim "40-60% reduction" but there's no step to capture current baseline before changes.

- **Suggestion**: Add INT-0.5 or pre-work: "Capture baseline metrics (avg items/meeting, approval rate) from recent N meetings before starting INT-1."

### 6. **Completeness: Acceptance Criteria Unmeasurable**
- "No loss of genuinely important items" — how do we verify this?
- "Signal-to-noise ratio improved" — how measured?

- **Suggestion**: Make ACs testable. Example: "Run extraction on 10 test meetings pre/post, manually verify 0 important items lost."

### 7. **Backward Compatibility: Frontend Already Auto-Approves**
MeetingDetail.tsx already defaults `pending` → `approved` in local state:
```tsx
const transformedItems = meeting.reviewItems.map((item) =>
  item.status === "pending" ? { ...item, status: "approved" as const } : item
);
```
INT-3's threshold-based pre-selection may conflict with this existing behavior.

- **Suggestion**: Note this in INT-3 — "Replace existing frontend auto-approve with backend-driven pre-selection" or "Remove frontend transform after INT-3 is live."

### 8. **Risks: No Rollback or A/B Mechanism**
Extraction quality tuning is experimental. Over-tuning could lose important signals.

- **Suggestion**: Add mitigation: "Preserve raw extractions (before filtering) for N days to enable comparison/rollback."

---

## Strengths

- **Clear problem statement**: "AI captures too much, lots of cleanup required" is specific and relatable
- **Well-sequenced**: Dependencies between INT-1→5 are logical
- **Success metrics**: Concrete targets (items/meeting, approval rate, review time)
- **Technical notes**: Prompt engineering guidelines are practical and specific
- **Existing primitives**: CommitmentsService.reconcile() and computeRelationshipHealth() already exist — less greenfield than it appears

---

## Devil's Advocate

**If this fails, it will be because...** INT-1's prompt tuning overshoots. We filter too aggressively, users miss important action items, but don't notice immediately because meetings flow by. By the time someone realizes "wait, we agreed to X but it never got tracked," trust in the system erodes. Confidence scoring (INT-3) can't save bad prompts — garbage in, garbage out.

**The worst outcome would be...** Users lose trust in meeting intelligence entirely. After one or two missed commitments slip through, they stop relying on the system and go back to manual note-taking. The whole intelligence layer becomes "that thing that sometimes captures stuff" — optional rather than essential. All 5 components ship, but adoption regresses.

---

## Verdict

- [ ] **Approve** — Ready to proceed
- [x] **Approve with suggestions** — Minor improvements recommended
- [ ] **Revise** — Address concerns before proceeding

**Summary**: The plan is solid conceptually. The main gaps are:
1. Clarify INT-1 ↔ INT-3 relationship (filter vs score)
2. Acknowledge INT-2 needs schema work (or scope it down)
3. Recognize existing primitives (reconcile, health indicator)
4. Add baseline capture step
5. Add rollback mitigation

These are refinements, not blockers. The plan can proceed with these items addressed in PRD breakdown.

---

## Codebase Findings (Reference)

### Existing Primitives
- `CommitmentsService.reconcile()` — Jaccard-based fuzzy matching already exists in `packages/core/src/services/commitments.ts`
- `computeRelationshipHealth()` — Returns HealthIndicator in `packages/core/src/services/person-health.ts`
- Meeting extraction validation — 150 char limit, garbage prefix filtering in `packages/core/src/services/meeting-extraction.ts`

### Schema Gaps
- `ReviewItem` has no `source` field (needed for INT-2)
- No confidence score in extraction results (needed for INT-3)

### Frontend Behavior
- MeetingDetail.tsx transforms `pending` → `approved` on load (relevant to INT-3)
