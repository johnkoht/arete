# Conversation Capture — Phase 1 Learnings

**Date**: 2026-02-20
**PRD**: dev/work/plans/slack-conversation-capture-phase-1/prd.md
**Branch**: slack-integration

## Metrics

- **Tasks**: 4/4 complete
- **Success rate**: 100% first-attempt (0 iterations)
- **Tests added**: 39 new tests (358 → 359 in suite, 38 from Task 2, 1 from Task 4; Task 1 pre-existing)
- **Commits**: 3 (Task 1 pre-existing as f8fa686)
- **Token usage**: ~30K total (orchestrator only, no subagents — tool not available)

## Pre-Mortem Analysis

| Risk | Materialized | Mitigation Applied | Effective |
|------|-------------|-------------------|-----------|
| State mismatch (Task 1 done) | No | Yes | Yes |
| Fresh context for parser | No | Yes | Yes |
| LLM extraction testability | No | Yes (DI) | Yes |
| Skill path incorrect | No | Yes | Yes |
| Context category mapping | No | Yes | Yes |
| Slack scope creep | No | Yes | Yes |
| Documentation gap | No | N/A | Yes |

## What Worked Well

1. **Pre-existing Task 1**: Detected that Task 1 was already committed, avoided duplicate work. Execution state tracking (prd.json + status.json) was out of sync — updated before proceeding.
2. **DI pattern for LLM extraction**: Using `LLMCallFn` parameter made extraction fully testable without LLM calls. 18 extraction tests run instantly with mocked responses.
3. **Parser fallback chain**: Three-tier design (timestamped → structured → raw) covers all input formats gracefully. Never-throw guarantee validated by explicit edge case tests.
4. **Minimal ContextService changes**: Only 3 lines changed to add conversation discoverability — added to extraDirs + category mapping in both methods.
5. **Source-agnostic from day one**: Naming everything "conversation" (not "slack") kept scope clean. No Slack-specific code anywhere.

## What Didn't Work

1. **Subagent tool unavailable**: Had to execute all tasks directly. This worked fine for a 4-task PRD but would be less effective for larger PRDs. The fallback path in execute-prd skill handled this gracefully.

## Subagent Insights

N/A — executed directly due to tool unavailability.

## Recommendations for Next PRD

1. **Check for pre-existing work**: Before starting execution, verify which tasks are already committed and update execution state accordingly.
2. **Verify subagent availability early**: Check in Phase 0 whether the subagent tool is available, rather than discovering at first dispatch.
3. **Parser robustness**: The structured-line regex requires uppercase first letter — may miss some informal conversation formats. Consider relaxing in Phase 2 if user feedback warrants it.
4. **Extraction prompt tuning**: The current prompt works well in tests but hasn't been validated against real-world conversations. Phase 2 should include manual testing with diverse inputs.

## Learnings

- The MeetingForSave/saveMeetingFile pattern proved to be an excellent template. Following it exactly kept the new conversation code consistent and reviewable.
- Category mapping in ContextService uses path-prefix matching in two places (getRelevantContext search results and getContextInventory scanner) — both need updating when adding new resource types.
