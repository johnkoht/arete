# PRD: Extraction Intelligence Improvements

## Goal

Fix systemic duplication and low-signal issues in the meeting extraction pipeline by implementing a two-layer LLM dedup architecture (self-review at extraction + batch review post-reconciliation), enabling real confidence filtering for decisions/learnings, and wiring up broken dedup plumbing.

## Tasks

### Task 1: Prompt hardening — self-review guidance and exclusion sections

Add decision/learning exclusion guidance and self-review instructions to the normal-mode extraction prompt, mirroring the existing action item INCLUDE/EXCLUDE pattern.

**Files**: `packages/core/src/services/meeting-extraction.ts`

**Acceptance Criteria**:
- `buildMeetingExtractionPrompt()` output contains `## What is NOT a decision` section with 4+ EXCLUDE examples (status updates, meeting logistics, policy restatements, raw metrics)
- `buildMeetingExtractionPrompt()` output contains `## What is NOT a learning` section with 4+ EXCLUDE examples (personal trivia, org announcements, common knowledge, process descriptions)
- Rules section contains self-review instruction: "Before finalizing, review your list"
- Unit test: prompt string contains all three new sections
- Existing prompt tests pass unchanged

### Task 2: Add confidence schema to decision/learning extraction

Change the prompt JSON schema to request `{ text, confidence }` objects for decisions and learnings. Add confidence guides. Update the light-mode prompt for learnings only.

**Files**: `packages/core/src/services/meeting-extraction.ts`

**Acceptance Criteria**:
- Normal-mode prompt schema shows decisions as `[{ "text": "...", "confidence": "number (0-1)" }]`
- Normal-mode prompt schema shows learnings as `[{ "text": "...", "confidence": "number (0-1)" }]`
- Prompt contains `## Decision Confidence Guide` with 4 tiers (0.9-1.0, 0.7-0.8, 0.5-0.6, below 0.5)
- Prompt contains `## Learning Confidence Guide` with 4 tiers
- Light-mode prompt learnings schema also uses `{ text, confidence }` format
- Unit test: prompt contains confidence guides for decisions and learnings

### Task 3: Parse confidence from LLM response for decisions/learnings

Update `parseMeetingExtractionResponse()` to handle both string and `{ text, confidence }` objects in decisions/learnings arrays. Add `decisionConfidences` and `learningConfidences` parallel arrays to `MeetingIntelligence`.

**Files**: `packages/core/src/services/meeting-extraction.ts`

**Acceptance Criteria**:
- `MeetingIntelligence` type has `decisionConfidences?: number[]` and `learningConfidences?: number[]`
- Parser handles string-only responses: all decisions extracted, confidences default to undefined
- Parser handles object-only responses: text and confidence both parsed
- Parser handles mixed string/object arrays: both formats extracted
- Parser handles objects with missing confidence: text extracted, confidence undefined
- Parser handles confidence out of range (>1 or <0): clamped to [0,1] or rejected
- Parser handles empty arrays gracefully
- `rawItems` entries include parsed confidence for debugging
- Existing parse tests pass unchanged (backwards compat with string-only)
- Pre-mortem R2: Test all 6 parse variant cases listed above

### Task 4: Use real confidence in processing for decisions/learnings

Replace the hardcoded `0.9` confidence in `processMeetingExtraction()` with real values from `decisionConfidences`/`learningConfidences` parallel arrays.

**Files**: `packages/core/src/services/meeting-processing.ts`

**Acceptance Criteria**:
- Decisions loop uses `intelligence.decisionConfidences?.[i] ?? 0.9` (not hardcoded 0.9)
- Learnings loop uses `intelligence.learningConfidences?.[i] ?? 0.9` (not hardcoded 0.9)
- Decision with confidence 0.4 is filtered out (below 0.65 include threshold)
- Decision with confidence 0.7 gets status 'pending' (above 0.65, below 0.8)
- Decision with confidence 0.9 gets status 'approved' (above 0.8)
- Same three tests for learnings
- Backwards compat: when `decisionConfidences` is undefined, defaults to 0.9 (existing behavior)
- Existing processing tests pass unchanged

### Task 5: Extend garbage/trivial filters to decisions and learnings

Apply `isGarbageItem()` to decisions and learnings during parsing. Add `isTrivialDecision()` and `isTrivialLearning()` filter functions with domain-specific patterns.

**Files**: `packages/core/src/services/meeting-extraction.ts`

**Acceptance Criteria**:
- `isGarbageItem()` called for each decision and learning in parse loop (before pushing to arrays)
- Garbage decisions/learnings produce `validationWarnings` entries
- `isTrivialDecision()` matches: "We discussed the roadmap", "Meeting moved to Tuesday", "Team synced on status"
- `isTrivialDecision()` does NOT match items containing decision verbs: "We discussed and decided to ship Friday", "Team agreed on the new API"
- `isTrivialLearning()` matches personal trivia patterns
- Normal decisions/learnings pass through unfiltered
- Pre-mortem R3: Include both positive (should filter) and negative (should keep) test cases from diagnosis doc examples

### Task 6: Load committed items from memory files

Add `parseMemoryItems()` to parse `.arete/memory/items/decisions.md` and `learnings.md`. Wire into `loadReconciliationContext()` to replace the hardcoded empty `recentCommittedItems`.

**Files**: `packages/core/src/services/meeting-reconciliation.ts`

**Acceptance Criteria**:
- `parseMemoryItems(content, defaultSource)` function exported
- Handles section format: `## Title` + `- **Date**: YYYY-MM-DD` + `- **Source**: slug` + `- text`
- Handles ISO 8601 dates with time component (`2026-04-06T19:30:00.000Z`)
- Returns `Array<{ text: string; date: string; source: string }>`
- Filters to last 30 days, caps at 100 items
- Returns empty array for missing file (StorageAdapter.read() returns null)
- Returns empty array for empty file content
- Skips malformed sections gracefully (no date, no text)
- `loadReconciliationContext()` loads from `.arete/memory/items/decisions.md` and `learnings.md`
- `recentCommittedItems` populated (no longer hardcoded `[]`)
- Pre-mortem R5: Use StorageAdapter.read(), never fs directly
- Unit tests for all edge cases above

### Task 7: Batch LLM quality review function and integration

Add `batchLLMReview()` for semantic dedup and quality filtering. Integrate into backend processing pipeline and CLI reconcile path.

**Files**: `packages/core/src/services/meeting-reconciliation.ts`, `packages/apps/backend/src/services/agent.ts`, `packages/cli/src/commands/meeting.ts`, `packages/core/src/services/index.ts`

**Acceptance Criteria**:
- `batchLLMReview(currentItems, committedItems, callLLM)` function exported from meeting-reconciliation.ts
- Prompt includes committed items section, current items section with IDs, and DROP/KEEP criteria
- Returns `Array<{ id: string; action: 'drop'; reason: string }>`
- Handles valid JSON response: correct items flagged for drop
- Handles JSON with markdown fences: strips and parses
- Handles malformed JSON: returns empty drops array, logs warning
- Handles invalid IDs in drops: silently skips
- Handles empty drops: all items kept
- Backend integration (agent.ts): called after rule-based reconciliation, drops applied as status='skipped' source='reconciled'
- Backend: guards with AIService configured check; skips silently if not configured
- Backend: job status unchanged on batch review failure (graceful degradation)
- Backend: job event logged: "Batch review dropped N items"
- CLI integration: runs when `--reconcile` flag is used
- Barrel export: `batchLLMReview` and `parseMemoryItems` added to `packages/core/src/services/index.ts`
- Pre-mortem R4: Reuse strip-fences + find-braces JSON extraction pattern from parseMeetingExtractionResponse
- Unit tests: 5+ test cases covering all parse scenarios
- Integration test in agent.test.ts: batch review drops reflected in staged item status

### Task 8: Wire prior items from recent meetings in backend

Load recent meeting items via `loadRecentMeetingBatch()` and pass as `priorItems` to extraction, feeding the prompt-level exclusion list.

**Files**: `packages/apps/backend/src/services/agent.ts`

**Acceptance Criteria**:
- Before `runProcessingSessionTestable()`, loads recent meetings via `loadRecentMeetingBatch()`
- Converts to `PriorItem[]` format (type + text + source for each action item, decision, learning)
- Passes as `options.priorItems` to processing session
- Wrap in try/catch: failure means extraction runs without exclusion list (logs warning, current behavior)
- Unit test: priorItems array length matches sum of items from recent batch
- Existing agent tests pass unchanged

### Task 9: Deferred commitment mirroring note

Add TODO comment about commitment mirroring, pending the `merge-commitments-into-tasks` branch.

**Files**: `packages/core/src/services/commitments.ts`

**Acceptance Criteria**:
- TODO comment added near `computeCommitmentHash()` (~line 189) referencing the mirroring issue and the pending branch
- No functional code changes
