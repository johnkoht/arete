# Test Prompt: Execute PRD with Orchestration System

Use this prompt with a fresh agent to test the execute-prd skill on a small PRD.

---

## Prompt to Give Agent

```
I want to execute a PRD using the new orchestration system we built.

**Context**:
- We just completed the intelligence-and-calendar PRD with 100% success (12/12 tasks, 0 iterations)
- We created a formalized orchestration process: execute-prd skill with mandatory pre-mortem
- This will be the first test of that new system

**Your task**:
1. Read .cursor/build/skills/execute-prd/SKILL.md (the execution workflow)
2. Read .cursor/build/QUICK-START-ORCHESTRATION.md (quick reference)
3. Read .cursor/build/entries/2026-02-09_builder-orchestration-learnings.md (what worked last time)
4. Find the next PRD to execute (check .cursor/build/prds/ for candidates)
5. Follow the execute-prd workflow:
   - Phase 0: Understand the PRD and dependencies
   - Phase 1: Conduct mandatory pre-mortem (present to me for approval before proceeding)
   - Phase 2: Execute tasks with orchestrator + subagent pattern
   - Phase 3: Deliver post-mortem analysis

**Important**:
- The pre-mortem is MANDATORY - don't skip it
- Present the pre-mortem to me and wait for approval
- Use the 8 risk categories from the template
- Apply mitigations from last session where relevant

**Success criteria**:
- Pre-mortem identifies 5-8 risks with concrete mitigations
- All tasks pass first attempt (or minimal iterations with specific feedback)
- Full test suite passes after each task
- Post-mortem compares predictions vs reality
- Learnings captured in build memory

Let's start. Show me what PRD you found and begin Phase 0.
```

---

## Alternative: Test on a Small Custom PRD

If you want to create a small test PRD first:

```
I want to test the execute-prd skill on a small PRD before using it on something complex.

Create a simple 2-3 task PRD for testing the orchestration system. Something like:
- Task 1: Add a simple utility function to src/core/
- Task 2: Add tests for that function
- Task 3: Update documentation

Then execute it using .cursor/build/skills/execute-prd/SKILL.md with:
- Mandatory pre-mortem (even though it's simple - this is a test)
- Full orchestration workflow
- Post-mortem analysis

The goal is to validate the process, not deliver complex functionality.
```

---

## What to Look For

1. **Pre-mortem quality**: Are risks specific and actionable?
2. **Mitigation application**: Does agent reference mitigations in subagent prompts?
3. **Code review rigor**: Does agent use the 6-point checklist?
4. **Test verification**: Does agent run full test suite (not just new tests)?
5. **Post-mortem insight**: Does agent compare pre-mortem predictions to reality?

---

## Expected Timeline

- **Small PRD (2-3 tasks)**: 30-45 minutes
- **Medium PRD (5-7 tasks)**: 1-2 hours
- **Large PRD (10+ tasks)**: 2-4 hours

The intelligence-and-calendar PRD (12 tasks) took ~2 hours with this system.
