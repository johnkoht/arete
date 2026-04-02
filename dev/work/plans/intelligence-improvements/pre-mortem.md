# Pre-Mortem: Meeting Intelligence Improvements

## Risk 1: Context Gap in Reconciliation Module

**Problem**: The reconciliation module (Phase 2) needs deep understanding of:
- Existing extraction output format (`MeetingIntelligence`, `ActionItem`, etc.)
- How `pullFathom` processes meetings and writes staged items
- The SearchProvider interface for QMD vsearch
- Existing Jaccard implementation in `meeting-extraction.ts`

A developer starting Phase 2 without this context will make incorrect assumptions about data shapes.

**Mitigation**: 
- Before starting Phase 2, read these files completely:
  - `packages/core/src/services/meeting-extraction.ts` (extraction output, Jaccard impl)
  - `packages/core/src/integrations/fathom/index.ts` (pullFathom flow)
  - `packages/core/src/search/types.ts` (SearchProvider interface)
  - `packages/core/src/models/intelligence.ts` (MeetingIntelligence types)
- Include mini-context in task prompts: "Extraction returns `MeetingIntelligence` with `actionItems[]`, `decisions[]`, `learnings[]`"

**Verification**: Check that subagent prompts include file reading list and type summary.

---

## Risk 2: Test Pattern Mismatch

**Problem**: Phase 0 requires golden file tests for extraction, but extraction tests currently use mocked LLM responses. Creating golden files with real transcripts requires careful handling of:
- Privacy (real meeting content)
- Determinism (LLM outputs vary)
- Test infrastructure (how to compare expected vs actual)

**Mitigation**:
- Review existing test patterns in `meeting-extraction.test.ts` first
- Use anonymized/synthetic transcripts for golden files, not real meeting content
- For LLM output comparison: either mock the LLM call or use snapshot testing with loose matching
- Follow `testDeps` pattern from `qmd.ts` for injecting mock dependencies

**Verification**: Golden file tests pass in CI without hitting real LLM APIs.

---

## Risk 3: Phase 1 → Phase 2 Data Flow

**Problem**: Phase 2's relevance scoring depends on Phase 1's context cards being populated correctly. If `AreaMemory` parsing is broken or `memory.md` files don't exist, Phase 2 tests will fail with unclear errors.

**Mitigation**:
- Complete ALL of Phase 1 before starting Phase 2
- Run `getAreaContext()` manually after Phase 1 to verify memory parsing works
- Create explicit test fixtures for Phase 2 that include mock `AreaMemory` data (don't rely on real files)
- Step 7 (manual population) is BLOCKING for Phase 2 validation

**Verification**: Before Phase 2, confirm `getAreaContext('test-area').memory` returns valid data.

---

## Risk 4: QMD Unavailable Fallback

**Problem**: Step 11 uses QMD vsearch for workspace matching. On systems without QMD installed (CI, new machines), this fails. The plan says "fallback to skipping" but doesn't specify what happens to the items that would have been matched.

**Mitigation**:
- Explicit fallback behavior: When QMD unavailable, skip workspace matching entirely (items remain `status: 'keep'`)
- Add `ARETE_SEARCH_FALLBACK=1` test to verify fallback path
- Log warning when QMD unavailable so user knows matching is degraded
- Consider: Should completed task matching use Jaccard-only when no QMD?

**Verification**: Run reconciliation with `ARETE_SEARCH_FALLBACK=1` and confirm no errors, reasonable output.

---

## Risk 5: pullFathom Integration Complexity

**Problem**: Step 16 wires reconciliation into `pullFathom()`. This is complex because:
- Extraction happens in parallel across meetings
- Reconciliation needs ALL extractions to be complete
- Staged items format changes affect existing workflow
- `--reconcile` flag adds new code path that might break existing behavior

**Mitigation**:
- Add integration test with `--reconcile=false` to verify existing behavior unchanged
- Reconciliation should be additive: if it fails, fall back to current behavior (log warning, continue)
- The `options.reconcile` default is `false` — existing users see no change
- Test the full flow: extract → reconcile → stage, not just individual functions

**Verification**: Run `arete pull fathom` without `--reconcile` flag, confirm identical to current behavior.

---

## Risk 6: Relevance Scoring Calibration

**Problem**: The scoring formula (keyword 0.3, person 0.3, area 0.4) is arbitrary. If weights are wrong:
- Too aggressive → important items hidden in "low relevance"
- Too lenient → no reduction in review burden
- The formula may need tuning per user

**Mitigation**:
- Default thresholds are conservative: 0.7 for high, 0.4 for normal
- "Low relevance" tier still shows items (just deprioritized) — nothing deleted
- Log scoring details when `ARETE_DEBUG=1` for calibration
- Phase 4 explicitly includes "tune weights based on feedback"

**Verification**: Run on real 5-meeting batch; manually review "low relevance" items for false negatives.

---

## Risk 7: Scope Creep in Annotation "Why"

**Problem**: The `why` annotation is meant to be human-readable ("Matches Communications area keywords: email, templates"). This could become:
- Too verbose (full keyword list every time)
- Too generic ("matched an area")
- Expensive to compute (checking every possible match)

**Mitigation**:
- Define annotation format upfront: "[Tier] [primary reason] [specific match]"
- Examples:
  - "HIGH: Area match (communications)"
  - "NORMAL: Person match (anthony@)"
  - "LOW: No area/person/keyword matches"
- Cap to ONE primary reason, not all reasons
- Compute why AFTER tier is determined, not during

**Verification**: Review annotation output format before shipping; ensure consistent structure.

---

## Risk 8: memory.md Format Brittleness

**Problem**: Phase 1 introduces `memory.md` with specific sections (Keywords, Active People, etc.). If users format it differently, parsing fails. Unlike YAML frontmatter, markdown sections are loosely structured.

**Mitigation**:
- Parser should be lenient: missing sections → empty arrays, not errors
- Use case-insensitive section matching: "## Keywords" = "## KEYWORDS" = "## keywords"
- Log parsing warnings (not errors) for malformed sections
- Template includes clear examples in each section
- Consider YAML frontmatter for structured fields (keywords, people) and markdown body for notes

**Verification**: Test parser with: valid file, empty file, malformed file, missing sections.

---

## Summary

**Total risks identified**: 8  
**Categories covered**: Context Gaps, Test Patterns, Integration, Dependencies, Platform Issues, Scope Creep, Code Quality, State Tracking

| # | Risk | Severity | Phase Affected |
|---|------|----------|----------------|
| 1 | Context Gap in Reconciliation | High | Phase 2 |
| 2 | Test Pattern Mismatch | Medium | Phase 0 |
| 3 | Phase 1 → Phase 2 Data Flow | High | Phase 2 |
| 4 | QMD Unavailable Fallback | Medium | Phase 2 |
| 5 | pullFathom Integration Complexity | High | Phase 2 |
| 6 | Relevance Scoring Calibration | Medium | Phase 2 |
| 7 | Scope Creep in Annotations | Low | Phase 2 |
| 8 | memory.md Format Brittleness | Medium | Phase 1 |
