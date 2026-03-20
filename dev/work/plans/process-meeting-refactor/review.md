# Engineering Lead Review: Meeting Processing Primitives (Phase 1)

## Review Summary

**Overall Status**: APPROVED with recommendations

Two parallel reviews conducted:
1. Core/CLI Implementation Review
2. Web App/Integration Review

---

## Core/CLI Review Findings

### Technical Feasibility: ✅ APPROVED

**Findings:**
- Existing `meeting.ts` already has `add`, `process`, `extract`, `approve` subcommands
- New commands (`context`, `apply`) follow established patterns
- `meeting-extraction.ts` has clean separation: `buildMeetingExtractionPrompt`, `extractMeetingIntelligence`, `parseMeetingExtractionResponse`
- `findMatchingAgenda` in `meetings.ts` already exists for agenda lookup
- `parseAgendaItems`, `getUncheckedAgendaItems` in `agenda.ts` ready to use

**Recommendations:**
1. **Task 1**: Create `packages/core/src/services/meeting-context.ts` following pattern from `meeting-extraction.ts`
2. **Task 2**: Add optional `context?: MeetingContextBundle` parameter to `buildMeetingExtractionPrompt`
3. **Task 3**: Create `packages/core/src/services/meeting-apply.ts` for staging logic

### Test Patterns: ✅ ADEQUATE

**Findings:**
- `packages/core/test/services/meeting-extraction.test.ts` provides patterns for LLM-based services
- Uses `parseMeetingExtractionResponse` for testable parsing
- CLI tests in `packages/cli/test/commands/` use Commander testing patterns

**Recommendations:**
1. Unit test the context assembly (mocking `people show`, `brief`)
2. Unit test apply logic (file writing, frontmatter updates)
3. Integration test full pipeline with mock meeting file

### Schema Completeness: ✅ COMPLETE

**Findings:**
- `MeetingContextBundle` schema covers all required fields
- `unknownAttendees` array handles missing person files
- `warnings` array captures diagnostics
- `relatedContext` structure aligns with brief output

**Gap Identified:**
- Schema should include `AgendaItem` type definition (from `agenda.ts`)

### Backward Compatibility: ✅ VERIFIED

**Findings:**
- `meeting extract` currently accepts: `<file>`, `--stage`, `--json`, `--skip-confidence`, `--owner-slug`
- Adding `--context` as optional flag won't break existing callers
- Default behavior (no `--context`) uses current logic

**Recommendation:**
- Add explicit test: "extract without --context produces same output as before"

---

## Web App/Integration Review Findings

### Backend Integration: ⚠️ CONCERNS

**Current State:**
- `runProcessingSession` in `agent.ts` calls core functions directly (in-process)
- Uses `extractMeetingIntelligence` → `processMeetingExtraction` → `formatFilteredStagedSections`

**Concern:**
Task 5 proposes shelling out to CLI (`arete meeting context | arete meeting extract | arete meeting apply`). This is different from current in-process calls.

**Options:**
1. **Shell to CLI** (as proposed): Simple, primitives work the same everywhere
2. **Use core services directly**: Keep backend calling core, CLI also calls core

**Recommendation:**
Backend should import and call core services directly, not shell to CLI. This:
- Avoids process spawning overhead
- Provides better error handling
- Keeps response shapes consistent
- CLI and backend both use same core services

**Update Task 5 AC:**
- Backend imports `buildMeetingContext`, `extractMeetingIntelligence`, `applyMeetingIntelligence` from core
- Does NOT shell to CLI commands

### Response Shape Compatibility: ✅ OK with above change

**Findings:**
- Current `runProcessingSession` writes to job events and returns void
- Frontend polls job status and reads meeting file
- No direct response shape dependency

**If using core services directly:**
- Response shapes stay internal to backend
- Meeting file format is the contract (unchanged)

### Error Handling: ✅ ADDRESSED

**Current:**
- Errors caught, logged to job events, job marked as error

**With primitives:**
- Core services throw, backend catches and logs
- Same pattern works

### clearApproved Behavior: ✅ VERIFIED

**Current:**
- `clearApprovedSections(content)` called when `options.clearApproved` is true
- Removes `## Approved Action Items` etc from content

**Recommendation:**
- Keep `clearApprovedSections` in core
- `meeting apply` can accept `--clear` flag that calls this before writing

---

## Synthesized Recommendations

### Must Address Before Build:

1. **Task 5 Approach Change**: Backend should import core services, NOT shell to CLI
   - Update AC: "Backend imports context/extract/apply services from @arete/core"
   - This aligns with current architecture

2. **Add AgendaItem type to schema**: Include the type definition from `agenda.ts`

### Should Address:

3. **Explicit backward compatibility test** for Task 2

4. **Document core service exports**: Ensure `meeting-context.ts` and `meeting-apply.ts` are exported from `@arete/core`

### Nice to Have:

5. **Consider `--clear` flag** on `meeting apply` for reprocessing use case

---

## Final Status

| Aspect | Status |
|--------|--------|
| Technical Feasibility | ✅ Approved |
| Test Patterns | ✅ Approved |
| Schema | ✅ Approved (minor addition) |
| Backward Compatibility | ✅ Approved |
| Web Integration | ⚠️ Approved with change (use core not CLI) |

**Proceed to PRD with Task 5 updated to use core services directly.**
