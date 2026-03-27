# Intelligence Tuning Baseline Metrics

Captured: 2026-03-08
Task: task-0 (Schema Extension & Baseline Capture)

## Purpose

This document captures baseline metrics before implementing extraction quality tuning changes.
Used to measure improvement after tuning is complete.

## Test Fixture Analysis

### Source: `packages/core/test/services/meeting-extraction.test.ts`

#### Current Validation Rules (pre-filtering)
- Max action item length: 150 characters
- Garbage prefix patterns rejected:
  - `me:`, `them:`, `yeah`, `i'm not sure`, `i am not sure`
  - `so the way`, `the way the`, `basically`, `um`, `uh`
- Multiple sentences rejected (>1 period followed by space or end)
- Invalid direction values rejected

#### Test Coverage Summary
| Category | Count | Notes |
|----------|-------|-------|
| Valid response parsing tests | 7 | Verifies correct extraction |
| Malformed JSON tests | 6 | Graceful degradation |
| Validation rejection tests | 11 | Garbage filtering |
| Full extraction flow tests | 8 | End-to-end scenarios |
| Formatting tests | 18 | Output formatting |

#### Rejection Scenarios Tested
1. Action items over 150 characters → rejected with warning
2. Items starting with transcript artifacts ("Me:", "Them:") → rejected
3. Items starting with filler words ("Yeah", "Um") → rejected
4. Items with uncertainty phrases ("I'm not sure") → rejected
5. Items with explanation patterns ("So the way") → rejected
6. Items with multiple sentences → rejected
7. Items with invalid direction → rejected
8. Items missing required fields (owner, description) → skipped silently

## Schema Changes (task-0)

### New Fields Added
| Type | Field | Values | Purpose |
|------|-------|--------|---------|
| StagedItem | source | 'ai' \| 'user' \| 'dedup' | Track item origin |
| StagedItem | confidence | number (0-1) | LLM confidence score |
| ReviewItem | source | 'ai' \| 'user' \| 'dedup' | Frontend display |
| ReviewItem | confidence | number (0-1) | Pre-selection logic |

### New Type Added
- `RawExtractedItem`: Stores items before validation filtering
  - Fields: type, text, owner?, direction?
  - Purpose: Debugging/analysis of filtering effectiveness

### rawItems Field
`MeetingExtractionResult.rawItems` now captures all parsed items BEFORE validation filtering.
This enables:
1. Measuring filter effectiveness (raw count vs filtered count)
2. Debugging aggressive filtering
3. Rollback capability if filtering too aggressive

## Baseline Expectations (for tuning validation)

### Expected Improvements After Tuning
1. **Volume reduction**: Fewer low-quality items extracted (target: 30-50% reduction)
2. **Signal preservation**: Items with explicit owner + deadline always retained
3. **Deduplication**: Near-duplicate items merged (Jaccard > 0.8)
4. **Category limits**: Max 7/5/5 for actions/decisions/learnings

### Measurement Method
Compare `rawItems.length` vs `intelligence.actionItems.length` (etc.) to measure filter effectiveness.

## Next Steps
- Task 1: Implement extraction quality tuning (INT-1)
- Task 2: User notes deduplication (INT-2)  
- Task 3: Confidence-based pre-selection (INT-3)

---

*This baseline document is referenced by subsequent tasks to validate improvements.*
