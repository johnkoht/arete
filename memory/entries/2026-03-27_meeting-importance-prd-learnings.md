# Meeting Importance PRD Learnings

**Date**: 2026-03-27
**PRD**: `dev/work/plans/meeting-importance/`
**Branch**: `main` (direct execution)

---

## Metrics

- **Tasks**: 7/7 complete
- **First-attempt success**: 71% (5/7 tasks; 2 required 1 iteration each)
- **Pre-mortem risks materialized**: 0/8 (all mitigated)
- **Tests added**: 88+ new tests
- **Tests passing**: 2243 (0 fail)
- **Commits**: 8 (7 implementation + 1 plan)
- **Token usage**: ~60K total (~15K orchestrator + ~45K subagents)

---

## Pre-mortem Analysis

| Risk | Materialized? | Mitigation Applied? | Effective? |
|------|--------------|---------------------|-----------|
| R1: CalendarEvent type ripple | No | Yes (optional fields) | Yes |
| R2: Google API field availability | No | Yes (optional chaining) | Yes |
| R3: Light extraction over-filtering | No | Yes (reprocessing option) | Yes |
| R4: Speaking ratio accuracy | No | Yes (undefined for no labels) | Yes |
| R5: Frontend/backend mismatch | No | Yes (backend-only V1) | Yes |
| R6: Auto-approve race condition | **Caught in review** | Yes (status='approved' for light) | Yes |
| R7: Thorough mode test breaks | No | Yes (separate LIMITS constants) | Yes |
| R8: Importance not propagated | No | Yes (frontmatter persistence) | Yes |

**R6 was caught by reviewer, not pre-mortem**: The pre-mortem identified the race condition risk but the mitigation spec ("atomic write") wasn't specific enough. The reviewer caught that light meetings were getting `status: 'processed'` instead of `status: 'approved'`. Future pre-mortems should specify expected status values explicitly.

---

## What Worked Well

1. **Pre-work sanity checks**: Caught ambiguities before implementation:
   - Task 2: Inference priority order not specified → clarified precedence
   - Task 3: Thorough mode confidence floor contradiction → resolved
   - Task 4: Wrong example transcript (no speaker labels) → corrected
   - Task 5: Owner name source for speaking ratio → specified git config fallback
   - Task 6: Architecture clarification (Fathom/Krisp vs calendar pull) → refined scope

2. **Reviewer catching implementation gaps**: Two tasks required iteration due to reviewer catches:
   - Task 5: Light meetings should get `status: 'approved'` not `status: 'processed'`
   - Task 7: Extraction limits table had incorrect values

3. **Explicit file paths in prompts**: Including exact line numbers and patterns helped subagents hit the ground running without exploration overhead.

4. **Architecture clarification in Task 6**: The reviewer correctly identified that `pullCalendar()` doesn't create files — only displays events. Refining the task to wire into Fathom/Krisp pulls instead prevented wasted effort.

---

## What Could Improve

1. **Pre-mortem R6 was too vague**: "Atomic write" is a pattern, not a verification spec. Should have included: "Verify light meetings get `status: 'approved'` (not `status: 'processed'`)."

2. **Documentation accuracy in Task 7**: Developer wrote incorrect extraction limits in LEARNINGS.md table. Documentation tasks should include a "verify against code" step in AC.

3. **Speaking ratio owner name**: The PRD didn't specify where to get the owner name. This was resolved during Task 5 sanity check (use `git config user.name`), but should have been in the original PRD.

---

## Subagent Insights (Synthesized from 7 tasks)

- **What helped most**: Clear file paths with purpose, pre-mortem mitigations in AC, existing pattern references (e.g., "follow attendees mapping pattern at L225")
- **Token efficiency**: Small tasks (~5K tokens), medium tasks (~8-12K), integration-heavy tasks (~15K)
- **Test patterns**: Existing mock patterns and helpers made adding tests straightforward

---

## Recommendations

### Continue
- Pre-work sanity checks catching ambiguities before dispatch
- Explicit file paths with line numbers in prompts
- Pre-mortem risk references in ACs
- Architecture clarification when tasks touch multiple systems

### Stop
- Vague mitigations in pre-mortem (specify expected values, not just patterns)
- Trusting documentation tasks to auto-verify accuracy

### Start
- "Verify against code" step in documentation ACs
- Owner/user name handling strategy in workspace config (for future features)
- More explicit status value expectations in pre-mortem for state machine features

---

## Deliverables

### Task 1: CalendarEvent Extension
- `organizer?: { name, email?, self? }` and `recurringEventId?: string` fields
- Google Calendar API mapping with optional chaining

### Task 2: Importance Inference
- `Importance` type: skip | light | normal | important
- `inferMeetingImportance()` with priority rules and hasAgenda modifier

### Task 3: Extraction Modes
- `ExtractionMode`: light | normal | thorough
- `buildLightExtractionPrompt()` — 67% shorter, summary + 2 learnings only
- `LIGHT_LIMITS`, `THOROUGH_LIMITS` with mode-based application

### Task 4: Speaking Ratio
- `calculateSpeakingRatio()` — parses `**Name | MM:SS**` format, counts words
- Graceful degradation for missing speaker labels

### Task 5: Auto-Approve & Status
- Light meetings auto-approve all items, get `status: 'approved'`
- Skip meetings return empty result, get `status: 'skipped'`
- `--importance <level>` CLI flag with frontmatter fallback
- Reprocessing detection → thorough mode

### Task 6: Pull Integration
- `findMatchingCalendarEvent()` with 0.3 similarity threshold
- `PullFathomOptions`, `PullKrispOptions` with `calendarEvents` parameter
- Importance written to frontmatter during meeting pull

### Task 7: Documentation
- LEARNINGS.md: Inference rules, extraction modes, calendar matching
- PROFILE.md: calculateSpeakingRatio() in component map
- CLI docs: --importance flag

---

## Files Changed Summary

- `packages/core/src/integrations/calendar/types.ts` (Task 1)
- `packages/core/src/integrations/calendar/google-calendar.ts` (Task 1)
- `packages/core/src/integrations/meetings.ts` (Tasks 2, 6)
- `packages/core/src/services/meeting-extraction.ts` (Task 3)
- `packages/core/src/services/meeting-processing.ts` (Tasks 4, 5)
- `packages/core/src/integrations/fathom/index.ts` (Task 6)
- `packages/core/src/integrations/krisp/index.ts` (Task 6)
- `packages/cli/src/commands/meeting.ts` (Task 5)
- `packages/core/src/integrations/LEARNINGS.md` (Tasks 6, 7)
- `packages/core/src/services/LEARNINGS.md` (Task 7)
- `.pi/expertise/core/PROFILE.md` (Task 7)
- `.agents/sources/shared/cli-commands.md` (Task 7)
