## Pre-Mortem: Extraction Intelligence Improvements

### Risk 1: MeetingIntelligence Type Change Breaks Downstream Consumers

**Problem**: Adding `decisionConfidences?: number[]` and `learningConfidences?: number[]` to `MeetingIntelligence` could break consumers that destructure or spread the type. The type is exported and used in CLI, backend, and tests. If any consumer does strict property checking or serialization, the new fields could cause unexpected behavior.

**Mitigation**: Both fields are optional (`?:`), so existing consumers won't break at compile time. Before implementing, grep for all imports of `MeetingIntelligence` and all spread/destructure patterns to verify none will be affected. The parallel array approach specifically avoids changing the `decisions: string[]` type that most consumers depend on.

**Verification**: `npx tsc --noEmit` passes across all packages. Grep `MeetingIntelligence` confirms no destructure patterns that would conflict.

---

### Risk 2: LLM Response Format Change (Confidence Objects) Causes Parse Failures

**Problem**: Changing the prompt schema from `"decisions": ["string"]` to `"decisions": [{ "text": "...", "confidence": 0.9 }]` means the LLM may return the old string format, the new object format, or a mix. If the parser doesn't handle all variants, extraction silently drops items.

**Mitigation**: The `RawExtractionResult` type (line 109) already declares `decisions?: Array<string | { text?: string; confidence?: number }>`. The parser must handle: (1) plain strings (backwards compat), (2) objects with both fields, (3) objects with only text, (4) objects with only confidence (skip). Add explicit test cases for each variant. Default confidence to `undefined` (not 0.9) when parsing strings so the processing layer can distinguish "no confidence provided" from "LLM said 0.9".

**Verification**: Unit tests cover all 4 parse variants. A string-only response still extracts all decisions/learnings.

---

### Risk 3: Trivial Pattern Filters Are Too Aggressive

**Problem**: New `isTrivialDecision()` and `isTrivialLearning()` regex patterns could false-positive on legitimate items. E.g., "We discussed the POP rollout and decided to proceed" starts with "We discussed" but contains a real decision.

**Mitigation**: Keep patterns anchored to the start (`^`) and match only clearly trivial structures. "We discussed X" with no decision verb should be filtered; "We discussed X and decided Y" should not (the pattern should be `^we (discussed|reviewed|talked about)\b` only when the full item lacks decision verbs like "decided", "agreed", "chose", "approved"). Test with real examples from the diagnosis doc to calibrate. Start conservative — can always tighten later.

**Verification**: Test suite includes both true-positive (should filter) and false-negative (should keep) examples from the diagnosis doc's concrete evidence section.

---

### Risk 4: Batch LLM Review Prompt Produces Inconsistent JSON

**Problem**: The `batchLLMReview()` function depends on the LLM returning parseable JSON `{ "drops": [...] }`. LLMs can return markdown fences, explanatory text before/after JSON, or hallucinate IDs not in the input.

**Mitigation**: Reuse the same JSON extraction approach from `parseMeetingExtractionResponse()` (lines 729-746): strip markdown fences, find first `{` to last `}`, parse. Validate each drop's `id` exists in the input array — silently skip invalid IDs. Wrap entire function in try/catch returning empty drops on any failure. The prompt should end with "Return ONLY valid JSON" matching the existing extraction prompt pattern.

**Verification**: Tests cover: valid JSON, JSON with markdown fences, JSON with preamble text, invalid IDs in drops, completely unparseable response, empty drops array.

---

### Risk 5: Memory File Parsing Assumptions Are Wrong

**Problem**: `parseMemoryItems()` assumes `.arete/memory/items/decisions.md` and `learnings.md` follow the format written by `appendToMemoryFile()`. If files were manually edited, have a different format, or don't exist, parsing could fail or return garbage.

**Mitigation**: Read `staged-items.ts:appendToMemoryFile()` to verify the exact write format before implementing the parser. Handle: file doesn't exist (return empty), file is empty (return empty), sections without date/source metadata (skip or use defaults), mixed formats (handle gracefully). Use StorageAdapter.read() which returns null for missing files.

**Verification**: Test with a real `decisions.md` from the `arete-reserv` workspace (or a faithful copy). Test empty file, missing file, and malformed sections.

---

### Risk 6: Reconciliation Context Loading Adds Latency or Fails Silently

**Problem**: `loadReconciliationContext()` currently returns immediately with empty arrays. Adding real file reads + parsing could slow it down or throw on malformed files, breaking the entire processing pipeline since reconciliation is called from the main processing path.

**Mitigation**: Memory file reads are bounded (2 files, 30-day filter, 100-item cap). Wrap the new loading in try/catch — fall back to empty arrays on any error (current behavior), log a warning. This matches the existing "graceful degradation" pattern used throughout the reconciliation module.

**Verification**: Agent test verifies that a malformed memory file doesn't crash processing — falls back to empty and logs warning.

---

### Risk 7: Test Mock Patterns Diverge Between Packages

**Problem**: Core tests use `StorageAdapter` mocks (in-memory Map), backend tests use different mock patterns (mock file ops). If the batch review function needs both LLM mocking and storage mocking, the test setup could get complex.

**Mitigation**: `batchLLMReview()` takes `callLLM` as a parameter (no storage dependency) — it's a pure function given inputs. Memory loading happens in `loadReconciliationContext()` which already has StorageAdapter mocking patterns. Keep these concerns separate: test `batchLLMReview` with mock LLM only, test `loadReconciliationContext` with mock storage only, test integration in agent.test.ts.

**Verification**: Each new test function has a single mock concern. No test requires both LLM and storage mocks simultaneously.

---

## Summary

Total risks identified: 7
Categories covered: Context Gaps, Test Patterns, Integration, Code Quality, Reuse/Duplication, Platform Issues, Scope Creep

| # | Risk | Severity | Mitigated By |
|---|------|----------|-------------|
| 1 | Type change breaks consumers | MEDIUM | Optional fields + grep verification |
| 2 | LLM response format change | HIGH | Multi-variant parser + exhaustive tests |
| 3 | Trivial filters too aggressive | MEDIUM | Conservative patterns + real-world calibration |
| 4 | Batch review JSON inconsistency | HIGH | Reuse existing JSON extraction + graceful fallback |
| 5 | Memory file format assumptions | MEDIUM | Read actual write code + handle all edge cases |
| 6 | Reconciliation latency/failure | LOW | Bounded reads + try/catch fallback |
| 7 | Test mock complexity | LOW | Separation of concerns in test design |

No CRITICAL risks identified. All risks have concrete mitigations.

**Ready to proceed with these mitigations?**
