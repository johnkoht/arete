# Pre-Mortem: Meeting Extraction Redesign

## Overview

This pre-mortem identifies risks for the meeting extraction redesign work. The goal is to move action item extraction from per-person LLM extraction on raw transcripts (garbage) to single extraction during meeting processing with user review (structured, quality).

---

### Risk 1: LLM Extraction Still Produces Garbage

**Problem**: The current prompt already says "text should be a concise, normalized description — NOT a raw transcript excerpt" but models ignore it. The new prompt, even with few-shot examples, might still produce garbage. If extraction quality doesn't improve, we've just moved the garbage from commitments.json to meeting files (more visible, permanent).

**Mitigation**:
1. Aggressive post-parsing validation in `parseMeetingExtractionResponse()`:
   - Reject items > 150 chars
   - Reject items starting with "Me:", "Them:", "I'm not sure", "Yeah"
   - Reject items containing multiple sentences (more than one period)
   - Reject items with dialogue markers (colons followed by speech)
2. Few-shot examples in prompt showing explicit good/bad contrast
3. User review step catches anything that slips through
4. Easy "skip all action items" option in review UX

**Verification**: Test prompt with real transcript samples before shipping. Check that parser rejects known-bad patterns.

---

### Risk 2: Breaking Person Memory Refresh for Old Meetings

**Problem**: Person memory refresh will be changed to parse `## Action Items` sections instead of LLM extraction. If the "skip meetings without structured sections" logic has a bug, it might process old meetings and return empty results, causing CommitmentsService sync to overwrite good data with nothing.

**Mitigation**:
1. Explicit check in entity.ts: `if (!hasActionItemsSection(content)) return existingItems` 
2. Integration test: old meeting without section → person refresh → existing commitments UNCHANGED
3. Add guard in CommitmentsService.sync(): if incoming items is empty for a person AND existing items exist, log warning but don't wipe
4. Test with real workspace (arete-reserv) before merging

**Verification**: Run integration test showing existing commitments survive when meeting lacks structured sections.

---

### Risk 3: Arrow Notation Parsing Fragility

**Problem**: The `@owner-slug → @counterparty-slug` format requires LLM to produce exact format AND parser to handle variations (→ vs ->, missing @, extra spaces). If parsing fails, direction is wrong or items are missed.

**Mitigation**:
1. Parser handles variations: `→`, `->`, `-->`, `=>` all valid
2. Parser handles missing @: `john-koht → sarah-chen` works
3. Fallback: if no arrow notation, use owner-name heuristics (existing logic from person-signals.ts)
4. Add explicit examples in LLM prompt showing exact format expected
5. User review shows direction for verification

**Verification**: Unit tests for all notation variations. Test fallback path with no arrow notation.

---

### Risk 4: Task Dependencies Not Respected During Execution

**Problem**: Tasks have dependencies (Task 3 needs Task 1's CLI, Task 4 needs Task 2's parser). If orchestrator spawns tasks in wrong order or in parallel, implementations will fail due to missing dependencies.

**Mitigation**:
1. prd.json will have explicit `depends_on` arrays
2. Orchestrator must verify dependency completion before spawning
3. Clear task ordering in PRD: Tasks 1-2 can parallel, then 3-4 can parallel, then 5-7

**Verification**: Check prd.json has depends_on. Review orchestrator's task sequencing.

---

### Risk 5: CLI Command Integration Pattern Unknown

**Problem**: Task 1 creates a new CLI command `arete meeting extract`. Need to follow existing patterns for:
- Command file location and structure
- LLM integration (where does callLLM come from?)
- JSON output format
- Error handling

**Mitigation**:
1. Before implementing, read existing similar commands:
   - `packages/cli/src/commands/people/memory.ts` (uses LLM)
   - `packages/cli/src/commands/pull/fathom.ts` (creates/processes meetings)
2. Follow LLM access pattern: `createLLMClient()` from core
3. Reference in task prompt: "Follow patterns from people/memory.ts for LLM access"

**Verification**: Task 1 prompt includes file references for patterns.

---

### Risk 6: Test Coverage Shallow or Missing

**Problem**: Task 7 (tests) is listed last but tests should be written alongside features. If tests are deferred, they might be rushed or skipped.

**Mitigation**:
1. Change approach: each task includes its own tests (no separate Task 7)
2. Test requirements explicit in each task's acceptance criteria
3. Engineering-lead review checks for test coverage before approving each task

**Verification**: Each task completion includes passing tests. Remove separate Task 7, distribute to each task.

---

### Risk 7: PATTERNS.md Update Missed

**Problem**: Task 5 updates PATTERNS.md but might be forgotten or done incorrectly. Other skills reference this pattern — if it's wrong, they'll behave incorrectly.

**Mitigation**:
1. Read current PATTERNS.md `get_meeting_context` section before updating
2. Verify which skills reference this pattern
3. Update pattern to show: "Primary: parse ## Action Items; Fallback: arete commitments list"
4. Test that meeting-prep skill still works after pattern update

**Verification**: Grep for `get_meeting_context` references; verify they still work.

---

### Risk 8: Context Loss Across Subagent Tasks

**Problem**: Subagents implementing individual tasks won't have full context of the redesign. They might make decisions inconsistent with the overall architecture.

**Mitigation**:
1. Each task prompt includes:
   - Summary of overall goal (extract once, user reviews, parse structured)
   - Files to read first for context
   - Key types/interfaces they must use (MeetingIntelligence, ActionItem, PersonActionItem)
2. Explicitly state: "This is part of the meeting extraction redesign. The new flow is: extract once → user review → save to file → person refresh parses structured sections."

**Verification**: Check each task prompt includes context summary and file reading list.

---

## Summary

| # | Risk | Category | Severity |
|---|------|----------|----------|
| 1 | LLM extraction garbage | Code Quality | High |
| 2 | Breaking old meetings | Integration | High |
| 3 | Arrow notation fragility | Integration | Medium |
| 4 | Task dependencies | Dependencies | Medium |
| 5 | CLI pattern unknown | Context Gaps | Medium |
| 6 | Test coverage shallow | Test Patterns | Medium |
| 7 | PATTERNS.md missed | Context Gaps | Low |
| 8 | Context loss in subagents | Context Gaps | Medium |

**Total risks identified:** 8
**Categories covered:** Code Quality, Integration, Dependencies, Context Gaps, Test Patterns

## Adjustments to Plan

Based on pre-mortem analysis:

1. **Remove Task 7 (separate tests)** — distribute test requirements to each task
2. **Add explicit file reading lists** to each task for subagent context
3. **Add validation heuristics** to Task 1 acceptance criteria (reject transcript patterns)
4. **Add integration test** to Task 4: "old meeting → refresh → commitments unchanged"

**Ready to proceed with these mitigations?**
