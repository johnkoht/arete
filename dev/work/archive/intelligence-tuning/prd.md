# PRD: Intelligence Tuning (Meeting Extraction Quality)

**Version**: 1.0  
**Status**: Draft  
**Date**: 2026-03-08  
**Depends on**: INT-0 (Service Normalization) ✅ Complete

---

## 1. Problem & Goals

### Problem

Meeting intelligence extraction produces too many items, requiring excessive user cleanup:
- Average 15-20 items per meeting (action items, decisions, learnings)
- User approval rate estimated at 50-60% — half the items are noise
- Review time ~5 minutes per meeting
- User-documented notes require re-approval even though user already wrote them
- Commitments go stale without automatic reconciliation

### Goals

1. **Reduce extraction volume** while maintaining signal (target: 40-60% reduction)
2. **Auto-approve user-documented items** — don't re-extract what user already wrote
3. **Confidence-based pre-selection** — high-confidence items pre-approved, user reviews edge cases
4. **Commitment prioritization** — score by deadline, person importance, staleness
5. **Commitment reconciliation** — detect completed items from recent meetings

### Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Avg items per meeting | ~15-20 | ~8-10 |
| User approval rate | ~50-60% | >80% |
| Review time per meeting | ~5 min | <2 min |
| Commitment staleness | Many overdue | Auto-reconciled |

### Out of Scope

- A/B testing infrastructure (defer to future)
- Custom per-user extraction preferences (beyond confidence threshold)
- Real-time extraction during meetings
- Integration with external task managers (Linear, Jira)

---

## 2. Architecture Decisions

### INT-1 vs INT-3 Separation (from Pre-Mortem Risk 1)

These two components have distinct roles:
- **INT-1 (Quality Tuning)**: Filter garbage — remove transcript artifacts, vague statements, items >150 chars. This is a **quality gate**.
- **INT-3 (Confidence Scoring)**: Rank remaining items by confidence — pre-select likely-good items. This is a **prioritization layer**.

INT-1 runs first (prompt + post-processing filters). INT-3 scores what remains.

### Schema Extension for INT-2

`ReviewItem` needs a `source` field to track origin:
```typescript
type ReviewItem = {
  id: string;
  type: ItemType;
  text: string;
  status: ItemStatus;
  source?: 'ai' | 'user' | 'dedup';  // NEW
  confidence?: number;               // NEW (for INT-3)
};
```

### Existing Code Reuse

- **INT-5**: Use existing `CommitmentsService.reconcile()` which already implements Jaccard-based fuzzy matching
- **INT-4**: Use existing `computeRelationshipHealth()` which returns HealthIndicator — map to numeric score

### Raw Extraction Preservation (from Pre-Mortem Risk 5)

Store raw LLM extraction response before filtering to enable:
- Debugging when important items are missed
- Potential rollback if tuning overshoots

---

## 3. Tasks

### Task 0: Schema Extension & Baseline Capture

**Goal**: Add required schema fields and capture baseline metrics before changes.

**Subtasks**:
1. Add `source` and `confidence` fields to `ReviewItem` type in `packages/apps/web/src/api/types.ts`
2. Update backend meeting processing to include these fields (default: `source: 'ai'`, `confidence: null`)
3. Capture baseline: run current extraction on 5 existing meeting files, record item counts
4. Add `rawExtraction` field to store pre-filter LLM response (for debugging)

**Acceptance Criteria**:
- [ ] `ReviewItem` type has optional `source` and `confidence` fields
- [ ] Backend returns items with `source: 'ai'` by default
- [ ] Baseline metrics documented: avg items per meeting before changes
- [ ] Raw extraction stored before filtering applied

**Files to Modify**:
- `packages/apps/web/src/api/types.ts`
- `packages/apps/backend/src/routes/meetings.ts`
- `packages/core/src/services/meeting-extraction.ts`

---

### Task 1: Extraction Quality Tuning (INT-1)

**Goal**: Reduce extraction volume through prompt engineering and post-processing filters. This is the **quality gate** — filter garbage.

**Subtasks**:
1. Update extraction prompt in `buildMeetingExtractionPrompt()`:
   - Add "be selective" / "only high-confidence" instructions
   - Add negative examples (vague, trivial items)
   - Request confidence score (0-1) for each item
2. Add post-processing filters:
   - Deduplicate near-identical items (Jaccard > 0.8)
   - Filter trivial patterns: "schedule a meeting", "follow up", "touch base"
   - Category limits: max 7 action items, 5 decisions, 5 learnings
3. Preserve raw extraction in response for debugging

**Acceptance Criteria**:
- [ ] Prompt includes selectivity instructions and negative examples
- [ ] Prompt requests confidence (0-1) per item
- [ ] Near-duplicate items filtered (Jaccard > 0.8)
- [ ] Trivial pattern filtering implemented
- [ ] Category limits enforced (7/5/5)
- [ ] Raw extraction preserved before filtering
- [ ] Tests: extraction on sample transcript produces fewer items than before
- [ ] Tests: no false negatives for items with explicit owner + deadline

**Files to Modify**:
- `packages/core/src/services/meeting-extraction.ts` (prompt + filtering)
- `packages/core/test/services/meeting-extraction.test.ts`

---

### Task 2: User Notes Deduplication (INT-2)

**Goal**: If user already documented something in meeting notes, don't extract a duplicate.

**Approach**: Compare extracted items against meeting body text using fuzzy matching. Items that closely match user-written content are marked `source: 'dedup'` and auto-approved.

**Subtasks**:
1. Add fuzzy matching function: compare extraction text against meeting body sections
2. If Jaccard similarity > 0.7 with user content, mark item as:
   - `source: 'dedup'`
   - `status: 'approved'` (auto-approved)
3. Add visual indicator in frontend for deduplicated items ("from your notes")

**Acceptance Criteria**:
- [ ] Extracted items compared against meeting body text
- [ ] Items matching user notes (Jaccard > 0.7) marked `source: 'dedup'`
- [ ] Deduplicated items auto-approved
- [ ] Frontend shows "from your notes" badge for `source: 'dedup'` items
- [ ] Tests: item matching user text is auto-approved with correct source

**Files to Modify**:
- `packages/core/src/services/meeting-extraction.ts`
- `packages/apps/backend/src/routes/meetings.ts`
- `packages/apps/web/src/components/ReviewItems.tsx`

---

### Task 3: Confidence-Based Pre-Selection (INT-3)

**Goal**: LLM returns confidence scores; high-confidence items pre-approved, medium reviewed, low filtered.

**Subtasks**:
1. Parse confidence from LLM response (added in Task 1)
2. Apply threshold-based selection:
   - High confidence (>0.8) → `status: 'approved'`
   - Medium confidence (0.5-0.8) → `status: 'pending'` (needs review)
   - Low confidence (<0.5) → filter out
3. **Remove frontend auto-approve transform** — backend now drives status
4. (Optional) Add confidence threshold to settings

**Acceptance Criteria**:
- [ ] Confidence score parsed from LLM response and stored in ReviewItem
- [ ] Items pre-selected based on confidence thresholds
- [ ] Frontend respects backend-provided status (remove pending→approved transform)
- [ ] User review focuses on medium-confidence items (pending)
- [ ] Tests: high-confidence items have status 'approved', low-confidence filtered

**Files to Modify**:
- `packages/core/src/services/meeting-extraction.ts`
- `packages/apps/backend/src/routes/meetings.ts`
- `packages/apps/web/src/pages/MeetingDetail.tsx` (remove transform)

---

### Task 4: Commitment Priority Scoring (INT-4)

**Goal**: Score commitments by urgency/importance so users focus on what matters.

**Subtasks**:
1. Add priority scoring function:
   - Deadline proximity: overdue (+30), this week (+20), later (+5)
   - Person health: active (+15), regular (+10), cooling (+5), dormant (+0)
   - Staleness: days open > 14 (+10), > 7 (+5)
   - Specificity: has due date (+5), has owner (+5)
2. Map `HealthIndicator` to numeric score (reuse `computeRelationshipHealth()`)
3. Compute priority on retrieval (not stored, computed dynamically)
4. Update CommitmentsPage UI:
   - Show priority badge (High/Medium/Low)
   - Default sort by priority descending
   - Add priority filter

**Acceptance Criteria**:
- [ ] Priority score computed for each commitment
- [ ] Score factors: deadline, person health, staleness, specificity
- [ ] Priority badge displayed (High ≥50, Medium 25-49, Low <25)
- [ ] Commitments sortable by priority
- [ ] Commitments filterable by priority
- [ ] Tests: commitment scoring produces expected priority levels

**Files to Modify**:
- `packages/core/src/services/commitments.ts` (add scoring function)
- `packages/apps/backend/src/routes/intelligence.ts` (return priority with commitments)
- `packages/apps/web/src/pages/CommitmentsPage.tsx` (badge, sort, filter)

---

### Task 5: Commitment Reconciliation (INT-5)

**Goal**: Detect likely-completed commitments from recent meetings and suggest resolution.

**Approach**: Expose existing `CommitmentsService.reconcile()` via API; build UI for user confirmation.

**Subtasks**:
1. Add backend endpoint: `POST /api/commitments/reconcile`
   - Scans recent meetings (last 14 days) for completion signals
   - Calls existing `CommitmentsService.reconcile()` with extracted completion text
   - Returns candidates with evidence (meeting source, match confidence)
2. Add frontend UI:
   - "Reconcile" button on CommitmentsPage
   - Modal showing candidates: "Based on your Mar 5 meeting, this may be done"
   - One-click confirm (resolves) or dismiss (ignores)

**Acceptance Criteria**:
- [ ] `POST /api/commitments/reconcile` endpoint implemented
- [ ] Endpoint uses existing `CommitmentsService.reconcile()` (no new service)
- [ ] Reconcile button visible on CommitmentsPage
- [ ] Candidates displayed with evidence (source meeting, confidence)
- [ ] User can confirm (resolves commitment) or dismiss
- [ ] Tests: reconciliation returns expected candidates for matching text

**Files to Modify**:
- `packages/apps/backend/src/routes/intelligence.ts` (new endpoint)
- `packages/apps/web/src/pages/CommitmentsPage.tsx` (button + modal)
- `packages/core/src/services/commitments.ts` (may need to expose more from reconcile)

---

## 4. Dependencies & Ordering

```
Task 0 (Schema + Baseline)
    │
    ▼
Task 1 (Quality Tuning)
    │
    ├──────────────────┐
    ▼                  ▼
Task 2 (Dedup)    Task 3 (Confidence)
                       │
                       ▼
                  Task 4 (Priority)
                       │
                       ▼
                  Task 5 (Reconciliation)
```

**Critical path**: Task 0 → Task 1 → Task 3 → Task 4 → Task 5
**Parallel**: Task 2 can run after Task 1, parallel with Task 3

---

## 5. Pre-Mortem Mitigations

| Risk | Mitigation | Verification |
|------|------------|--------------|
| INT-1↔INT-3 confusion | Explicit roles: INT-1=filter, INT-3=rank | Task descriptions clarify roles |
| Schema dependency | Task 0 adds fields before other tasks | Task 0 blocks all others |
| Frontend auto-approve conflict | Task 3 removes transform | Check MeetingDetail.tsx after Task 3 |
| INT-5 code duplication | Reuse CommitmentsService.reconcile() | Task 5 imports existing code |
| Signal loss | Store raw extraction, test with known-good items | Task 1 preserves raw, includes negative tests |
| Context gaps for subagents | Include file reading lists in prompts | Orchestrator provides context |
| Test coverage | Each task has specific test requirements | ACs include test criteria |
| Unmeasurable ACs | Task 0 captures baseline | Baseline documented before changes |

---

## 6. Testing Strategy

### Unit Tests
- `meeting-extraction.test.ts`: Prompt output, filtering, confidence parsing
- `commitments.test.ts`: Priority scoring, reconciliation candidates

### Integration Tests
- Full flow: extraction → review items → approval → commitments
- Backend endpoints return correct schema with new fields

### Manual Validation
- Run extraction on 5 test meetings before/after Task 1
- Verify no false negatives for items with explicit owner + deadline
- Verify frontend displays badges and handles all statuses

---

## 7. References

- **Existing code**: `packages/core/src/services/meeting-extraction.ts`, `commitments.ts`, `person-health.ts`
- **Types**: `packages/apps/web/src/api/types.ts`
- **Pre-mortem**: `dev/work/plans/intelligence-tuning/pre-mortem.md`
- **Review**: `dev/work/plans/intelligence-tuning/review.md`
