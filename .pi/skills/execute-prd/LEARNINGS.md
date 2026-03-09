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

### 4. Phantom task detection before execution

Before starting a PRD, verify proposed files don't already exist and functionality isn't already implemented. This catches "phantom tasks" — work the PRD requests that has already been done (perhaps by prior work, or the PRD is stale).

**Evidence**: reimagine-v2-orchestration PRD (2026-03-07) — Engineering review found 5/6 tasks were phantom (already implemented). This check saved ~80% of planned work.

### 5. Backwards compatibility for data-writing code

When fixing bugs in data-writing code, always ask: "What about existing data created by the old buggy code?" Users with legacy data formats shouldn't be stranded.

**Evidence**: reimagine-v2-orchestration PRD (2026-03-07) — Priority toggle fix initially only handled new format (`- [x]`). Grumpy reviewer caught that old format (standalone `[x]`) would strand users. Fix needed dual-format support.

### 6. Extract constants for repeated structures

If you use the same config object, schema, or data structure more than once, extract it to a named constant. Catch DRY violations during implementation, not in code review.

**Evidence**: ai-config PRD (2026-03-08) — Task AI-4 had duplicate `aiConfig` objects caught in review. Could have been prevented with upfront guidance.

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
| reimagine-v2 (2026-03-07) | 1/6* | 100% | 1 | n/a | 9/9 mitigated |
| ai-config (2026-03-08) | 5/5 | 100% | 3 | +75 | 8/8 mitigated |

*5/6 tasks were phantom (already implemented); only 1 task required actual work

---

## References

- Memory entries: `memory/entries/2026-02-25_calendar-events-learnings.md`
- Collaboration profile: `memory/collaboration.md`
