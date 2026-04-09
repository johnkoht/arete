## Review: Extraction Intelligence Improvements

**Type**: Plan
**Audience**: Builder
**Review Path**: Full
**Complexity**: Large (7 steps, 9+ files, architectural change: new LLM call in pipeline)
**Recommended Track**: full — /ship with standard flow

### Strengths

- **Grounded in real data**: The diagnosis doc provides concrete duplicate counts, Jaccard similarity measurements, and real-world examples. This isn't speculative — the problems are proven.
- **Two-layer LLM dedup architecture is well-designed**: Self-review at extraction (free) + batch review post-reconciliation (one call) is the right split. Avoids per-meeting LLM overhead.
- **Backwards compatible**: Parallel arrays for confidence (`decisionConfidences?: number[]`) preserve the existing `decisions: string[]` API. Optional fields won't break consumers.
- **Latency-conscious**: Total worst case is ~10s additional per run. Batch review is per-run, not per-meeting.
- **Good use of existing infrastructure**: RawExtractionResult already supports `{ text, confidence }`, matchRecentMemory() already works, loadRecentMeetingBatch() exists.

### Concerns

1. **[Test Coverage]**: The plan lists test expectations at a high level but doesn't specify test counts or edge cases for each sub-step. For example, Phase 1C (parse confidence) should explicitly test: string-only response, object-only, mixed, missing confidence field, confidence out of range, empty arrays. The pre-mortem identified this (Risk 2) but the plan doesn't reflect it back into concrete ACs.
   - Suggestion: Add explicit test case lists to each sub-step, especially 1C, 1E, 2A, and 3A.

2. **[Integration — AIService check]**: Phase 3B integrates batch LLM review into agent.ts but doesn't mention the `AIService.isConfigured()` guard. Backend LEARNINGS.md requires checking this before any AI call. If AIService isn't configured, the batch review should skip silently, not error.
   - Suggestion: Add to 3B: "Check `deps.aiService?.isConfigured?.()` before calling batchLLMReview. Skip silently if not configured."

3. **[Scope — Light mode prompt unchanged]**: Phase 1A adds exclusion guidance to the normal-mode prompt but doesn't mention light mode. Light mode already has "What to SKIP" guidance (lines 672-676) — should the new decision/learning confidence schema also apply there? Light mode extracts learnings (max 2), so confidence would be useful.
   - Suggestion: Clarify whether light mode prompt gets the confidence schema addition. If yes, add it. If no (since light mode extracts max 2 learnings), document why.

4. **[Dependencies — Phase ordering]**: Plan says "Phases 1, 2, and 4 can proceed in parallel. Phase 3 depends on Phase 2." But in a single worktree with sequential execution, this needs to be a linear order. The PRD task ordering should be: 1 → 2 → 4 → 3 (or 1 → 2 → 3 → 4 since 4 is truly independent).
   - Suggestion: Specify the linear PRD execution order explicitly.

5. **[Completeness — Barrel export]**: Phase 3A adds `batchLLMReview` and Phase 2A adds `parseMemoryItems` to meeting-reconciliation.ts. These need to be exported from the service barrel (`packages/core/src/services/index.ts`) for backend/CLI to import them.
   - Suggestion: Add a step to update the barrel export.

6. **[Backward Compatibility — Prompt schema change]**: Changing decisions/learnings from `["string"]` to `[{ "text": "...", "confidence": 0.9 }]` in the prompt schema means the LLM will start returning objects. Any downstream code that reads raw LLM responses (logging, debugging, analysis) may break if it assumes strings.
   - Suggestion: Verify no code reads raw extraction JSON outside of `parseMeetingExtractionResponse()`. The `rawItems` array in `MeetingExtractionResult` should already abstract this.

### AC Validation Issues

| Step | Issue | Suggested Fix |
|------|-------|---------------|
| 1E | "Add isTrivialDecision() function with patterns" — no AC for false positive rate | Add: "Trivial filters must not reject items containing decision verbs (decided, agreed, chose, approved)" |
| 2A | "Returns Array<{ text, date, source }>. Filter to last 30 days. Cap at 100 items." — good, but date format unspecified | Add: "Handles ISO 8601 dates with time component (YYYY-MM-DDThh:mm:ss.sssZ)" |
| 3A | "Graceful degradation on parse failure" — good, but no logging requirement | Add: "Logs warning on parse failure with error details for debugging" |
| 3B | "Wrap in try/catch" — no AC for what happens to job status | Add: "Job status remains unchanged on batch review failure (does not set to error)" |

### Test Coverage Gaps

- Phase 1A (prompt changes): No test specified for self-review instruction presence in prompt string
- Phase 3C (CLI integration): No test specified — CLI meeting.ts needs coverage for `--reconcile` path with batch review
- Phase 4 (prior items wiring): Test expectation is vague ("verify priorItems populated") — specify: "priorItems array length matches sum of action items + decisions + learnings from recent batch"

### Devil's Advocate

**If this fails, it will be because...** the LLM doesn't reliably return confidence scores for decisions/learnings even when asked. Unlike action items where confidence maps to concrete attributes (owner + deadline + deliverable), decision/learning confidence is more subjective. The LLM may default to high confidence for everything, making the filtering ineffective. The batch LLM review (Phase 3) is the real safety net — the per-item confidence (Phase 1) may not move the needle as much as expected.

**The worst outcome would be...** the trivial pattern filters (Phase 1E) are too aggressive and silently drop legitimate decisions/learnings without the user knowing. Unlike the batch review (which logs reasons), regex filters just increment a warning counter that may not be visible in the UI. A user could process 5 meetings and not realize that important decisions were filtered because they matched a pattern like "We discussed X and decided Y."

### Verdict

- [x] **Approve with suggestions** — Address the 6 concerns above before PRD creation. None are blocking, but the AC refinements and AIService guard are important for implementation quality.

### Suggested Changes

**Change 1**: AC Refinement
- **What's wrong**: Test expectations are high-level, not specific enough for PRD tasks
- **What to do**: Add explicit test case lists to steps 1C, 1E, 2A, 3A, 3C
- **Where to fix**: plan.md — Tests sections under each phase

**Change 2**: AIService Guard
- **What's wrong**: Phase 3B doesn't check AIService.isConfigured()
- **What to do**: Add guard: "Check deps.aiService is configured before calling batchLLMReview. Skip silently if not."
- **Where to fix**: plan.md — Phase 3B

**Change 3**: Light Mode Decision
- **What's wrong**: Unclear whether light mode gets confidence schema
- **What to do**: Add note: "Light mode prompt gets confidence on learnings only (no decisions extracted in light mode)"
- **Where to fix**: plan.md — Phase 1B

**Change 4**: Barrel Export
- **What's wrong**: New exported functions not added to service index
- **What to do**: Add step: "Update packages/core/src/services/index.ts to export batchLLMReview and parseMemoryItems"
- **Where to fix**: plan.md — new sub-step under Phase 3A

**Change 5**: Trivial Filter Safety
- **What's wrong**: Regex filters could silently drop legitimate items
- **What to do**: Add AC: "Trivial decision patterns must not match items containing decision verbs (decided, agreed, chose, approved, confirmed). Add negative test cases."
- **Where to fix**: plan.md — Phase 1E

**Change 6**: Linear Execution Order
- **What's wrong**: Parallel execution note doesn't map to PRD task ordering
- **What to do**: Specify: "PRD execution order: Phase 1 → Phase 2 → Phase 4 → Phase 3"
- **Where to fix**: plan.md — Execution Order section
