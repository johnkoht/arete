# Unify Meeting Extraction — Learnings

**Date**: 2026-03-12
**PRD**: Unify Meeting Extraction
**Status**: Complete

---

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 4/4 (100%) |
| First-attempt success | 3/4 (75%) |
| Total iterations | 1 (Task 3 LEARNINGS.md) |
| Lines removed | ~110 (dead code) |
| Tests | 30/30 passing |
| Commits | 5 |
| Token usage | ~25K (orchestrator ~10K + subagents ~15K) |

---

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| Partial migration state | No | Yes (investigated imports) | Yes |
| Test mock format embedded | No | Yes (helpers first) | Yes |
| `.text` vs `.description` mismatch | No | Yes (adapter) | Yes |
| Confidence calibration | No | Yes (kept thresholds) | Yes |
| nextSteps/decisions no confidence | No | Yes (0.9 default) | Yes |
| Core formatter incompatible | N/A | Skipped | N/A |
| AIService.call() signature | No | Yes (verified early) | Yes |

**Surprises** (not in pre-mortem):
- Core catches LLM errors internally → required explicit error tracking
- Core limits action items to 7 → test adjustment needed
- Core parser expects snake_case JSON → toRawLLMJson() helper created

---

## What Worked Well

### 1. Pre-mortem mitigations were effective
All 7 identified risks were mitigated. The field mismatch adapter (ActionItem.description → ExtractionItem.text) was the key integration piece.

### 2. Incremental task structure
- Task 1: Added call() method (foundation)
- Task 2: Created test helpers (infrastructure)
- Task 3: Wired integration (big change)
- Task 4: Cleanup (polish)

This let each task build on the previous, with tests passing throughout.

### 3. LEARNINGS.md mid-execution
The reviewer caught that Task 3 discoveries should be documented immediately, not deferred. This prevented knowledge loss.

### 4. Reviewer pre-work sanity checks
Caught critical issues before developer work:
- `fm.participants` → `fm.attendees` (wrong field name)
- `deps.call` → `deps.aiService.call` (wrong interface)
- Attendee type `{name, email}[]` → extract names only

---

## What Didn't Work

### 1. A/B comparison not practical
The plan called for A/B comparison (old vs new extraction), but old code was replaced before comparison was done. Relied on automated tests instead — adequate but not ideal for quality comparison.

### 2. Pre-existing test failures are distracting
goals.test.ts and person-memory-integration.test.ts have pre-existing failures unrelated to this work. They create noise in test output and make it harder to verify changes.

---

## Subagent Reflections (Synthesized)

### Developer Insights
- Backend PROFILE.md gotcha about `npm run build:apps:backend` was critical — root typecheck doesn't cover backend
- AITask type from @arete/core worked well for type safety
- Inline test types (not importing from core) avoided coupling

### Reviewer Insights
- Pre-work sanity checks caught 3 issues before implementation
- Backwards compatibility check (for data-writing code) is valuable pattern
- LEARNINGS.md iteration request was correct — capture discoveries immediately

---

## Recommendations

**Continue** (patterns to repeat):
- Pre-mortem for 4+ task PRDs
- Test helpers before main integration
- LEARNINGS.md updates mid-execution
- Reviewer pre-work sanity checks

**Stop** (patterns to avoid):
- Planning A/B comparisons after code is replaced
- Ignoring pre-existing test failures (fix or document)

**Start** (new practices to adopt):
- Add snake_case test helper pattern to backend test conventions
- Consider core extraction limits (7 items) in test design
- Document error-handling workarounds for core services that catch errors internally

---

## Documentation Updates

- ✅ `packages/apps/backend/LEARNINGS.md` — Core extraction integration patterns (3 gotchas)
- ✅ `dev/executions/unify-meeting-extraction/validation-notes.md` — Manual test steps

---

## Files Changed

| File | Changes |
|------|---------|
| `packages/apps/backend/src/services/agent.ts` | +adapter, +callLLM, -~85 lines dead code |
| `packages/apps/backend/test/services/agent.test.ts` | +helpers, +coreResponse, -~25 lines old helpers |
| `packages/apps/backend/LEARNINGS.md` | +Core extraction section |

---

## Commits

1. `104711a` — feat(backend): add call() method to ProcessingDeps
2. `7ecced4` — test(backend): add mock helpers for core extraction format
3. `ab78274` — feat(backend): use extractMeetingIntelligence for meeting processing
4. `d263b35` — docs(backend): add core extraction integration learnings
5. `7f6d12f` — refactor(backend): remove dead extraction code
