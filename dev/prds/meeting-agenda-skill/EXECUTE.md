# Execute Meeting Agenda Skill PRD

## Handoff Instructions

Copy and paste the following prompt into a **new Cursor conversation** to begin autonomous execution.

---

## Prompt for New Agent

```
I need you to execute the Meeting Agenda Skill PRD using the autonomous agent loop system.

**Context:**
- PRD location: dev/prds/meeting-agenda-skill/prd.md
- Task manifest: dev/autonomous/prd.json
- Branch: feature/meeting-agenda-skill
- Pre-mortem: Section 6 in PRD (run pre-mortem at start of Phase 1, then apply mitigations during execution)

**Your role:**
You are the orchestrator. You will:
1. Read the PRD and prd.json to understand all 9 tasks
2. Map task dependencies: Group A (A1→A2→A3) → Group B (B1, B2 depend on A1) → Group C (C1, C2 depend on A+B) → Group D (D1 depends on all)
3. Run the mandatory pre-mortem (Phase 1) using risks in PRD §6; present mitigations to the user and get approval
4. For each task, craft a detailed prompt with:
   - "Read these files first: ..." (specific files and line ranges)
   - "Follow the pattern from..." (show, don't tell)
   - Acceptance criteria from the PRD
   - Pre-mortem mitigations
5. Spawn a Task subagent (generalPurpose type) for each task
6. After each task completes:
   - Review code (6-point checklist: .js imports, no any, error handling, tests, backward compat, patterns)
   - Run npm run typecheck (must pass)
   - Run npm test (full suite, must pass)
   - Run file-deletion check: git diff HEAD --name-status | grep '^D'
7. Mark task complete in prd.json, write commit SHA to progress.txt
8. Proceed to next task

**Important execution notes:**
- Sequential execution: A1 → A2 → A3 → B1 → B2 → C1 → C2 → D1
- Full test suite after EVERY task (not just new tests)
- Apply pre-mortem mitigations proactively (PRD §6)
- Explicit autonomy: you do not need to ask permission to write files, commit, or update prd.json/progress.txt
- Show, don't tell: every subagent prompt must reference specific example files with line ranges
- Template loader (A1) must resolve runtime path for shipped templates; see how other runtime paths are resolved (e.g. workspace-structure, skills copy source)

**Key files to understand before starting:**
- dev/prds/meeting-agenda-skill/prd.md (full PRD with requirements and pre-mortem)
- dev/autonomous/prd.json (task manifest)
- .agents/skills/execute-prd/SKILL.md (orchestration workflow)
- dev/agents/prd-task.md (subagent instructions)
- src/core/workspace-structure.ts (BASE_WORKSPACE_DIRS pattern for A3)
- runtime/skills/meeting-prep/SKILL.md (skill structure for C1)
- test/core/skill-router.test.ts (routing tests for C2)

**Success criteria:**
- All 9 tasks complete
- npm run typecheck passes
- npm test passes
- arete template list meeting-agendas and arete template view meeting-agenda --type leadership work
- prepare-meeting-agenda skill exists and is routed for "create meeting agenda"
- AGENTS.md updated with meeting agenda skill and template system

Please begin by reading the PRD and prd.json, then run the pre-mortem and start task execution.
```

---

## Notes

- **Branch**: Create `feature/meeting-agenda-skill` before execution (or have orchestrator create it in Phase 2).
- **prd.json**: Already populated at `dev/autonomous/prd.json` for this feature. If a previous PRD was in use, backup or replace with the meeting-agenda-skill prd.json.
- **Resume**: If execution pauses, check `dev/autonomous/prd.json` for last completed task and `dev/autonomous/progress.txt` for commit history; start a new conversation with: "Resume execution of meeting-agenda-skill PRD starting from task [id]."
