# Unify Meeting Extraction PRD

## Goal

Consolidate Web UI meeting extraction to use the production-grade core extraction service (`extractMeetingIntelligence`), eliminating the duplicate basic implementation in `agent.ts`. This brings owner attribution, better validation, and extraction quality parity between CLI and Web UI.

## Background

The backend `agent.ts` has its own extraction schema and prompt, separate from `packages/core/src/services/meeting-extraction.ts`. This was identified as tech debt in the intelligence-tuning PRD (2026-03-09) with explicit recommendation: "Consider unifying extraction flows in future work."

## Pre-Mortem Risks

See `pre-mortem.md` for 7 identified risks with mitigations. Key risks:
- **Field mismatch** (`.text` vs `.description`) — Core uses `description`, backend uses `text`. Create adapter mapping.
- **Confidence calibration** — Core may produce different confidence distributions. Keep existing 0.5/0.8 thresholds initially.
- **Test mock format embedded** — 30 tests expect old format. Create helper for new format, update incrementally.

## Resolved Decisions

1. **Attendees source**: Extract from meeting frontmatter (`fm.participants`). Passed to `extractMeetingIntelligence({ attendees })` for better owner attribution.
2. **nextSteps handling**: Ignore for V1. Core returns `nextSteps: string[]` but backend doesn't use it. Can add later as enhancement.
3. **Validation rigor**: Process 2-3 real meetings A/B (old vs new) in Step 4. Document differences.

---

## Tasks

### Task 1: Add call() Method to ProcessingDeps

**Description**: Enable `agent.ts` to make raw LLM calls required by `extractMeetingIntelligence`. The core extraction function expects `LLMCallFn = (prompt: string) => Promise<string>`, not the structured `callStructured` the backend currently uses.

**Acceptance Criteria**:
- [ ] `ProcessingDeps` interface has `call(task: string, prompt: string) => Promise<{ text: string }>`
- [ ] `createDefaultDeps()` wires `call` to `AIService.call()`
- [ ] All existing 30 tests pass (no behavior change yet)
- [ ] TypeScript compiles without errors

**Files to modify**:
- `packages/apps/backend/src/services/agent.ts`

**Estimate**: 0.5 day

---

### Task 2: Refactor Test Mocks for New Format

**Description**: Update test infrastructure to support core extraction response format. The 30 tests use `makeMockDeps()` which returns `{ text: string, confidence: number }` items. Core uses `ActionItem[]` with `owner`, `ownerSlug`, `direction`, `description`, `confidence`.

**Acceptance Criteria**:
- [ ] `mockCoreExtractionResponse()` helper generates valid JSON matching core extraction schema
- [ ] `mockActionItem()` helper creates items with sensible defaults (`owner: 'me'`, `direction: 'i_owe_them'`)
- [ ] `makeMockDeps` supports `call` method that returns raw JSON text (for core extraction)
- [ ] All 30 tests pass with updated mocks
- [ ] TypeScript compiles without errors

**Files to modify**:
- `packages/apps/backend/test/services/agent.test.ts`

**Notes**:
- Create format helpers first, then update tests incrementally (one `describe` block at a time)
- Jaccard similarity test gotcha: verify test strings mathematically, not intuitively (from LEARNINGS.md)

**Estimate**: 1 day

---

### Task 3: Wire Backend to Core Extraction Service

**Description**: Replace inline extraction in `agent.ts` with `extractMeetingIntelligence` from core. The function is already imported but not used. Create adapter to bridge formats and preserve backend-specific logic (dedup, auto-approval).

**Acceptance Criteria**:
- [ ] `extractMeetingIntelligence` called instead of `callStructured` with `MeetingExtractionSchema`
- [ ] `callLLM` adapter wraps `deps.call()` to match `LLMCallFn` signature
- [ ] Attendees passed from frontmatter: `{ attendees: (fm.participants as string[]) || [] }`
- [ ] Owner/direction fields preserved in extracted action items
- [ ] Adapter maps `ActionItem.description` → backend's expected `text` field for dedup
- [ ] Dedup against user notes works (Jaccard > 0.7)
- [ ] Auto-approval based on confidence works (>0.8 approved, >0.5 included)
- [ ] All tests pass
- [ ] TypeScript compiles without errors

**Files to modify**:
- `packages/apps/backend/src/services/agent.ts`

**Notes**:
- Investigate why `extractMeetingIntelligence` is already imported but unused (git history)
- Core's `decisions` and `learnings` are `string[]` (no confidence) — assign default 0.9 confidence
- `nextSteps` from core is ignored (V1 decision)

**Estimate**: 1.5 days

---

### Task 4: Validate and Clean Up

**Description**: Manual testing, A/B comparison, dead code removal, and documentation.

**Acceptance Criteria**:
- [ ] Manual test: process a real meeting via Web UI, verify owner badges appear in format `@{slug}`
- [ ] A/B comparison: process 2-3 real transcripts with old code (pre-merge) and new code, document differences
- [ ] `buildExtractionPrompt()` function removed (dead code)
- [ ] Old `MeetingExtractionSchema` removed if no longer used
- [ ] Full test suite passes (`npm run typecheck && npm test`)
- [ ] LEARNINGS.md updated in `packages/apps/backend/` if gotchas discovered

**Files to modify**:
- `packages/apps/backend/src/services/agent.ts` (cleanup)
- `packages/apps/backend/LEARNINGS.md` (if needed)

**Estimate**: 0.5 day

---

## Out of Scope

- Changing confidence thresholds (keep existing 0.5/0.8)
- Modifying core extraction service behavior
- Adding new extraction capabilities (context injection, etc.)
- Surfacing `nextSteps` in backend (future enhancement)
- Changing Web UI display format

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Owner attribution in Web UI | 0% | 100% (all action items) |
| Extraction quality | Basic prompt | Production prompt with few-shot |
| Code duplication | 2 implementations | 1 implementation |
| Test coverage | 30 tests | 30 tests (maintained) |

## Dependencies

- Meeting Processing Improvements plan (complete) — provides type infrastructure
- Commit 38be75e — provides approval→commitments flow

## Total Effort

| Task | Estimate |
|------|----------|
| Task 1: Add call() method | 0.5 day |
| Task 2: Refactor test mocks | 1 day |
| Task 3: Wire backend | 1.5 days |
| Task 4: Validate and cleanup | 0.5 day |
| **Total** | **3.5 days** |
