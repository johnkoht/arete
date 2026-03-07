# Meeting Extraction Redesign Learnings

**Date**: 2026-03-04
**PRD**: `dev/work/plans/meeting-extraction-redesign/prd.md`
**Execution**: `dev/executions/meeting-extraction-redesign/`

## Metrics

| Metric | Value |
|--------|-------|
| Tasks completed | 6/6 (100%) |
| First-attempt success | 4/6 (67%) |
| Total iterations | 2 |
| Tests added | ~80+ |
| Final test count | 1320 passing |
| Commits | 8 |

## Pre-Mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| LLM extraction garbage | No | Yes (aggressive validation) | Yes |
| Breaking old meetings | No | Yes (skip gracefully + integration tests) | Yes |
| Arrow notation fragility | No | Yes (handle variations + fallback) | Yes |
| Task dependencies | No | Yes (proper ordering) | Yes |
| CLI pattern unknown | No | Yes (explicit file references) | Yes |
| Test coverage shallow | No | Yes (tests per task) | Yes |
| PATTERNS.md missed | No | Yes (explicit task) | Yes |
| Context loss in subagents | No | Yes (comprehensive prompts) | Yes |

**Summary**: 0/8 risks materialized. Pre-mortem was comprehensive and mitigations were effective.

## What Worked Well

1. **Task 2's parser design**: Pure function with clear interface (`parseActionItemsFromMeeting(content, personSlug, ownerSlug, source)`) made integration in Task 4 straightforward.

2. **Reviewer sanity checks**: Caught the direction logic bug in Task 2 before it propagated to Task 4. Also caught misleading test name in Task 4.

3. **Pre-mortem mitigations**: The aggressive validation rules (>150 chars, "Me:", multi-sentence) were explicitly specified in Task 1's AC, preventing garbage from the start.

4. **Existing pattern references**: Pointing developers to `person-signals.ts` for LLM extraction pattern and `meeting.ts` for CLI command pattern minimized reinvention.

## What Didn't Work

1. **Task 2 direction logic**: Initial implementation had inverted directions for fallback heuristics (cases 3 and 4). The semantic confusion between "person's perspective" vs "owner's perspective" was tricky.

2. **Task 4 test naming**: The test "does not clear existing commitments" didn't actually test that behavior — it tested parsing logic only. Misleading names create false confidence.

## Collaboration Patterns

- Builder requested autonomous execution, which worked smoothly
- Pre-mortem was already complete in the plan, saving Phase 1 time

## Recommendations for Next PRD

### Continue
- Comprehensive pre-mortem with explicit mitigations per task
- Task dependencies clearly specified in prd.json
- Reviewer sanity checks before developer dispatch
- LEARNINGS.md updates when behavior changes

### Stop
- Assuming test names accurately describe what they test — verify assertions match names

### Start
- Add direction logic semantics to LEARNINGS.md for person-signals/meeting-parser (done in Task 4)
- Consider adding "semantic validation" step for tests (does the name match assertions?)

## Deliverables

1. **Meeting Extraction Service** (`packages/core/src/services/meeting-extraction.ts`)
   - `buildMeetingExtractionPrompt()` with few-shot examples
   - `parseMeetingExtractionResponse()` with aggressive validation
   - `extractMeetingIntelligence()` end-to-end wrapper

2. **Meeting Parser** (`packages/core/src/services/meeting-parser.ts`)
   - `parseActionItemsFromMeeting()` pure function
   - Handles arrow notation variations (`→`, `->`, `-->`, `=>`)
   - Fallback heuristics for items without notation

3. **CLI Command** (`arete meeting extract <file> [--json]`)
   - Human-readable and JSON output modes
   - LLM client helper in `packages/cli/src/lib/llm.ts`

4. **Updated Workflows**
   - process-meetings skill: extraction → review → save flow
   - PATTERNS.md: parsing-based primary path

5. **Deprecations**
   - `buildActionItemPrompt`, `parseActionItemResponse`, `extractActionItemsForPerson` (LLM path) in person-signals.ts
   - Regex fallback preserved for non-meeting sources

## Documentation Updated

- `packages/core/src/services/LEARNINGS.md` — Action item extraction is now parsing-based
- `packages/cli/src/commands/LEARNINGS.md` — CLI LLM client helper pattern
- `packages/runtime/skills/PATTERNS.md` — get_meeting_context primary/fallback paths
- `packages/runtime/skills/process-meetings/SKILL.md` — New steps 4-6 (extract, review, save)
