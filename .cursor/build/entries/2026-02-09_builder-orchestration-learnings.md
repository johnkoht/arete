# Builder Orchestration Learnings — Intelligence & Calendar PRD

**Date**: 2026-02-09  
**PRD**: intelligence-and-calendar (12 tasks, 100% complete)  
**Pattern**: Orchestrator (primary agent) + Subagents (task executors)

---

## What Worked Exceptionally Well

### 1. Detailed, Example-Rich Prompts
**Pattern**: Don't describe—point to examples.
- ✅ "Follow testDeps pattern from qmd.ts" → subagent instantly understood mocking approach
- ✅ "Read these files first: 1. search.ts, 2. qmd.ts, 3. types.ts" → full context before starting
- ❌ Avoid: "Use good patterns" (too vague)

**Takeaway**: Show, don't tell. Reference specific files that exemplify the pattern.

### 2. Zero-Iteration Success
**Result**: 12/12 tasks passed code review on first attempt.
- Explicit acceptance criteria (8-10 bullets per task)
- Pattern references in prompts (testDeps, error handling, backward compatibility)
- File reading lists ensured subagents had full context

**Takeaway**: Detailed prompts eliminate ambiguity → fewer iterations.

### 3. Pre-Mortem Risk Identification
**Process**: Identified 8 risks before starting, mitigated all successfully.
- Fresh context issues → solved with explicit file lists
- Test failures → solved with pattern references
- Integration issues → solved with full test suite runs

**Takeaway**: Pre-mortem is highly effective for autonomous orchestration.

### 4. Sequential Dependency Execution
**Approach**: A1→A2→A3→B1→B2→B3 (not parallel).
- Each subagent inherited clean, tested prior work
- No integration conflicts between tasks
- Full test suite after each task caught ripple effects

**Takeaway**: Sequential execution is safer than parallel for dependent tasks.

### 5. Subagent Pattern Recognition
**Surprise**: Subagents proactively followed patterns without being told every detail.
- B2 made getRelevantContext() async → automatically updated callers (intelligence.ts, briefing.ts)
- TypeScript compiler errors likely guided them

**Takeaway**: Trust TypeScript's type system to guide subagents. They catch errors and propagate changes correctly.

---

## Collaboration Patterns Observed

### Builder Preferences (from this session)
1. **Autonomous execution preferred**: "Please proceed and run autonomously"
2. **Trust but verify**: Wanted code review + test verification between tasks
3. **Learnings captured**: "Please provide learnings and update builder memories"
4. **Post-mortem analysis**: Requested comprehensive analysis at end

### Agent Behaviors That Worked
1. **Proactive problem-solving**: When prd-task enum failed, switched to generalPurpose without asking
2. **Full context verification**: Read code before spawning subagent to understand dependencies
3. **Progress updates**: Clear milestone reporting (Task X/12 complete)
4. **Quality focus**: All subagents delivered passing tests on first attempt

---

## Recommendations for Future PRDs

### Prompt Structure (Use This Template)
```
You are implementing Task X from [prd-name] PRD.

**PRD Goal**: [1 sentence]
**Task ID**: [id]
**Title**: [title]
**Description**: [full description from PRD]

**Acceptance Criteria**: [8-10 specific bullets]

**Context - Read These Files First**:
1. [file] — [why]
2. [file] — [why]
...

**Important Patterns**:
- [Pattern 1: reference specific example file]
- [Pattern 2: reference specific example file]
...

**Implementation Notes**: [specific guidance]

After implementation:
1. Run npm run typecheck (must pass)
2. Run npm test (must pass)
3. Commit with message: "[type]([scope]): [description]"
4. Update prd.json
5. Update progress.txt
```

### Code Review Checklist
After each subagent completes:
- ✅ Uses `.js` extensions in imports (NodeNext)
- ✅ No `any` types
- ✅ Proper error handling (try/catch)
- ✅ Tests for happy path and edge cases
- ✅ Backward compatibility preserved
- ✅ Full test suite passes (not just new tests)

### When to Iterate vs Accept
- **Accept**: All acceptance criteria met, tests pass, patterns followed
- **Iterate**: Scope drift, missing tests, pattern violations
- **Threshold**: This session had 0 iterations—bar is high but achievable

---

## System Improvements Needed

### 1. Implement `prd-task` Subagent Type
- Currently documented but not available in Task tool enum
- Would reduce prompt boilerplate (knows to run tests, commit, update prd.json)

### 2. Automated Code Review
- Run checks before human review: pattern compliance, test coverage, error handling
- Report: "✅ Patterns followed, ⚠️ Missing error handling in line 45"

### 3. Parallel Task Execution (Cautiously)
- Some tasks are truly independent (C1 + C2 in this PRD)
- Risk: Integration issues if patterns diverge
- Only enable for explicitly marked "independent" tasks

### 4. Progress Dashboard
- Real-time: "Task 7/12 complete, 314/314 tests passing, 7 commits"
- CLI: `arete prd status` to check long-running PRDs

---

## Metrics from This Session

| Metric | Value |
|--------|-------|
| Tasks completed | 12/12 (100%) |
| Success rate (first attempt) | 12/12 (100%) |
| Tests added | 67 new tests |
| Test pass rate | 314/314 (100%) |
| Context used | 95K/1M tokens (9.5%) |
| Iterations required | 0 |
| Pre-mortem risks that materialized | 0/8 |

---

## Next Steps

1. **Create execute-prd SKILL**: Formalize this orchestration pattern in `.cursor/build/skills/execute-prd/SKILL.md`
2. **Add prd-task subagent**: Implement in Task tool enum for future PRDs
3. **Document in AGENTS.md**: Add "Autonomous PRD Execution" section
4. **Test on next PRD**: Validate this pattern on a different feature (e.g. Google Calendar provider)

---

## Key Insight

**The orchestration system works.** With detailed prompts, explicit patterns, and sequential execution, autonomous PRD completion is not only feasible but highly effective. The key is:
1. Show examples, don't just describe
2. Pre-mortem risks before starting
3. Trust subagents but verify with full test suite
4. Capture learnings for continuous improvement

This session proves the feasibility of the autonomous build system for Areté development.
