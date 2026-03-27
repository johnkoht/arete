# Execute Multi-IDE Support PRD

## Handoff Instructions

Copy and paste the following prompt into a **new Cursor conversation** to begin autonomous execution:

---

## Prompt for New Agent

```
I need you to execute the Multi-IDE Support PRD using the autonomous agent loop system.

**Context:**
- PRD location: dev/prds/multi-ide-support/prd.md
- Task manifest: dev/autonomous/prd.json
- Branch: feature/multi-ide-support
- Pre-mortem: Already completed (included in PRD)

**Your role:**
You are the orchestrator. You will:
1. Read the PRD and prd.json to understand all 20 tasks
2. Map task dependencies (Phase 1 → Phase 2 → Phase 3 → Phase 4)
3. For each task, craft a detailed prompt with:
   - "Read these files first: ..." (specific files and line ranges)
   - "Follow the pattern from..." (show, don't tell)
   - Acceptance criteria from the PRD
   - Pre-mortem mitigations
4. Spawn a Task subagent (generalPurpose type) for each task
5. After each task completes:
   - Review code (6-point checklist: .js imports, no any, error handling, tests, backward compat, patterns)
   - Run npm run typecheck (must pass)
   - Run npm test (full suite, must pass)
   - Run grep -r '\.cursor' src/ (check for leaked paths)
6. Mark task complete in prd.json, write commit SHA to progress.txt
7. Proceed to next task

**Important execution notes:**
- Do NOT re-run the pre-mortem (already done in PRD)
- Sequential execution: Phase 1 → Phase 2 → Phase 3 → Phase 4 (tasks within phases can overlap if no dependencies)
- Full test suite after EVERY task (not just new tests)
- Apply pre-mortem mitigations proactively (listed in PRD section 6)
- Explicit autonomy: you do not need to ask permission to write files, commit, or proceed
- Show, don't tell: every prompt must reference specific example files with line ranges

**Key files to understand before starting:**
- dev/prds/multi-ide-support/prd.md (full PRD with all requirements)
- dev/autonomous/prd.json (task manifest)
- dev/autonomous/schema.ts (task schema)
- .agents/skills/execute-prd/SKILL.md (orchestration workflow)
- dev/agents/prd-task.md (subagent instructions)

**Success criteria:**
- All 20 tasks complete
- npm run typecheck passes
- npm test passes (314+ tests)
- Cursor install produces identical output to current behavior (no regression)
- Claude install produces .claude/CLAUDE.md with routing workflow
- No raw .cursor strings in shared code (only in adapters)

Please begin by reading the PRD and prd.json, then start task execution.
```

---

## Notes

- The orchestrator will handle all task execution, code review, testing, and commits
- Expected context usage: ~10-15% of 1M token budget (based on intelligence-and-calendar PRD)
- Estimated completion: 20 tasks, sequential phases, ~2-4 hours of agent time
- First release scope: Phases 1-5 + 7 only (Phase 6 Builder mode deferred)

## If Execution Pauses

To resume from where it left off:
1. Check `dev/autonomous/prd.json` for last completed task
2. Check `dev/autonomous/progress.txt` for commit history
3. Start a new conversation with: "Resume execution of multi-ide-support PRD starting from task X"
