# Meeting Extraction Improvements PRD Learnings

**Date**: 2026-03-25
**PRD**: `dev/work/plans/meeting-extraction-improvements/`
**Branch**: `feature/meeting-extraction-improvements`

---

## Metrics

- **Tasks**: 13/13 complete
- **First-attempt success**: 100% (0 iterations)
- **Pre-mortem risks materialized**: 0/10
- **Tests added**: 80+ new tests
- **Tests passing**: 2126 (0 fail)
- **Commits**: 13 (1 per task)
- **Token usage**: ~75K total (~25K orchestrator + ~50K subagents)

---

## Pre-mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| R1: Factory wiring breaks callers | No | Yes (typecheck) | Yes |
| R2: CLI/Backend priorItems divergence | No | Yes (shared type) | Yes |
| R3: LLM ignores exclusion list | No | Yes (Jaccard safety net) | Yes |
| R4: Over-suppression of updates | No | Yes (UPDATE exception) | Yes |
| R5: Double YAML parse regression | No | Yes (grep all usages) | Yes |
| R6: Performance not measured | No | Yes (read count tests) | Yes |
| R7: priorItems bloat at scale | No | Yes (50-item cap, docs) | Yes |
| R8: Context fails silently | No | Yes (warnings in bundle) | Yes |
| R9: Subagent context gaps | No | Yes (explicit file lists) | Yes |
| R10: Skill docs skipped | No | Yes (documentation task) | Yes |

**All 10 pre-mortem risks were mitigated effectively. None materialized.**

---

## What Worked Well

1. **Explicit file lists in prompts**: Each task prompt included specific files to read first with line numbers. Subagents hit the ground running without exploration overhead.

2. **Pre-mortem risk references in ACs**: Including "⚠️ Pre-Mortem Warning (R5)" directly in acceptance criteria kept mitigations top-of-mind for developers.

3. **Reviewer pre-work sanity checks**: Catching AC ambiguities before dispatch prevented rework. Examples:
   - Task 2: Added `referenceDate?: Date` pattern for testability
   - Task 5: Clarified that `keyDecisions` is a string requiring parsing, not an array
   - Task 6: Identified AC #6 (Jaccard score modification) as unworkable, replaced with exemption list

4. **Sequential task dependencies in Phase 3**: Clear dependency chain (7→7a→8→9) with each task building on the previous one's output. No context loss between tasks.

5. **Domain expertise injection**: Including core/cli PROFILE.md snippets in task prompts gave subagents immediate architectural context without reading entire files.

---

## What Could Improve

1. **Stdin conflict edge case**: Task 10's `--prior-items` option conflicted with `--context` when both used stdin. Reviewer caught this, but pre-mortem should have anticipated it.

2. **Return type changes need caller impact analysis**: Task 11 changed `runProcessingSession()` return type from `void` to `ProcessedMeetingResult`. Should have grepped for callers to assess impact before implementation.

3. **Documentation tasks need exact content**: Task 12 was refined to include the exact markdown to add, which made implementation trivial. Earlier tasks that touched docs didn't have this level of specificity.

---

## Subagent Insights (Synthesized from 13 tasks)

- **What helped most**: Explicit file paths with line numbers, existing pattern references (e.g., "follow testDeps pattern from qmd.ts"), and clear AC boundaries.

- **Token efficiency**: Small tasks (~5K tokens) worked best. Medium tasks (~8K) were still efficient. Tasks with bash examples ran slightly higher (~10K).

- **Test patterns**: Existing mock patterns in test files (createMockStorage, mock AIService) were reusable across tasks. Subagents referenced them without reinvention.

---

## Recommendations

### Continue
- Pre-mortem risk references in ACs ("⚠️ Pre-Mortem Warning (R5)")
- Explicit file lists with line numbers in prompts
- Reviewer pre-work sanity checks catching ambiguities
- Sequential dependencies in related task chains
- Domain expertise snippets in prompts

### Stop
- Assuming return type changes don't affect callers
- Leaving documentation task content vague

### Start
- Pre-mortem check for stdin conflicts when adding options that support `-`
- Caller impact analysis for function signature changes
- Including exact markdown content for documentation tasks

---

## Deliverables

### Phase 1: Performance Fixes
- `findRecentMeetings()` double YAML parse eliminated
- 60-day cutoff with `referenceDate` for testability
- Batched attendee lookup: O(A×N) → O(N) file reads

### Phase 2: Dedup Infrastructure
- `PriorItem` type exported from core
- Jaccard dedup against priorItems (50-item cap, negation bypass)
- Exclusion list in extraction prompt with UPDATE exception

### Phase 3: Area Context Integration
- `AreaParserService` in factory and deps
- `areaContext` in MeetingContextBundle
- Area context section in extraction prompt

### Phase 4: Batch Orchestration
- CLI `--prior-items` option
- Backend priorItems threading with return type for accumulation
- Skill documentation for batch processing pattern

---

## Files Changed Summary

- `packages/core/src/services/meeting-context.ts` (Tasks 1, 2, 3, 7, 8)
- `packages/core/src/services/meeting-extraction.ts` (Tasks 4, 6, 9)
- `packages/core/src/services/meeting-processing.ts` (Task 5)
- `packages/core/src/factory.ts` (Task 7a)
- `packages/cli/src/commands/meeting.ts` (Task 10)
- `packages/apps/backend/src/services/agent.ts` (Task 11)
- `packages/runtime/skills/process-meetings/SKILL.md` (Task 12)
