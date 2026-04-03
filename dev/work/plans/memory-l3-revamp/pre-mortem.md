---
title: "L3 Memory Revamp — Pre-mortem"
---

# Pre-mortem: memory-l3-revamp

## Risk Analysis

### 1. Decision-to-area matching is unreliable
**Likelihood**: Medium
**Impact**: High (compaction groups decisions incorrectly)
**Mitigation**: For Step 2, match decisions to areas using keyword overlap with area names and recurring meeting titles. Unmatched decisions stay in-place. Add an "unmatched" report so the user can see what wasn't grouped.

### 2. MemoryService.search() returns sections, not structured entries
**Likelihood**: High (this is how it works)
**Impact**: Medium (harder to extract individual decisions for compaction)
**Mitigation**: Use MemoryService's `parseMemorySections()` pattern directly — it's a module-level function. For compaction, read decisions.md directly and parse sections, don't go through search.

### 3. QMD scope path change breaks existing collections
**Likelihood**: Low
**Impact**: High (search stops working)
**Mitigation**: Change the memory scope path from `.arete/memory/items` to `.arete/memory` (parent dir) — this includes both items/ and areas/ without creating a new scope. Test that existing items/ content still indexed.

### 4. Area memory files get stale without automated triggers
**Likelihood**: High (no cron, manual only)
**Impact**: Medium (L3 drifts from reality)
**Mitigation**: Wire into weekly-winddown (Step 6) as the primary automated trigger. Add staleness detection (Step 5) so skills can detect and refresh on-demand. Future: background automation plan can add cron-like triggers.

### 5. Factory.ts dependency chain gets complex
**Likelihood**: Low
**Impact**: Medium
**Mitigation**: AreaMemoryService needs areaParser, commitments, and memory — all already constructed in factory.ts before it. Just add the construction after existing services.

### 6. Test infrastructure mismatch
**Likelihood**: Medium
**Impact**: Low (tests are just harder to write)
**Mitigation**: Follow the exact mock StorageAdapter pattern from commitments.test.ts. The AreaMemoryService will need mocks for all 3 dependencies — use simple stub objects.

## Top 3 Risks to Watch

1. Decision-to-area matching quality (Step 2) — may need to defer or simplify
2. QMD scope path change (Step 4) — test carefully
3. Staleness without automation (Step 5) — acceptable for now, document clearly
