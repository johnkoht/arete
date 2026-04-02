---
title: Intelligence Improvements
slug: intelligence-improvements
status: building
size: large
tags: []
created: 2026-04-01T20:56:35.995Z
updated: 2026-04-02T03:36:15.394Z
completed: null
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 25
---

# Meeting Intelligence: Relevance-First Extraction

## Problem

**User spends too much time reviewing meeting outputs** because:
1. **Duplicates** — Same item extracted across multiple meetings, worded differently
2. **Already complete** — Items you've already done, but Areté doesn't know
3. **Not relevant** — Noise that doesn't touch your areas or projects
4. **No prioritization** — Everything looks equally important
5. **No attribution** — Can't tell WHY something should matter to you

The core question the system must answer: **"Is this relevant to me, and how?"**

## Solution

Three-phase approach with optional fourth phase:

1. **Phase 0: Extraction Fixes** — Raise limits, add owner synthesis (minimal changes)
2. **Phase 1: Context Cards** — Add area/project memory with keywords, tasks, people
3. **Phase 2: Reconciliation Pass** — Post-extraction intelligence layer that dedupes, matches completion, scores relevance
4. **Phase 3: QMD Scope Expansion** — Add dedicated scopes for areas, goals, now (optional, revisit after Phase 2)

## Success Metrics

**Primary**: "Did I spend less time reviewing, with higher confidence I didn't miss anything important?"

| Metric | Current | Target |
|--------|---------|--------|
| Items to review per batch | ~40 raw items | <15 high-relevance items |
| Relevance accuracy | Unknown | >90% of "High" items are actually my responsibility |
| False negatives | Unknown | Zero (nothing important filtered incorrectly) |
| Duplicate items across meetings | Common | Auto-merged with annotation |
| Completed items surfaced | Common | Auto-marked with completion date |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     PARALLEL EXTRACTION (existing)                   │
│  • 5 meetings processed simultaneously                               │
│  • Outputs: raw extraction JSON per meeting                         │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     RECONCILIATION PASS (NEW)                        │
│  Context loaded:                                                     │
│  • All raw extractions from this batch                              │
│  • Area/project context cards (memory.md)                           │
│  • Recent memory (last 7 days of committed items)                   │
│  • Completed tasks from areas/projects                              │
│                                                                      │
│  Actions:                                                            │
│  • Semantic dedupe: Jaccard within batch, QMD vsearch vs workspace  │
│  • Match against completed tasks → "already done 3/28"              │
│  • Match against recent memory → "captured Monday"                  │
│  • Score relevance to areas/projects                                │
│  • Annotate HOW: area, person, task relationship                    │
│                                                                      │
│  Output: Prioritized, annotated staged items                        │
│  ├── High Relevance (your areas/projects)                          │
│  ├── Medium Relevance (your people, FYI)                           │
│  ├── Cross-Meeting Duplicates (merged)                             │
│  ├── Already Captured (recent memory match)                        │
│  └── Completed (task match)                                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Decisions

### Semantic Similarity Approach
- **Within-batch deduplication**: Jaccard (fast, catches near-duplicates)
- **Against prior workspace**: QMD vsearch (uses existing `all` index)
- **Fallback**: Jaccard everywhere when QMD unavailable

### Context Cards: Extend Existing AreaContext
Rather than creating `loadRelevanceContext()` as a new function, extend `MeetingContextBundle.areaContext` to include memory fields. This avoids API fragmentation.

### Reconciliation: Module (Pure Functions)
`meeting-reconciliation.ts` is a module with pure functions, not a service class:
- All data passed in (no storage/search access)
- Easier to test, no DI wiring needed

## Plan:

### Phase 0: Extraction Fixes (1-2 hours)

1. Raise THOROUGH_LIMITS from 10→20 and CATEGORY_LIMITS from 7→10 to stop silent truncation
   - AC: `THOROUGH_LIMITS.actionItems === 20`, `CATEGORY_LIMITS === 10`
   - AC: Extraction with 15 action items returns all 15 (no truncation)
   - Test: Unit test asserting limit values; golden file test with high-item transcript

2. Add owner synthesis to summary prompt ("what this means for @ownerSlug specifically")
   - AC: Summary includes owner-perspective sentence when ownerSlug provided
   - AC: `calculateSpeakingRatio(transcript, ownerName)` returns 0-1 ratio
   - Test: Unit test for speaking ratio calculation; prompt snapshot test

3. Add golden file tests for extraction quality baseline
   - AC: 3+ real meeting transcripts with expected extraction outputs
   - AC: Tests run in CI (`npm test`)
   - AC: Golden files cover: normal meeting, high-item meeting, 1:1 meeting
   - Test: Golden file comparison tests in `meeting-extraction.test.ts`

**GATE**: Extraction limits work. Owner synthesis appears in summaries. Golden file tests pass.

### Phase 1: Context Cards (2-3 hours)

4. Define `AreaMemory` type and extend `AreaContext` to include it
   - AC: `AreaMemory` has: keywords[], activePeople[], openWork[], recentlyCompleted[], recentDecisions[]
   - AC: `AreaContext.memory?: AreaMemory` added to existing type
   - AC: Types exported from `models/index.ts`
   - Test: Type compilation (implicit via typecheck)

5. Add `memory.md` parser to `AreaParserService`
   - AC: `parseMemoryFile(areaSlug)` returns `AreaMemory | null`
   - AC: Memory file location: `areas/{slug}/memory.md`
   - AC: Returns null when file doesn't exist (no error)
   - AC: `getAreaContext()` includes parsed memory when available
   - Test: Unit tests with valid/invalid/missing memory.md files

6. Add `memory.md` template to workspace templates
   - AC: Template at `templates/memory.md` with sections: Keywords, Active People, Open Work, Recently Completed, Recent Decisions
   - AC: Template copied on `arete update`
   - Test: Template file exists; `arete update` copies it

7. Manually populate 2-3 real areas with memory.md for testing
   - Note: Content creation step, not code. Provides test data for Phase 2.

**GATE**: AreaContext includes memory. Parser reads memory.md. Template available.

### Phase 2: Reconciliation Pass (4-6 hours)

8. Define `ReconciliationResult` and `ReconciledItem` types
   - AC: Types in `models/entities.ts`:
     ```typescript
     type ReconciledItem = {
       original: ActionItem | Decision | Learning;
       status: 'keep' | 'duplicate' | 'completed' | 'irrelevant';
       relevanceScore: number; // 0-1
       relevanceTier: 'high' | 'normal' | 'low';
       annotations: {
         areaSlug?: string;
         projectSlug?: string;
         personSlug?: string;
         duplicateOf?: string; // meeting:itemId
         completedOn?: string; // date
         why: string; // human-readable
       };
     };
     type ReconciliationResult = {
       items: ReconciledItem[];
       stats: { duplicatesRemoved: number; completedMatched: number; lowRelevanceCount: number };
     };
     ```
   - Test: Type compilation

9. Implement `reconcileMeetingBatch(extractions[], context)` in `meeting-reconciliation.ts`
   - AC: Pure function, no storage/search access (all data passed in)
   - AC: Context parameter includes: areaMemories, projectMemories, recentCommittedItems, completedTasks
   - AC: Returns `ReconciliationResult` with all items annotated
   - Test: Unit test with mock extractions and context

10. Add Jaccard-based deduplication for within-batch items
    - AC: `findDuplicates(items[])` groups semantically similar items
    - AC: Jaccard threshold > 0.7 → duplicate
    - AC: First occurrence kept, later occurrences marked `status: 'duplicate'`
    - AC: Different owners = not duplicates (even if text matches)
    - Test: Unit tests with known duplicate pairs; threshold boundary tests

11. Add QMD vsearch for matching against prior workspace
    - AC: `matchPriorWorkspace(items[], searchProvider)` finds items already in workspace
    - AC: Uses QMD vsearch against `all` scope for semantic matching
    - AC: Falls back to skipping this step when QMD unavailable
    - AC: Matched items annotated with `duplicateOf: "meeting:path"` or `completedOn: "date"`
    - Test: Unit test with mock search provider

12. Add completed task matching
    - AC: `matchCompletedTasks(items[], completedTasks[])` finds matches
    - AC: Matching uses: text similarity (Jaccard > 0.6) AND owner match
    - AC: Matched items marked `status: 'completed'` with `completedOn` annotation
    - Test: Unit test with mock completed tasks

13. Add recent memory matching
    - AC: `matchRecentMemory(items[], recentMemory[])` finds existing decisions/learnings
    - AC: "Recent" = last 30 days
    - AC: Memory sourced from committed items (`.arete/memory/`)
    - AC: Matched items marked `status: 'duplicate'` with source reference in `why`
    - Test: Unit test with mock recent memory

14. Add relevance scoring
    - AC: `scoreRelevance(item, context)` returns 0-1 score
    - AC: Scoring formula:
      - keywordMatch (0.3): item text contains area/project keywords
      - personMatch (0.3): owner/counterparty in activePeople
      - areaMatch (0.4): meeting linked to area via recurring_meetings
    - AC: Tiers: score >= 0.7 → 'high', >= 0.4 → 'normal', else 'low'
    - Test: Unit tests with various score combinations

15. Add "how" annotations to reconciled items
    - AC: Each item gets populated annotations explaining relevance
    - AC: `why` field is human-readable: "Matches Communications area keywords: email, templates"
    - Test: Annotation generation unit tests

16. Wire reconciliation into `arete pull fathom`
    - AC: `pullFathom()` accepts `options.reconcile?: boolean` (default: false initially)
    - AC: When `reconcile=true`: after all meetings saved, load batch, reconcile, update staged items
    - AC: CLI: `arete pull fathom --reconcile` enables reconciliation
    - AC: Reconciliation runs AFTER all meetings saved (batch operation)
    - Test: Integration test with `--reconcile` flag

17. Update staged items output format to show relevance tiers
    - AC: Format includes tier indicator: `[HIGH]`, `[NORMAL]`, `[LOW]`
    - AC: Format includes area/project annotation when present
    - AC: Duplicate items excluded from output (noted in stats)
    - AC: Example: `- ai_001: [HIGH] [@owner → @counterparty] Description (area: communications)`
    - Test: Formatter unit tests with mock reconciled items

18. Add golden file tests for reconciliation
    - AC: 2+ test scenarios with mock batch extractions
    - AC: Tests verify: deduplication, completion matching, relevance scoring, annotations
    - Test: Golden file comparison in `meeting-reconciliation.test.ts`

**GATE**: Reconciliation produces prioritized output. `--reconcile` flag works. Relevance tiers display correctly.

### Phase 3: QMD Scope Expansion (1-2 hours, revisit after Phase 2)

19. Add `areas` scope to QMD indexing
    - AC: `SCOPE_PATHS.areas = 'areas'` added
    - AC: `ALL_SCOPES` includes `'areas'`
    - AC: `arete install` and `arete update` create the areas collection
    - Test: Collection creation test; `qmd status` shows areas scope

20. Add `goals` scope to QMD indexing
    - AC: `SCOPE_PATHS.goals = 'goals'` added
    - AC: `ALL_SCOPES` includes `'goals'`
    - Test: Collection creation test

21. Add `now` scope to QMD indexing
    - AC: `SCOPE_PATHS.now = 'now'` added (indexes week.md, tasks, agendas)
    - AC: `ALL_SCOPES` includes `'now'`
    - Test: Collection creation test

22. Add `resources` scope combining conversations and notes
    - AC: `SCOPE_PATHS.resources = 'resources'` (already includes meetings, adds conversations/notes)
    - AC: Or split into `conversations` and `notes` scopes if separate search is valuable
    - Test: Collection creation test; verify resources indexed

**GATE**: New scopes created on install/update. `qmd status` shows all scopes. Search across areas/goals works.

### Phase 4: Iteration (as needed)

23. Tune relevance scoring weights based on user feedback
24. Add staleness warnings for outdated context cards
25. Consider scoped search in reconciliation (search only relevant scopes)

## Out of Scope

- **Speaker resolution** — Krisp inconsistency is upstream; nothing actionable here
- **Shadow mode** — Specific use case better handled by UI skip + different skill
- **Query-time synthesis (Track B)** — Deferred until reconciliation proves value
- **Meeting type classification** — Not needed for core relevance problem

## Files to Modify

**Phase 0** (extraction):
- `packages/core/src/services/meeting-extraction.ts` — limits, owner synthesis
- `packages/core/src/services/meeting-extraction.test.ts` — golden file tests

**Phase 1** (context cards):
- `packages/core/src/models/entities.ts` — AreaMemory type, AreaContext extension
- `packages/core/src/services/area-parser.ts` — memory.md parsing
- `packages/runtime/templates/memory.md` — NEW template

**Phase 2** (reconciliation):
- `packages/core/src/services/meeting-reconciliation.ts` — NEW: core reconciliation module
- `packages/core/src/services/meeting-reconciliation.test.ts` — NEW: tests
- `packages/core/src/integrations/fathom/index.ts` — wire reconciliation
- `packages/cli/src/formatters/staged-items.ts` — relevance tier output

**Phase 3** (QMD scopes):
- `packages/core/src/search/qmd-setup.ts` — SCOPE_PATHS, ALL_SCOPES
- `packages/core/src/models/workspace.ts` — QmdScope type (if needed)

## Risks

| Risk | Mitigation |
|------|-----------|
| Relevance scoring too aggressive | "Low relevance" tier shows everything, just deprioritized — nothing deleted |
| Context cards become stale | Future: Surface staleness warnings (Phase 4) |
| QMD not available | Fallback to Jaccard (less accurate but functional) |
| Deduplication too aggressive | Conservative threshold (0.7); owner mismatch prevents dedup |
| Reconciliation adds latency | Runs once per batch, not per meeting; ~2-3s expected |

## Test Summary

| Phase | Unit Tests | Integration Tests | Golden Files |
|-------|------------|-------------------|--------------|
| 0 | Limit constants, speaking ratio | - | 3+ extraction transcripts |
| 1 | Memory parser (valid/invalid/missing) | `arete update` includes template | - |
| 2 | Dedup, completion match, memory match, relevance scoring, annotations | `pull fathom --reconcile` | 2+ reconciliation scenarios |
| 3 | Scope constants | `arete install` creates scopes | - |