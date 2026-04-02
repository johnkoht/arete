# PRD: Meeting Intelligence — Relevance-First Extraction

**Version**: 1.0  
**Status**: Ready for Execution  
**Date**: 2026-04-02  
**Branch**: `feature/intelligence-improvements`  
**Depends on**: meeting-extraction.ts, area-parser.ts, fathom integration

---

## 1. Problem & Goals

### Problem

**User spends too much time reviewing meeting outputs** because:
1. **Duplicates** — Same item extracted across multiple meetings, worded differently
2. **Already complete** — Items already done, but Areté doesn't know
3. **Not relevant** — Noise that doesn't touch user's areas or projects
4. **No prioritization** — Everything looks equally important
5. **No attribution** — Can't tell WHY something should matter

The core question the system must answer: **"Is this relevant to me, and how?"**

### Goals

1. **Reduce review burden**: From ~40 raw items to <15 high-relevance items per batch
2. **Zero false negatives**: Nothing important filtered incorrectly
3. **Auto-merge duplicates**: Cross-meeting duplicates annotated and consolidated
4. **Completion awareness**: Items matching completed tasks auto-marked
5. **Relevance attribution**: Each item explains WHY it's relevant

### Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Items to review per batch | ~40 raw items | <15 high-relevance items |
| Relevance accuracy | Unknown | >90% of "High" items are actually my responsibility |
| False negatives | Unknown | Zero |
| Duplicate items across meetings | Common | Auto-merged with annotation |
| Completed items surfaced | Common | Auto-marked with completion date |

### Out of Scope

- **Speaker resolution** — Krisp inconsistency is upstream
- **Shadow mode** — Specific use case better handled by UI skip
- **Query-time synthesis** — Deferred until reconciliation proves value
- **Meeting type classification** — Not needed for core relevance problem

---

## 2. Architecture

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
│  • Recent memory (last 30 days of committed items)                  │
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
│  ├── Normal Relevance (your people, FYI)                           │
│  ├── Cross-Meeting Duplicates (merged)                             │
│  ├── Already Captured (recent memory match)                        │
│  └── Completed (task match)                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Semantic similarity approach**:
   - Within-batch: Jaccard (fast, catches near-duplicates)
   - Against prior workspace: QMD vsearch (existing `all` index)
   - Fallback: Jaccard everywhere when QMD unavailable

2. **Extend existing AreaContext** (not new API): Add `memory?: AreaMemory` to existing type

3. **Pure functions module**: `meeting-reconciliation.ts` takes all data as input (no storage/search access)

---

## 3. Pre-Mortem Risk References

Apply these mitigations from `dev/work/plans/intelligence-improvements/pre-mortem.md`:

| Risk | Key Mitigation |
|------|----------------|
| ⚠️ R1: Context Gap | Before Phase 2, read: meeting-extraction.ts, fathom/index.ts, search/types.ts |
| ⚠️ R2: Test Patterns | Use synthetic transcripts; follow testDeps pattern; mock LLM |
| ⚠️ R3: Phase Data Flow | Complete Phase 1 fully before Phase 2; verify AreaContext.memory works |
| ⚠️ R4: QMD Fallback | Explicit: items retain `status: 'keep'` when QMD unavailable |
| ⚠️ R5: pullFathom Integration | Add integration test with --reconcile=false first (verify existing behavior) |
| ⚠️ R6: Scoring Calibration | Conservative thresholds (0.7/0.4); log details with ARETE_DEBUG |
| ⚠️ R7: Annotation Scope | One primary reason per item; compute after tier determined |
| ⚠️ R8: memory.md Brittleness | Lenient parser; missing sections → empty arrays |

---

## 4. Memory Synthesis Context

From recent build entries (2026-03-15, 2026-03-25):

1. **Reuse existing Jaccard** — `normalizeForJaccard()` and `jaccardSimilarity()` exist in `meeting-extraction.ts`. Verify test strings mathematically.

2. **Pure functions pattern** — Follow `processMeetingExtraction()` in `meeting-processing.ts` (pure function, no storage access)

3. **Pre-mortem references in ACs** — Include "⚠️ Pre-Mortem Warning (RN)" in acceptance criteria

4. **Explicit file lists with line numbers** — Each task should specify files to read first

5. **Reviewer pre-work sanity checks** — Catch AC ambiguities before developer dispatch

---

## 5. Tasks

### Phase 0: Extraction Fixes

#### Task P0-1: Raise Extraction Limits

**Description**: Raise THOROUGH_LIMITS from 10→20 and CATEGORY_LIMITS from 7→10 to stop silent truncation of items.

**Files to read first**:
- `packages/core/src/services/meeting-extraction.ts` — find THOROUGH_LIMITS and CATEGORY_LIMITS constants

**Acceptance Criteria**:
- [ ] `THOROUGH_LIMITS.actionItems === 20` (was 10)
- [ ] `CATEGORY_LIMITS === 10` (was 7)
- [ ] Unit test asserting limit constant values
- [ ] Extraction with 15 action items returns all 15 (golden file test)

**Test**: Unit test asserting limit values; golden file test with high-item transcript

---

#### Task P0-2: Add Owner Synthesis to Summary

**Description**: Add owner synthesis to extraction summary prompt so it includes "what this means for @ownerSlug specifically".

**Files to read first**:
- `packages/core/src/services/meeting-extraction.ts` — find summary generation, buildPrompt function
- `packages/core/src/services/LEARNINGS.md` — Jaccard gotcha

**Acceptance Criteria**:
- [ ] Summary includes owner-perspective sentence when `ownerSlug` provided in extraction options
- [ ] `calculateSpeakingRatio(transcript, ownerName)` function exists and returns 0-1 ratio
- [ ] Speaking ratio included in summary context when ownerName available
- [ ] Unit test for speaking ratio calculation (happy path + edge cases)
- [ ] Prompt includes placeholder for owner synthesis when ownerSlug present

**Test**: Unit test for speaking ratio; snapshot test for prompt changes

---

#### Task P0-3: Add Golden File Tests for Extraction

**Description**: Add golden file tests to establish extraction quality baseline. Use synthetic/anonymized transcripts.

**Files to read first**:
- `packages/core/test/services/meeting-extraction.test.ts` — existing test patterns
- `packages/core/test-data/` — existing test fixtures

**Acceptance Criteria**:
- [ ] 3+ synthetic meeting transcripts in `test-data/meetings/` (anonymized, not real content)
- [ ] Golden files in `test-data/meetings/expected/` with expected extraction outputs
- [ ] Tests run in CI (`npm test`)
- [ ] Coverage: normal meeting, high-item meeting (15+ items), 1:1 meeting
- [ ] Golden file comparison uses semantic matching (not exact JSON match) for flexibility

**Test**: Golden file comparison tests in `meeting-extraction.test.ts`

**⚠️ Pre-Mortem Warning (R2)**: Use synthetic transcripts, not real meeting content. Mock LLM calls in tests.

---

### Phase 1: Context Cards

#### Task P1-1: Define AreaMemory Type

**Description**: Define `AreaMemory` type and extend `AreaContext` to include it.

**Files to read first**:
- `packages/core/src/models/entities.ts` — existing AreaContext type
- `packages/core/src/services/area-parser.ts` — AreaParserService

**Acceptance Criteria**:
- [ ] `AreaMemory` type defined with fields:
  ```typescript
  type AreaMemory = {
    keywords: string[];
    activePeople: string[];  // person slugs
    openWork: string[];      // task descriptions
    recentlyCompleted: string[];  // task descriptions
    recentDecisions: string[];  // decision summaries
  };
  ```
- [ ] `AreaContext.memory?: AreaMemory` added to existing `AreaContext` type
- [ ] Types exported from `packages/core/src/models/index.ts`
- [ ] No breaking changes to existing AreaContext consumers

**Test**: Type compilation (implicit via typecheck)

---

#### Task P1-2: Add memory.md Parser

**Description**: Add `memory.md` parser to `AreaParserService` that reads and parses area memory files.

**Files to read first**:
- `packages/core/src/services/area-parser.ts` — existing parsing patterns
- `packages/core/src/services/LEARNINGS.md` — DI patterns

**Acceptance Criteria**:
- [ ] `parseMemoryFile(areaSlug: string): Promise<AreaMemory | null>` method added to AreaParserService
- [ ] Memory file location: `areas/{slug}/memory.md`
- [ ] Returns `null` when file doesn't exist (no error thrown)
- [ ] Parser is lenient: missing sections → empty arrays (not error)
- [ ] Case-insensitive section matching: `## Keywords` = `## KEYWORDS`
- [ ] `getAreaContext()` includes parsed memory when available
- [ ] Log warning (not error) for malformed sections

**Test**: Unit tests with valid/invalid/missing memory.md files

**⚠️ Pre-Mortem Warning (R8)**: Parser must be lenient. Test with malformed input.

---

#### Task P1-3: Add memory.md Template

**Description**: Add `memory.md` template to workspace templates for areas.

**Files to read first**:
- `packages/runtime/templates/` — existing templates
- `packages/core/src/services/workspace.ts` — template copying logic

**Acceptance Criteria**:
- [ ] Template at `packages/runtime/templates/memory.md`
- [ ] Template has sections: `## Keywords`, `## Active People`, `## Open Work`, `## Recently Completed`, `## Recent Decisions`
- [ ] Each section has clear examples/instructions as comments
- [ ] Template noted in workspace update logic (future: copy on `arete update`)

**Test**: Template file exists; structure matches AreaMemory sections

**Note**: Actual copy-on-update can be deferred to Phase 4 iteration.

---

### Phase 2: Reconciliation Pass

#### Task P2-1: Define Reconciliation Types

**Description**: Define `ReconciliationResult` and `ReconciledItem` types for the reconciliation module.

**Files to read first**:
- `packages/core/src/models/entities.ts` — existing types (ActionItem, Decision, Learning)
- `packages/core/src/models/intelligence.ts` — MeetingIntelligence type

**Acceptance Criteria**:
- [ ] Types defined in `packages/core/src/models/entities.ts`:
  ```typescript
  type ReconciledItem = {
    original: ActionItem | Decision | Learning;
    meetingPath: string;  // source meeting
    status: 'keep' | 'duplicate' | 'completed' | 'irrelevant';
    relevanceScore: number;  // 0-1
    relevanceTier: 'high' | 'normal' | 'low';
    annotations: {
      areaSlug?: string;
      projectSlug?: string;
      personSlug?: string;
      duplicateOf?: string;  // meeting:itemId
      completedOn?: string;  // ISO date
      why: string;  // human-readable, 1-2 sentences
    };
  };
  
  type ReconciliationResult = {
    items: ReconciledItem[];
    stats: {
      duplicatesRemoved: number;
      completedMatched: number;
      lowRelevanceCount: number;
    };
  };
  
  type ReconciliationContext = {
    areaMemories: Map<string, AreaMemory>;
    recentCommittedItems: Array<{text: string; date: string; source: string}>;
    completedTasks: Array<{text: string; completedOn: string; owner?: string}>;
  };
  ```
- [ ] Types exported from `packages/core/src/models/index.ts`

**Test**: Type compilation

---

#### Task P2-2: Implement reconcileMeetingBatch

**Description**: Implement the core `reconcileMeetingBatch()` function that orchestrates deduplication, completion matching, and relevance scoring.

**Files to read first**:
- `packages/core/src/services/meeting-processing.ts` — processMeetingExtraction pattern (pure function)
- `packages/core/src/services/meeting-extraction.ts` — existing Jaccard functions

**Acceptance Criteria**:
- [ ] Function signature: `reconcileMeetingBatch(extractions: MeetingExtractionBatch[], context: ReconciliationContext): ReconciliationResult`
- [ ] Pure function — no storage/search access (all data passed in)
- [ ] Calls internal functions: `findDuplicates`, `matchCompletedTasks`, `matchRecentMemory`, `scoreRelevance`, `annotateItems`
- [ ] Returns `ReconciliationResult` with all items annotated
- [ ] Items are processed in order: dedup → completion → memory → score → annotate

**Test**: Unit test with mock extractions and context

**⚠️ Pre-Mortem Warning (R1)**: Read meeting-extraction.ts first for extraction output shapes.

---

#### Task P2-3: Implement Jaccard Deduplication

**Description**: Implement within-batch deduplication using Jaccard similarity.

**Files to read first**:
- `packages/core/src/services/meeting-extraction.ts` — `normalizeForJaccard()`, `jaccardSimilarity()` (REUSE these)
- `packages/core/src/services/LEARNINGS.md` — Jaccard test string verification

**Acceptance Criteria**:
- [ ] `findDuplicates(items: ExtractedItem[]): DuplicateGroup[]` function
- [ ] Reuses existing `normalizeForJaccard()` and `jaccardSimilarity()` from meeting-extraction.ts
- [ ] Threshold: Jaccard > 0.7 → duplicate
- [ ] First occurrence kept as `status: 'keep'`; later occurrences marked `status: 'duplicate'`
- [ ] Different owners = NOT duplicates (even if text matches)
- [ ] Items grouped by duplicate set; each group has one "canonical" item

**Test**: Unit tests with known duplicate pairs; threshold boundary tests (0.69 vs 0.71)

**⚠️ Pre-Mortem Warning (R6)**: Test strings must be mathematically verified. Example: "Send API docs" (4 words) vs "Send API docs now" (5 words) = 4/5 = 0.8

---

#### Task P2-4: Implement QMD Workspace Matching

**Description**: Implement matching against prior workspace content using QMD vsearch.

**Files to read first**:
- `packages/core/src/search/types.ts` — SearchProvider interface
- `packages/core/src/search/providers/qmd.ts` — QMD provider implementation

**Acceptance Criteria**:
- [ ] `matchPriorWorkspace(items: ExtractedItem[], searchProvider: SearchProvider | null): Promise<WorkspaceMatch[]>`
- [ ] Uses QMD vsearch against `all` scope for semantic matching
- [ ] When `searchProvider` is null, returns empty matches (graceful skip)
- [ ] Matched items annotated with `duplicateOf: "meeting:path"` when found in prior meetings
- [ ] Returns match with similarity score and source path

**Test**: Unit test with mock search provider

**⚠️ Pre-Mortem Warning (R4)**: When QMD unavailable, items retain `status: 'keep'`. Log warning for visibility.

---

#### Task P2-5: Implement Completed Task Matching

**Description**: Implement matching extracted items against completed tasks from areas.

**Acceptance Criteria**:
- [ ] `matchCompletedTasks(items: ExtractedItem[], completedTasks: CompletedTask[]): CompletedMatch[]`
- [ ] Matching uses: text similarity (Jaccard > 0.6) AND owner match (if both have owners)
- [ ] Matched items marked `status: 'completed'` with `completedOn` annotation
- [ ] Reuses `jaccardSimilarity()` from meeting-extraction.ts

**Test**: Unit test with mock completed tasks

---

#### Task P2-6: Implement Recent Memory Matching

**Description**: Implement matching against recently committed memory items.

**Acceptance Criteria**:
- [ ] `matchRecentMemory(items: ExtractedItem[], recentMemory: RecentMemoryItem[]): MemoryMatch[]`
- [ ] "Recent" = last 30 days (configurable via parameter)
- [ ] Memory items from `.arete/memory/items/` (decisions.md, learnings.md)
- [ ] Matched items marked `status: 'duplicate'` with `why` referencing source
- [ ] Example `why`: "Similar to decision from 2026-03-28: 'Use Jaccard for dedup'"

**Test**: Unit test with mock recent memory

---

#### Task P2-7: Implement Relevance Scoring

**Description**: Implement relevance scoring based on area/project/person matches.

**Acceptance Criteria**:
- [ ] `scoreRelevance(item: ExtractedItem, context: ReconciliationContext): RelevanceScore`
- [ ] Scoring formula:
  - keywordMatch (0.3 weight): item text contains area/project keywords
  - personMatch (0.3 weight): owner/counterparty in activePeople
  - areaMatch (0.4 weight): meeting linked to area via recurring_meetings
- [ ] Returns score 0-1 and breakdown of contributing factors
- [ ] Tiers: score >= 0.7 → 'high', >= 0.4 → 'normal', else 'low'

**Test**: Unit tests with various score combinations; boundary tests

**⚠️ Pre-Mortem Warning (R6)**: Conservative thresholds. Log scoring details with ARETE_DEBUG=1.

---

#### Task P2-8: Implement Annotations

**Description**: Implement "why" annotations for reconciled items.

**Acceptance Criteria**:
- [ ] `annotateItem(item: ReconciledItem, context: ReconciliationContext): ReconciledItem`
- [ ] Populates `annotations.why` with human-readable explanation
- [ ] Format: "[TIER]: [primary reason] [specific match]"
- [ ] Examples:
  - "HIGH: Area match (communications)"
  - "NORMAL: Person match (anthony@example.com)"
  - "LOW: No area/person/keyword matches"
- [ ] One primary reason only (not all reasons combined)
- [ ] Compute `why` AFTER tier is determined

**Test**: Annotation generation unit tests

**⚠️ Pre-Mortem Warning (R7)**: Cap to ONE primary reason per item.

---

#### Task P2-9: Wire Reconciliation into pullFathom

**Description**: Integrate reconciliation into the `arete pull fathom` command.

**Files to read first**:
- `packages/core/src/integrations/fathom/index.ts` — pullFathom implementation
- `packages/cli/src/commands/pull.ts` — CLI command

**Acceptance Criteria**:
- [ ] `pullFathom()` accepts `options.reconcile?: boolean` (default: false)
- [ ] When `reconcile=true`: after all meetings saved, load batch, reconcile, update staged items
- [ ] CLI: `arete pull fathom --reconcile` enables reconciliation
- [ ] Reconciliation runs AFTER all meetings saved (batch operation, not per-meeting)
- [ ] `loadReconciliationContext(workspace)` function loads area memories, completed tasks, recent memory
- [ ] Errors in reconciliation don't fail the entire pull (graceful degradation with warning)

**Test**: Integration test with `--reconcile` flag; test without flag verifies existing behavior unchanged

**⚠️ Pre-Mortem Warning (R5)**: Add test with --reconcile=false FIRST to verify existing behavior.

---

#### Task P2-10: Update Staged Items Output Format

**Description**: Update staged items formatter to show relevance tiers and annotations.

**Files to read first**:
- `packages/cli/src/formatters/staged-items.ts` (or similar formatter file)

**Acceptance Criteria**:
- [ ] Format includes tier indicator: `[HIGH]`, `[NORMAL]`, `[LOW]`
- [ ] Format includes area/project annotation when present
- [ ] Duplicate items excluded from main output (noted in stats summary)
- [ ] Example output: `- ai_001: [HIGH] [@owner → @counterparty] Description (area: communications)`
- [ ] Stats summary: "Processed: 40 items → 15 shown (8 duplicates, 12 low-relevance, 5 completed)"

**Test**: Formatter unit tests with mock reconciled items

---

#### Task P2-11: Add Reconciliation Golden File Tests

**Description**: Add golden file tests for reconciliation scenarios.

**Acceptance Criteria**:
- [ ] 2+ test scenarios in `test-data/reconciliation/`
- [ ] Scenarios cover: cross-meeting duplicates, completion matching, relevance scoring
- [ ] Golden files include: input extractions, context, expected output
- [ ] Tests verify: deduplication correctness, tier assignment, annotation format

**Test**: Golden file comparison in `meeting-reconciliation.test.ts`

---

### Phase 3: QMD Scope Expansion (Optional — Revisit After Phase 2)

#### Task P3-1: Add areas, goals, now Scopes

**Description**: Add QMD scopes for areas, goals, and now directories.

**Files to read first**:
- `packages/core/src/search/qmd-setup.ts` — SCOPE_PATHS, ALL_SCOPES

**Acceptance Criteria**:
- [ ] `SCOPE_PATHS.areas = 'areas'` added
- [ ] `SCOPE_PATHS.goals = 'goals'` added
- [ ] `SCOPE_PATHS.now = 'now'` added
- [ ] `ALL_SCOPES` updated to include new scopes
- [ ] `QmdScope` type updated if needed

**Test**: Collection creation tests; verify `qmd status` shows new scopes

---

#### Task P3-2: Add resources Scope

**Description**: Add QMD scope for resources directory (conversations, notes).

**Acceptance Criteria**:
- [ ] `SCOPE_PATHS.resources = 'resources'` added (single scope covering all of resources/)
- [ ] `ALL_SCOPES` includes `'resources'`
- [ ] Scope indexes: conversations/, notes/, meetings/ (all under resources/)

**Test**: Collection creation test; verify resources content indexed

---

## 6. Quality Gates

After each phase, verify:

| Phase | Gate |
|-------|------|
| 0 | `npm run typecheck && npm test` passes; golden file tests work |
| 1 | AreaContext includes memory; parser reads memory.md; template exists |
| 2 | Reconciliation produces prioritized output; `--reconcile` flag works; tiers display |
| 3 | New scopes created on install/update; search across areas/goals works |

---

## 7. Files to Modify

**Phase 0** (extraction):
- `packages/core/src/services/meeting-extraction.ts` — limits, owner synthesis
- `packages/core/test/services/meeting-extraction.test.ts` — golden file tests
- `test-data/meetings/` — NEW: synthetic transcripts

**Phase 1** (context cards):
- `packages/core/src/models/entities.ts` — AreaMemory type, AreaContext extension
- `packages/core/src/services/area-parser.ts` — memory.md parsing
- `packages/runtime/templates/memory.md` — NEW: template

**Phase 2** (reconciliation):
- `packages/core/src/services/meeting-reconciliation.ts` — NEW: core reconciliation module
- `packages/core/src/services/meeting-reconciliation.test.ts` — NEW: tests
- `packages/core/src/integrations/fathom/index.ts` — wire reconciliation
- `packages/cli/src/commands/pull.ts` — --reconcile flag
- `packages/cli/src/formatters/staged-items.ts` — relevance tier output

**Phase 3** (QMD scopes):
- `packages/core/src/search/qmd-setup.ts` — SCOPE_PATHS, ALL_SCOPES

---

## 8. Test Summary

| Phase | Unit Tests | Integration Tests | Golden Files |
|-------|------------|-------------------|--------------|
| 0 | Limit constants, speaking ratio | - | 3+ extraction transcripts |
| 1 | Memory parser (valid/invalid/missing) | - | - |
| 2 | Dedup, completion, memory, scoring, annotations | `pull fathom --reconcile` | 2+ reconciliation scenarios |
| 3 | Scope constants | `arete install` creates scopes | - |
