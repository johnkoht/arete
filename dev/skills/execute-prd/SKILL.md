---
name: execute-prd
description: Autonomous PRD execution with orchestrator + subagent pattern. Includes pre-mortem, task delegation, code review, and post-mortem analysis.
category: build
work_type: development
primitives: []
requires_briefing: false
---

# Execute PRD Skill

Autonomously execute a PRD by spawning subagents for each task, reviewing their work, and ensuring quality. Includes mandatory pre-mortem to identify and mitigate risks before starting.

## When to Use

- User says: "Execute this PRD" or "Build everything in prd.json"
- Multi-task PRD with dependencies (3+ tasks)
- Want autonomous execution with quality review

## Prerequisites

- PRD exists at `dev/prds/{feature-name}/prd.md`
- Task breakdown exists in `dev/autonomous/prd.json`
- Working branch created: `feature/{feature-name}`

## Workflow

### Phase 0: Understand the PRD

1. **Read the PRD**
   - Read `dev/prds/{feature-name}/prd.md`
   - Read `dev/autonomous/prd.json` (task breakdown)
   - Understand dependencies between tasks (A1→A2→A3→B1...)

2. **Identify Completed Work**
   - Check prd.json for tasks with `status: "complete"`
   - Read progress.txt to understand what's been done
   - Identify next pending task in dependency order

### Phase 1: Pre-Mortem (MANDATORY)

**Purpose**: Identify risks before starting, create actionable mitigations.

3. **Identify Risks**
   
   Consider these common risk categories:
   
   | Risk Category | Question to Ask | Example |
   |--------------|----------------|---------|
   | **Context Gaps** | Will subagents have enough context? | "B1 needs to know about SearchProvider from A1-A3" |
   | **Test Patterns** | Do we have test patterns to follow? | "Need to reference testDeps pattern from qmd.ts" |
   | **Integration** | How will tasks integrate? | "B2 async change might break callers" |
   | **Scope Creep** | How to prevent over-implementation? | "Strict acceptance criteria adherence" |
   | **Code Quality** | What patterns must be followed? | ".js imports, no any, error handling" |
   | **Dependencies** | Are dependencies clear? | "Can't do B1 until A3 is done" |
   | **Platform Issues** | Any platform-specific risks? | "ical-buddy might not be installed" |
   | **State Tracking** | How to track progress? | "Update prd.json after each task" |

4. **Document Mitigations**
   
   For each risk, create concrete mitigation:
   
   ```markdown
   ### Risk: [Name]
   **Problem**: [What could go wrong]
   **Mitigation**: [Specific action to prevent it]
   **Verification**: [How to check mitigation was applied]
   ```

5. **Share Pre-Mortem with User**
   
   Present risks + mitigations table. Ask:
   - "Do you see any other risks?"
   - "Are these mitigations sufficient?"
   - Wait for approval before proceeding

### Phase 2: Task Execution Loop

For each pending task (in dependency order):

6. **Prepare Context**
   
   - **Read prior completed tasks**: Check what's been built (files, patterns, tests)
   - **Identify files to reference**: List specific files subagent should read first
   - **Check mitigations**: Review pre-mortem - which mitigations apply to this task?

7. **Craft Subagent Prompt**
   
   Use this template:
   
   ```markdown
   You are implementing Task [ID] from [prd-name] PRD.
   
   **PRD Goal**: [1 sentence from PRD]
   **Task ID**: [id]
   **Title**: [title]
   **Description**: [full description from prd.json]
   
   **Acceptance Criteria**:
   - [bullet 1]
   - [bullet 2]
   - ...
   
   **Context - Read These Files First**:
   1. [file] — [why it's relevant]
   2. [file] — [why it's relevant]
   ...
   
   **Important Patterns**:
   - [Pattern 1]: Reference [specific file that shows this pattern]
   - [Pattern 2]: Reference [specific file that shows this pattern]
   ...
   
   **Pre-Mortem Mitigations Applied**:
   - [Mitigation 1 from pre-mortem]
   - [Mitigation 2 from pre-mortem]
   
   **Implementation Notes**: [specific guidance]
   
   After implementation:
   1. Run npm run typecheck (must pass)
   2. Run npm test (must pass)
   3. Commit with message: "[type]([scope]): [description]"
   4. Update dev/autonomous/prd.json
   5. Update dev/autonomous/progress.txt
   
   Proceed with implementation.
   ```
   
   **Key principles**:
   - ✅ Show examples, don't just describe ("Follow testDeps pattern from qmd.ts")
   - ✅ List files to read first (prevents assumptions)
   - ✅ Reference pre-mortem mitigations explicitly
   - ❌ Don't say "use good patterns" (too vague)

8. **Spawn Subagent**
   
   ```
   Task tool with subagent_type: generalPurpose
   description: [3-5 word summary]
   prompt: [crafted prompt from step 7]
   ```
   
   Wait for subagent to complete and return results.

9. **Code Review**
   
   After subagent completes, verify:
   
   **Quality Checklist**:
   - [ ] Uses `.js` extensions in imports (NodeNext module resolution)
   - [ ] No `any` types (strict TypeScript)
   - [ ] Proper error handling (try/catch with graceful fallback)
   - [ ] Tests for happy path and edge cases
   - [ ] Backward compatibility preserved (function signatures unchanged)
   - [ ] Follows project patterns (see dev.mdc)
   
   **Read changed files**: Check implementation matches acceptance criteria.

10. **Verify Tests**
    
    Run full test suite (not just new tests):
    
    ```bash
    npm run typecheck  # Must pass
    npm test           # Must pass, all tests
    ```
    
    If tests fail:
    - **Integration issue**: Full suite catches ripple effects (e.g. async changes)
    - **Resume subagent**: Provide specific feedback, ask to fix
    - **Repeat review**: After fix, verify again

11. **Accept or Iterate**
    
    **Accept if**:
    - ✅ All acceptance criteria met
    - ✅ Quality checklist passed
    - ✅ All tests passing (including existing tests)
    - ✅ Pre-mortem mitigations applied
    
    **Iterate if**:
    - ❌ Scope drift (implemented more than asked)
    - ❌ Missing tests or edge cases
    - ❌ Pattern violations (any types, missing .js, etc.)
    - ❌ Tests failing
    
    **Resume subagent** with specific feedback. Repeat from step 9.

12. **Update Tracking**
    
    Once accepted:
    - Mark task complete in prd.json (`status: "complete"`)
    - Verify commitSha is recorded
    - Check: `completedTasks` count matches complete status count

13. **Progress Update (Every 3 Tasks)**
    
    Report to user:
    - "Task X/Y complete: [title]"
    - "Next: [next task title]"
    - "Tests: Z/Z passing"

### Phase 3: Post-Mortem (After All Tasks)

14. **Analyze Pre-Mortem Effectiveness**
    
    For each risk identified in pre-mortem:
    - Did it materialize? (Yes/No)
    - Was mitigation applied? (Yes/No)
    - Was mitigation effective? (Yes/No/Partial)
    
    Example table:
    
    | Risk | Materialized? | Mitigation Applied? | Effective? |
    |------|--------------|---------------------|-----------|
    | Fresh context | No | Yes (file lists) | Yes |
    | Test patterns | No | Yes (testDeps ref) | Yes |
    
15. **Identify Surprises**
    
    What happened that wasn't in the pre-mortem?
    - **Positive surprises**: What went better than expected?
    - **Negative surprises**: What issues arose that weren't anticipated?

16. **Extract Learnings**
    
    Synthesize:
    - **What worked well**: Patterns to repeat
    - **What didn't work**: Patterns to avoid
    - **Collaboration patterns**: How did builder respond? What did they prefer?
    - **System improvements**: What would make next PRD execution smoother?

17. **Update Builder Memory**
    
    Create entry: `dev/entries/YYYY-MM-DD_[prd-name]-learnings.md`
    
    Include:
    - Pre-mortem analysis (risks, mitigations, effectiveness)
    - What worked / what didn't
    - Collaboration patterns observed
    - Recommendations for future PRDs
    - Metrics (tasks completed, success rate, iterations, context used)
    
    Add line to `dev/MEMORY.md`.

18. **Deliver Final Report**
    
    Present to user:
    - **Status**: X/Y tasks complete, all tests passing
    - **Quality**: Success rate (first-attempt vs iterations)
    - **Pre-mortem review**: How many risks materialized
    - **Key learnings**: Top 3-5 takeaways
    - **Recommendations**: What to improve for next time

## Output Format

### During Execution
```markdown
## Task [ID]: [Title] ([X]/[Y])

**Status**: In Progress / Review / Complete
**Tests**: [passing]/[total]
**Commits**: [sha]

[Progress details]
```

### Final Report
```markdown
# 🎉 PRD Complete: [prd-name]

**Status**: ✅ [X]/[Y] tasks complete
**Tests**: ✅ [total] passing
**Quality**: ✅ [success-rate]% first-attempt
**Pre-mortem**: [risks-materialized]/[risks-identified] risks hit

## Deliverables
- [Feature 1]
- [Feature 2]
...

## Pre-Mortem Analysis
[Table of risks vs outcomes]

## Key Learnings
1. [Learning 1]
2. [Learning 2]
...

## Recommendations
1. [Recommendation 1]
2. [Recommendation 2]
...
```

## Examples

### Pre-Mortem Example

```markdown
### Risk 1: Fresh Context = Missing Dependencies
**Problem**: Subagent for B1 (memory retrieval) needs to know about A1-A3 (SearchProvider interface, QMD provider, fallback provider). Fresh context means they won't have the full picture.

**Mitigation**: In my prd-task prompt, I'll explicitly list relevant files to read first:
- "Before starting, read: src/core/search.ts, src/core/search-providers/qmd.ts, test/core/search.test.ts"
- Include mini-context summary: "SearchProvider interface is complete with QMD and fallback implementations"

**Verification**: Check that prompt includes file reading list before spawning subagent.
```

### Subagent Prompt Example

```markdown
You are implementing Task B1 from the intelligence-and-calendar PRD for Areté.

**PRD Goal**: Upgrade Areté's intelligence layer with swappable search backend.

**Task ID**: b1-memory-retrieval-upgrade  
**Title**: Upgrade memory retrieval to use SearchProvider

**Description**: Modify src/core/memory-retrieval.ts to use getSearchProvider() for searching memory...

**Acceptance Criteria**:
- memory-retrieval.ts imports and uses getSearchProvider()
- Primary search path uses provider.semanticSearch() scoped to memory items directory
- Falls back to existing token-based section scanning when provider returns no results
...

**Context - Read These Files First**:
1. src/core/search.ts — SearchProvider interface, getSearchProvider() factory, tokenize()
2. src/core/search-providers/qmd.ts — Example of testDeps pattern for mocking
3. src/core/search-providers/fallback.ts — Fallback provider implementation
4. src/types.ts — Type definitions (you'll add 'score' to MemoryResult)

**Important Patterns**:
- Follow the testDeps injection pattern from qmd.ts for mocking SearchProvider in tests
- Preserve backward compatibility: searchMemory() signature must not change
- Graceful fallback: if provider.semanticSearch() returns empty or errors, use existing parseMemorySections + scoreSection logic

**Pre-Mortem Mitigations Applied**:
- Context: Listed files above to read first (SearchProvider pattern, testDeps example)
- Test patterns: Reference testDeps from qmd.ts explicitly
- Backward compatibility: Explicit requirement in patterns section

After implementation:
1. Run npm run typecheck (must pass)
2. Run npm test (must pass)
3. Commit changes
4. Update prd.json and progress.txt

Proceed with implementation.
```

## Success Criteria

- All tasks completed (X/X)
- All tests passing
- All acceptance criteria met
- Pre-mortem risks did not materialize (or were mitigated successfully)
- Builder memory updated with learnings
- Final report delivered

## References

- **Learnings**: `dev/entries/2026-02-09_builder-orchestration-learnings.md`
- **PRD Template**: `dev/prds/intelligence-and-calendar/prd.md`
- **Task Schema**: `dev/autonomous/prd.json`
