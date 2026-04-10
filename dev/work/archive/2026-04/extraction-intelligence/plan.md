---
title: "Extraction Intelligence Improvements"
slug: extraction-intelligence
status: complete
size: large
tags: [meetings, extraction, dedup, quality, llm-review]
created: "2026-04-08T00:00:00.000Z"
updated: "2026-04-08T00:00:00.000Z"
completed: "2026-04-09T00:00:00.000Z"
execution: null
has_review: true
has_pre_mortem: true
has_prd: true
steps: 7
---

# Extraction Intelligence Improvements

## Context

A workspace audit revealed systemic duplication and low-signal issues in the meeting extraction pipeline: ~40% of open commitments, ~23% of decisions, and ~18% of learnings could be cleaned up. Root causes: (1) cross-meeting dedup layers are broken or disconnected, (2) decisions/learnings bypass all quality filtering (confidence hardcoded to 0.9, no garbage/trivial filters), (3) no semantic dedup capability. This plan fixes the pipeline with a two-layer LLM dedup architecture (self-review at extraction + batch review post-reconciliation) plus wiring up the broken plumbing.

Diagnosis doc: `.claude/worktrees/sandbox-skill/dev/extraction-intelligence-diagnosis.md`

---

## Phase 1: Prompt Hardening & Confidence Parsing

**Goal**: Make the LLM produce better output at source; enable confidence-based filtering for decisions/learnings.

### 1A. Self-review guidance in normal-mode extraction prompt

**File**: `packages/core/src/services/meeting-extraction.ts` — `buildMeetingExtractionPrompt()` (line 552)

Changes:
- Add `## What is NOT a decision` section after line 624, mirroring the action item EXCLUDE list. Patterns: status updates ("We discussed X"), meeting logistics, restatements of known policy, raw metrics without decision context, goal statements.
- Add `## What is NOT a learning` section. Patterns: personal trivia, org announcements, common knowledge, process descriptions that aren't insights, raw statistics.
- Add self-review instruction to the Rules section (after line 642): "Before finalizing, review your list: remove any decisions that are status updates, remove any learnings that are personal facts or common knowledge, remove duplicates with different wording."

### 1B. Add confidence to decision/learning schema

**File**: `packages/core/src/services/meeting-extraction.ts`

Changes to prompt JSON schema (lines 603-606):
```
"decisions": [{ "text": "string — the decision made", "confidence": "number (0-1)" }],
"learnings": [{ "text": "string — key insight or learning", "confidence": "number (0-1)" }],
```

Note: Light mode prompt (`buildLightExtractionPrompt`) also gets the confidence schema for learnings (no decisions extracted in light mode).

Add decision/learning confidence guide after the action item guide (line 631):
```
## Decision Confidence Guide:
- 0.9-1.0: Explicit choice made with alternatives rejected
- 0.7-0.8: Clear direction chosen, implied alternatives
- 0.5-0.6: Soft agreement, may not be final
- Below 0.5: Not a decision — exclude

## Learning Confidence Guide:
- 0.9-1.0: Novel insight that changes how work is done
- 0.7-0.8: Useful domain knowledge, non-obvious
- 0.5-0.6: Interesting but may be common knowledge
- Below 0.5: Not a learning — exclude
```

### 1C. Parse confidence from LLM response

**File**: `packages/core/src/services/meeting-extraction.ts` — `parseMeetingExtractionResponse()` (lines 838-861)

The `RawExtractionResult` type (line 109) already supports `Array<string | { text?, confidence? }>` for decisions/learnings. The parser currently only handles the `string` case.

Changes:
- Handle both string and `{ text, confidence }` objects for decisions and learnings
- Track confidence in parallel arrays on the result
- Add `decisionConfidences?: number[]` and `learningConfidences?: number[]` to `MeetingIntelligence` type (line 61)
- Populate from parsed confidence values, default to `undefined` (not 0.9) when missing so consumers can distinguish

Test cases for parse variants:
- String-only response (backwards compat): all decisions extracted, confidences default to undefined
- Object-only response: text and confidence both parsed
- Mixed string/object response: both formats handled in same array
- Object with missing confidence: text extracted, confidence undefined
- Object with confidence out of range (>1 or <0): clamp or reject
- Empty arrays: handled gracefully

### 1D. Use real confidence in processing

**File**: `packages/core/src/services/meeting-processing.ts` (lines 402-443)

Changes:
- Decisions loop (line 402): `const confidence = intelligence.decisionConfidences?.[i] ?? 0.9;`
- Learnings loop (line 440): `const confidence = intelligence.learningConfidences?.[i] ?? 0.9;`
- Change to indexed loop (`for (let i = 0; ...`) to access parallel array
- Now the existing thresholds (0.65 include, 0.8 auto-approve) will actually filter decisions/learnings

### 1E. Extend garbage/trivial filters to decisions and learnings

**File**: `packages/core/src/services/meeting-extraction.ts` — `parseMeetingExtractionResponse()`

Changes:
- Apply `isGarbageItem()` to decisions and learnings in the parse loops (before pushing to arrays)
- Add `isTrivialDecision()` function with patterns: `"we discussed/reviewed/talked about"`, `"meeting moved/rescheduled"`, `"team met/synced"`, `"using X for tracking"`. Safety constraint: patterns must NOT match items containing decision verbs (decided, agreed, chose, approved, confirmed). Add negative test cases.
- Add `isTrivialLearning()` function with patterns: personal fact patterns (`"X is/lives/likes"`), social event patterns, known-process restatements
- Note: within-meeting Jaccard dedup for decisions/learnings already exists (lines 889-911) — no change needed there

**Tests** (all in `packages/core/test/services/`):
- `meeting-extraction.test.ts`: prompt contains new sections; `{ text, confidence }` objects parsed correctly; trivial decisions/learnings filtered with warnings
- `meeting-processing.test.ts`: decisions with confidence 0.4 filtered out; decisions with confidence 0.7 -> pending; decisions with confidence 0.9 -> approved; same for learnings

---

## Phase 2: Load Committed Items from Memory

**Goal**: Feed recently committed decisions/learnings into the reconciliation pipeline so already-committed items aren't re-extracted.

**File**: `packages/core/src/services/meeting-reconciliation.ts`

### 2A. Add `parseMemoryItems()` function

New function to parse `.arete/memory/items/decisions.md` and `learnings.md`. Handles the section format written by `appendToMemoryFile()` in `staged-items.ts`:
```
## Title
- **Date**: 2026-04-06
- **Source**: meeting-slug
- The actual text content
```

Returns `Array<{ text: string; date: string; source: string }>`. Filter to last 30 days. Cap at 100 items. Must handle ISO 8601 dates with time component (`YYYY-MM-DDThh:mm:ss.sssZ`).

### 2B. Wire into `loadReconciliationContext()`

**File**: `packages/core/src/services/meeting-reconciliation.ts` (lines 594-615)

Replace `recentCommittedItems: []` (line 612) with actual loading via `StorageAdapter.read()` on the two memory files. This feeds the existing `matchRecentMemory()` function which already works but has never received data.

**Tests**: `meeting-reconciliation.test.ts` — parseMemoryItems handles section format, empty content, date filtering; loadReconciliationContext returns items from mock storage.

---

## Phase 3: Batch LLM Quality Review

**Goal**: One LLM call per processing run that semantically deduplicates against committed memory and catches low-signal items that slipped through rule-based filters.

### 3A. New `batchLLMReview()` function

**File**: `packages/core/src/services/meeting-reconciliation.ts`

```typescript
export async function batchLLMReview(
  currentItems: Array<{ text: string; type: string; id: string }>,
  committedItems: Array<{ text: string; date: string; source: string }>,
  callLLM: (prompt: string) => Promise<string>,
): Promise<Array<{ id: string; action: 'drop'; reason: string }>>
```

Prompt structure:
- "You are reviewing extracted meeting items for quality and duplication"
- Section 1: Recently committed items (from memory) — these are already saved, flag duplicates
- Section 2: Current extraction items (with IDs) — review each
- Task: Return JSON `{ "drops": [{ "id": "...", "reason": "..." }] }` for items to remove
- DROP criteria: semantic duplicate of committed item, status update not a decision, personal trivia not a learning, vague/unactionable
- KEEP everything else — when in doubt, keep

Parse response as JSON (reuse strip-fences + find-braces pattern from `parseMeetingExtractionResponse`). Validate IDs exist in input. Graceful degradation on parse failure (return empty drops, log warning with error details). Job status must remain unchanged on batch review failure (does not set to error).

### 3B. Integrate into backend processing

**File**: `packages/apps/backend/src/services/agent.ts` — `runProcessingSessionTestable()` (after reconciliation merge, ~line 335)

- Guard: check `deps.aiService` is available and configured before calling. Skip silently if not configured.
- After rule-based reconciliation, collect non-skipped items
- Load committed items from reconciliation context
- Call `batchLLMReview()` with items + committed memory
- Apply drops: set status='skipped', source='reconciled'
- Wrap in try/catch — failure degrades gracefully, logs warning
- Add job event for transparency: "Batch review dropped N items"
- Update barrel export: add `batchLLMReview` and `parseMemoryItems` to `packages/core/src/services/index.ts`

### 3C. Integrate into CLI path

**File**: `packages/cli/src/commands/meeting.ts`

- When `--reconcile` flag is used, also run `batchLLMReview()` after reconciliation
- Use the same `callLLM` function already available in the CLI extraction flow

**Tests**:
- `meeting-reconciliation.test.ts`: mock LLM returns drops -> correct items flagged; empty drops -> all kept; malformed JSON -> graceful empty result
- `agent.test.ts`: batch review integration — dropped items get status='skipped'

---

## Phase 4: Wire Prior Items in Backend

**Goal**: Feed recent meeting items into the extraction prompt's exclusion list so the LLM avoids re-extracting known items.

**File**: `packages/apps/backend/src/services/agent.ts` — `runProcessingSession()` (~line 430)

Changes:
- Before calling `runProcessingSessionTestable()`, load recent meeting items via `loadRecentMeetingBatch()` (already available in reconciliation.ts)
- Convert to `PriorItem[]` format and pass as `options.priorItems`
- This feeds `buildExclusionListSection()` (extraction.ts:420) which builds the "SKIP these items" prompt section
- Wrap in try/catch — failure means extraction runs without exclusion list (current behavior)

Note: `loadRecentMeetingBatch` will be called twice (once here, once in reconciliation). The overlap is acceptable — these are fast file reads bounded by 7 days. Can optimize later with caching if needed.

**Tests**: `agent.test.ts` — verify priorItems populated from recent meetings and passed to extraction.

---

## Phase 5: Deferred — Commitment Mirroring

The `merge-commitments-into-tasks` branch may eliminate Issue 3 (commitment mirroring via `personSlug` in hash). Add a TODO comment near `commitments.ts:189` and revisit after that branch lands.

---

## Execution Order

Linear PRD execution order:
1. **Phase 1** (prompt + confidence + filters) — zero risk, no new calls, backwards compatible
2. **Phase 2** (memory loading) — low risk, enables Phase 3 data
3. **Phase 4** (wire prior items) — independent, low risk, improves prompt-level dedup
4. **Phase 3** (batch LLM review) — medium risk, new LLM call, depends on Phase 2

---

## Latency Budget

| Phase | Added latency | Notes |
|-------|--------------|-------|
| 1 (prompt/parse/filter) | ~0ms | Prompt changes, regex filters only |
| 2 (memory loading) | ~50ms | Read 2 small files |
| 3 (batch LLM review) | ~5-10s | One LLM call, bounded input (<30 items + <100 committed) |
| 4 (prior items) | ~200ms | Read recent meeting files (7-day window) |

Total worst case for single meeting: ~10s additional. Batch of 7: same +10s (batch review is per-run, not per-meeting).

---

## Key Files

| File | Changes |
|------|---------|
| `packages/core/src/services/meeting-extraction.ts` | Prompt sections, confidence schema, parse objects, trivial filters |
| `packages/core/src/services/meeting-processing.ts` | Use real confidence from parallel arrays |
| `packages/core/src/services/meeting-reconciliation.ts` | `parseMemoryItems()`, wire `loadReconciliationContext()`, `batchLLMReview()` |
| `packages/apps/backend/src/services/agent.ts` | Batch review integration, prior items wiring |
| `packages/cli/src/commands/meeting.ts` | Batch review in CLI reconcile path |
| `packages/core/test/services/meeting-extraction.test.ts` | Prompt, parsing, filter tests |
| `packages/core/test/services/meeting-processing.test.ts` | Confidence threshold tests |
| `packages/core/test/services/meeting-reconciliation.test.ts` | Memory parsing, batch review tests |
| `packages/apps/backend/test/services/agent.test.ts` | Integration tests |

---

## Verification

1. **Unit tests**: `npm test` across core + backend packages — all existing tests pass, new tests cover each fix
2. **Type check**: `npx tsc --noEmit` from each package root
3. **Manual test**: Process one of the 7 unprocessed meetings in `arete-reserv` sandbox and compare:
   - Decisions/learnings count (should be lower)
   - Confidence scores (should vary, not all 0.9)
   - Batch review log (should show drops with reasons)
   - No regressions on action item extraction
