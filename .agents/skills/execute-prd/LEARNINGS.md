# Execute-PRD Skill — Learnings

Patterns and gotchas discovered through PRD executions. Read before running execute-prd.

---

## Proven Patterns

### 1. Pre-mortem mitigations in subagent prompts (not just documented)

Don't just document mitigations in the pre-mortem — embed them directly in each subagent's task prompt under "Pre-Mortem Mitigations Applied". Subagents have fresh context and won't see the orchestrator's pre-mortem analysis unless you include it.

**Evidence**: calendar-events PRD (2026-02-25) — 0/9 risks materialized when mitigations were embedded in prompts.

### 2. Testing integrated with implementation tasks

Structure PRD tasks so tests are delivered WITH implementation, not as a separate "Tests" task at the end. This means:
- Task 1: Implement feature A + tests for A
- Task 2: Implement feature B + tests for B
- Task N: Verify test coverage (just verification, not writing new tests)

**Evidence**: calendar-events PRD — Tasks 1 and 2 delivered 57 tests; Task 5 was just verification.

### 3. Extract shared utilities proactively

When pre-mortem identifies potential code duplication (e.g., "Task 2 might reimplement helper from Task 1"), add explicit mitigation: "Extract to shared location BEFORE Task 2 starts" or "Task 2 must import from Task 1's location."

**Anti-pattern**: Flagging duplication in code review but allowing it to merge, then filing a refactor item. Better to prevent during implementation.

---

## Gaps to Address

### 1. Skill routing verification in build repo

Runtime skills (packages/runtime/skills/) deploy to user workspaces via `arete install/update`. There's no easy way to verify skill triggers work before deploy when working in the build repo.

**Workaround**: Manually verify frontmatter triggers match expected phrases. Consider adding a dev-time validation script.

### 2. Shared formatter extraction timing

When two tasks will need the same formatter/helper, the PRD should either:
- Add a Task 0 to create the shared utility first, OR
- Explicitly state in Task 2: "Import formatX from Task 1's file; do not reimplement"

---

## Execution Metrics (for calibration)

| PRD | Tasks | Success Rate | Iterations | Tests Added | Pre-Mortem Effectiveness |
|-----|-------|--------------|------------|-------------|--------------------------|
| calendar-events (2026-02-25) | 5/5 | 100% | 0 | +57 | 9/9 mitigated |
| calendar-freebusy (2026-02-25) | 6/6 | 100% | 1 | +59 | 7/7 mitigated |
| project-updates (2026-02-25) | 6/6 | 100% | 0 | +9 | 7/7 mitigated |

---

## References

- Memory entries: `memory/entries/2026-02-25_calendar-events-learnings.md`
- Collaboration profile: `memory/collaboration.md`
