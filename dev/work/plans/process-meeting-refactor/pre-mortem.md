# Pre-Mortem: Meeting Processing Primitives (Phase 1)

## Overview

Refactoring meeting processing from monolithic skill instructions into composable CLI primitives:
- Task 1: `meeting context` (NEW)
- Task 2: `meeting extract` enhancement
- Task 3: `meeting apply` (NEW)
- Task 4: Update skill
- Task 5: Update web app backend

---

### Risk 1: Context Gaps — Parallel Tasks Without Shared Schema

**Problem**: Tasks 1-3 can be built in parallel, but they all need to agree on the context bundle schema. If Task 2 expects a different schema than Task 1 produces, integration will fail.

**Mitigation**:
- Schema is defined in notes.md — reference it in every task prompt
- Add explicit TypeScript interface in first task (Task 1) that others import
- Before spawning Task 2 and 3, verify Task 1's interface exists and is importable
- Task prompt should include: "Import MeetingContextBundle type from meeting-context.ts"

**Verification**: Check that Tasks 2 and 3 prompts reference the shared type. Integration test after all three complete.

---

### Risk 2: Test Pattern Mismatch — New Services Without Test Examples

**Problem**: Creating new core services (meeting-context.ts, meeting-apply.ts) without understanding existing test patterns leads to inconsistent or inadequate tests.

**Mitigation**:
- Before Task 1, read existing test patterns:
  - `packages/core/test/services/meeting-extraction.test.ts`
  - `packages/cli/test/commands/meeting.test.ts`
- Task prompts include: "Follow test patterns from meeting-extraction.test.ts"
- Tests must use existing testDeps/mocking patterns

**Verification**: Review test files for consistent mocking patterns. Tests should mirror structure of existing service tests.

---

### Risk 3: Integration — Breaking Existing `meeting extract` Callers

**Problem**: Task 2 modifies `meeting extract`. Existing callers (web app, skill, CLI users) might break if signature changes or default behavior differs.

**Mitigation**:
- Backward compatibility is explicit AC: "Without --context flag, behaves exactly as before"
- All existing tests must pass before new functionality is added
- Add new tests for context-enhanced behavior, don't modify existing test expectations
- Run full test suite after Task 2, not just new tests

**Verification**: `npm run typecheck && npm test` passes after Task 2 with zero changes to existing test assertions.

---

### Risk 4: Scope Creep — Adding Phase 2 Features

**Problem**: During implementation, it's tempting to add `memory add`, `intelligence synthesize`, or other Phase 2 features "while we're here."

**Mitigation**:
- Explicit out-of-scope list in PRD
- Task prompts include: "Do NOT implement: memory add, intelligence synthesize, arete meeting process convenience command"
- If Phase 2 pattern emerges, document in notes for later, don't implement

**Verification**: Review completed work against out-of-scope list. No new commands beyond context/apply/enhanced-extract.

---

### Risk 5: Web App Integration — Backend Changes Breaking UI

**Problem**: Task 5 changes backend endpoints. Web app frontend expects certain response shapes. If backend changes break the contract, UI fails silently.

**Mitigation**:
- Document current endpoint contract before changing
- Task 5 AC: "Existing web app behavior unchanged from user perspective"
- Test web app end-to-end after Task 5: process a meeting via UI, verify staged sections appear
- Keep same response shape, just change internal implementation

**Verification**: Manual E2E test: open arete view, select meeting, click process, verify extraction works.

---

### Risk 6: Dependency — `brief` Service Being Fixed Elsewhere

**Problem**: Task 1 uses `arete brief --for "<meeting title>"` for related context. The brief service is being fixed in parallel work. If it changes, Task 1 might break or produce different results.

**Mitigation**:
- Task 1 should gracefully handle brief failures (return empty relatedContext, warn)
- Don't deeply depend on brief's internal structure — treat it as opaque context
- If brief changes during execution, update Task 1's integration accordingly

**Verification**: Task 1 tests include case where brief returns empty/error — should not fail, just warn.

---

### Risk 7: Reuse — Reimplementing Existing Logic

**Problem**: `findMatchingAgenda`, `parseAgendaItems`, and other utilities already exist. Risk of reimplementing instead of reusing.

**Mitigation**:
- Before implementing any agenda/attendee logic, grep for existing utilities
- Task 1 prompt: "Reuse findMatchingAgenda from meetings.ts, parseAgendaItems from agenda.ts"
- Review PR for duplicate logic

**Verification**: No new fuzzy matching or agenda parsing code — imports from existing modules only.

---

### Risk 8: State Tracking — Multi-Task Progress Across Sessions

**Problem**: 5 tasks with dependencies. If session breaks mid-execution, unclear where to resume.

**Mitigation**:
- Use prd.json to track task status (pending/done/in-progress)
- After each task completion, update prd.json immediately
- Commit after each task (not just at end)

**Verification**: prd.json reflects accurate state after each task. Git history shows incremental commits.

---

## Summary

| # | Risk | Category | Severity |
|---|------|----------|----------|
| 1 | Parallel tasks without shared schema | Context Gaps | High |
| 2 | New services without test examples | Test Patterns | Medium |
| 3 | Breaking existing extract callers | Integration | High |
| 4 | Adding Phase 2 features | Scope Creep | Medium |
| 5 | Backend changes breaking UI | Integration | Medium |
| 6 | Brief service changing | Dependencies | Low |
| 7 | Reimplementing existing logic | Dependencies | Medium |
| 8 | Multi-task progress tracking | State Tracking | Low |

**Total risks identified**: 8
**Categories covered**: Context Gaps, Test Patterns, Integration, Scope Creep, Dependencies, State Tracking

---

## Mitigations Checklist (For Execution)

- [ ] Task 1 defines shared TypeScript interface first
- [ ] All task prompts reference test patterns from existing files
- [ ] Task 2 runs existing tests before adding new functionality
- [ ] Out-of-scope list reviewed before marking tasks complete
- [ ] Manual E2E test after Task 5
- [ ] Brief failure handling in Task 1
- [ ] Grep for existing utilities before implementing
- [ ] prd.json updated after each task
