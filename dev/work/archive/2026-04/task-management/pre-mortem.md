# Pre-Mortem: Task Management System

## Risk 1: Large Scope Overwhelm (14 Steps)

**Problem**: 14 steps across 4 phases is substantial. Tasks may have hidden dependencies, and the system may become inconsistent if phases are partially complete. Phase 3 pulls external code (arete-reserv) that may have incompatible patterns.

**Mitigation**: 
- Execute phases sequentially with verification gates between phases
- After Phase 1, verify TaskService works end-to-end before Phase 2
- After Phase 2, verify planning skills use new TaskService before Phase 3
- Keep arete-reserv pull isolated; refactor to use new patterns after copy

**Verification**: Full test suite passes after each phase. No cross-phase regressions.

---

## Risk 2: Week.md Backward Compatibility Breaking

**Problem**: Step 2 changes week.md structure (adds Inbox, Waiting On, renames Outcomes→Weekly Priorities). Existing week.md files in workspaces may break existing flows.

**Mitigation**:
- Read existing week.md before changing structure
- Use section detection (both `## Outcomes` and `## Weekly Priorities` should work)
- Don't require all sections—create on first use
- Add migration logic in `arete update` for existing workspaces

**Verification**: Test with real week.md from arete-reserv. Existing content preserved after update.

---

## Risk 3: Commitment-Task Linkage Complexity

**Problem**: Step 4 creates bidirectional links between commitments and tasks. Completing a task auto-resolves the linked commitment. Race conditions, orphaned links, or silent failures could corrupt both systems.

**Mitigation**:
- Use transactional pattern: create both or neither
- Task stores `@from(commitment:id)`, commitment stores linked task path
- `completeTask()` → `CommitmentsService.resolve()` in single transaction
- Add rollback on failure
- Unit tests for: create-with-task, complete-resolves, orphan detection

**Verification**: Test case: create commitment+task, complete task, verify commitment resolved. Test case: interrupt mid-create, verify clean state.

---

## Risk 4: External Code Pull (arete-reserv) Incompatibility

**Problem**: Steps 9-10 pull daily-winddown and weekly-winddown from arete-reserv. These may reference workspace-specific paths, Notion APIs, Krisp-specific patterns, or incompatible file structures.

**Mitigation**:
- Before pull, read arete-reserv skills to identify all external references
- Create checklist: Notion refs to remove, workspace-specific paths to generalize
- Pull as-is first, then systematic refactor
- Don't mix new TaskService usage with pull—refactor after copy works

**Verification**: Grep for `arete notion`, `Krisp`, workspace-specific paths in pulled skills. All removed/generalized before merge.

---

## Risk 5: Task Scoring Algorithm Fragility

**Problem**: Step 7 introduces scoring algorithm (due date, commitment weight, meeting relevance, relationship health). Complex scoring logic is hard to test and may produce unexpected rankings.

**Mitigation**:
- Define scoring as pure functions with clear inputs/outputs
- Test each scoring dimension independently
- Add test cases for edge cases: no due date, no commitments, no meetings
- Show scoring breakdown in UI (Architect/Preparer requirement already in plan)

**Verification**: Unit tests for each scoring dimension. Integration test with realistic task set produces sensible ordering.

---

## Risk 6: Review UI File-Based Signal Fragility

**Problem**: Steps 12-13 use file-based signals (`.arete/.review-session-*`, `.arete/.review-complete-*`) for CLI↔web coordination. Race conditions, stale files, or permission issues could cause hangs or data loss.

**Mitigation**:
- Session ID includes timestamp to avoid collisions
- CLI polls with timeout (300s default, configurable)
- On timeout, return `{ timedOut: true }` instead of hanging
- Delete session files after read (cleanup)
- Handle file permission errors gracefully

**Verification**: Test: create session, complete, verify CLI returns. Test: timeout scenario. Test: cleanup after use.

---

## Risk 7: Metadata Parsing Ambiguity

**Problem**: Task format uses `@tag(value)` metadata. Parser may fail on edge cases: nested parens `@area(work (main))`, multiple values `@person(john) @person(jane)`, malformed input.

**Mitigation**:
- Define clear grammar: `@tag(value)` where value is alphanumeric + hyphens only (no parens)
- For multiple values, use comma: `@person(john,jane)` or multiple tags
- Return unparsed remainder for human review if ambiguous
- Add test cases for all edge cases

**Verification**: Unit tests for edge cases in metadata parsing. Malformed input handled gracefully.

---

## Risk 8: Inbox Processing Inference Accuracy

**Problem**: Step 8 infers area/project/person from plain text inbox items. Wrong inference could place tasks in wrong contexts or annoy users with constant corrections.

**Mitigation**:
- Use confidence thresholds: high confidence (>0.8) → auto-place; low confidence → leave in inbox
- Show inference reasoning for transparency
- Provide easy "move to X" correction in triage
- Harvester path: skip triage entirely if configured

**Verification**: Test with sample inbox items. High-confidence items placed correctly. Low-confidence items stay in inbox.

---

## Summary

| # | Risk | Severity | Phase |
|---|------|----------|-------|
| 1 | Large Scope Overwhelm | MEDIUM | All |
| 2 | Week.md Backward Compatibility | HIGH | 1 |
| 3 | Commitment-Task Linkage | HIGH | 1 |
| 4 | External Code Pull | MEDIUM | 3 |
| 5 | Task Scoring Fragility | MEDIUM | 2 |
| 6 | File-Based Signal Fragility | MEDIUM | 4 |
| 7 | Metadata Parsing Ambiguity | LOW | 1 |
| 8 | Inbox Processing Inference | LOW | 2 |

**Total risks identified: 8**
**Categories covered**: Scope, Backward Compatibility, Integration, External Dependencies, State Management, Platform Issues
