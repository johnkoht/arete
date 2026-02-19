---
name: execute-prd
description: Autonomous PRD execution with Orchestrator (Sr. Eng Manager) and Reviewer (Sr. Engineer). Orchestrator owns PRD understanding, value/alignment, breakdown, context for subagents, and holistic post-completion review and report. Reviewer owns pre-work sanity check and post-work code review (technical, AC, quality, reuse). Includes pre-mortem, structured feedback on iterate, and refactor backlog.
category: build
work_type: development
primitives: []
requires_briefing: false
---

# Execute PRD Skill

Autonomously execute a PRD by dispatching subagents for each task, with two distinct roles: **Orchestrator** (senior engineering manager) and **Reviewer** (senior engineer).

## Tool Reference

This skill uses the `subagent` tool from the `pi-subagents` extension to dispatch work:

```typescript
// Dispatch a developer to implement a task
subagent({ agent: "developer", task: "<prompt>", agentScope: "project" })

// Dispatch a reviewer for sanity check or code review
subagent({ agent: "reviewer", task: "<prompt>", agentScope: "project" })
```

**Parameters**:
- `agent`: Name of the agent definition in `.pi/agents/<name>.md`
- `task`: The full prompt/instructions for the subagent
- `agentScope`: Must be `"project"` to load project-level agent definitions from `.pi/agents/`

**Returns**: The subagent's final assistant message (text). Parse the developer's completion report or reviewer's verdict from this text.

**Important**: All subagent calls inherit the current working directory. The orchestrator must run from the **worktree root** so subagents work in the correct location.

**Fallback**: If the `subagent` tool is not available, the orchestrator executes tasks directly in sequence with the same quality gates and review process.

## Roles

### Orchestrator — Sr. Engineering Manager

The Orchestrator acts as a sr. engineering manager. Goals:

- **Understand the PRD well** and how it fits into the broader Areté system.
- **Understand the benefits and value** this will provide to end users.
- **If there is no clarity or alignment**, ask the builder before proceeding.
- **Break down the work** and provide the right context and information for each subagent to complete their tasks.

Like a sr. engineering manager, the Orchestrator is a product thinker and technical leader: ensures the right problem is being solved and the right scope and context are given to the team (subagents).

**After all tasks are completed**, the Orchestrator returns to sr. eng manager mode and performs a **holistic review**: Does this solve the problem and satisfy the needs and problem statement of the PRD? Is there anything missing? Are there learnings or insights to extract? If changes are needed, the Orchestrator goes back through the loop (or to particular subagents) to get the work done. Once complete, the Orchestrator provides a report to the builder.

### Reviewer — Sr. Engineer

The Reviewer acts as a sr. engineer in two moments:

1. **Before work begins**: When a task is about to go to a subagent, the Reviewer reviews and confirms details, AC, and clarity on what to build. This is a **sanity check** before work begins.
2. **After the subagent completes**: The Reviewer performs a **thorough code review** as a sr. engineer: validates the work, acceptance criteria, and tests (technical review, AC review, quality check DRY/KISS, reuse and duplication check, refactor backlog when applicable). Accept or iterate with structured feedback to the subagent.

## When to Use

- User says: "Execute this PRD" or "Build everything in prd.json"
- Multi-task PRD with dependencies (3+ tasks)
- Want autonomous execution with quality review

## Prerequisites

- PRD exists at `dev/prds/{feature-name}/prd.md`
- Task breakdown exists in `dev/plans/{feature-name}/prd.json`
- Working branch created (worktree recommended for isolation)

## Execution Context

The orchestrator runs **from the worktree root** (or repository root if not using worktrees). All subagent calls inherit this cwd.

- **Worktree mode** (recommended): Builder creates worktree (`wt new <slug>`), starts Pi session there, invokes execute-prd. Subagents work in the worktree, commits land on the worktree branch.
- **Direct mode**: Builder runs from main repo. Works but no filesystem isolation.

## Workflow

### Phase 0: Understand the PRD (Orchestrator — Sr. Eng Manager)

1. **Read and Internalize the PRD**
   - Read `dev/prds/{feature-name}/prd.md` (path provided by user or derived from plan slug)
   - Read `dev/plans/{feature-name}/prd.json` (task breakdown — path provided by user)
   - Understand how this PRD fits into the broader Areté system (see AGENTS.md).
   - Understand the **benefits and value** this will provide to end users (problem statement, success criteria).
   - Understand dependencies between tasks (A1→A2→A3→B1...).

2. **Clarity and Alignment**
   - If anything is unclear (scope, problem statement, success criteria, or how it fits Areté), **ask the builder** before proceeding. Do not assume.
   - Confirm alignment: this PRD is the right thing to execute at this time.

3. **Initialize Execution State**
   - Create `dev/executions/{plan-slug}/` directory
   - Copy `dev/plans/{plan-slug}/prd.json` → `dev/executions/{plan-slug}/prd.json`
   - Create `dev/executions/{plan-slug}/status.json`:
     ```json
     {
       "planSlug": "{plan-slug}",
       "status": "running",
       "startedAt": "<ISO timestamp>",
       "updatedAt": "<ISO timestamp>",
       "currentTaskId": null,
       "completedTasks": 0,
       "totalTasks": <N>,
       "worktree": {
         "path": "<absolute path to cwd>",
         "branch": "<current branch>"
       }
     }
     ```
   - Create `dev/executions/{plan-slug}/progress.md`:
     ```markdown
     # Progress Log — {plan-slug}
     
     Started: <ISO timestamp>
     ```

4. **Identify Completed Work**
   - Check prd.json for tasks with `status: "complete"`
   - Read progress.md to understand what's been done
   - Identify next pending task in dependency order

### Phase 1: Pre-Mortem (MANDATORY) — Orchestrator

**Purpose**: Identify risks before starting, create actionable mitigations.

5. **Identify Risks**
   
   Consider these common risk categories:
   
   | Risk Category | Question to Ask | Example |
   |--------------|----------------|---------|
   | **Context Gaps** | Will subagents have enough context? | "B1 needs to know about SearchProvider from A1-A3" |
   | **Test Patterns** | Do we have test patterns to follow? | "Need to reference testDeps pattern from qmd.ts" |
   | **Integration** | How will tasks integrate? | "B2 async change might break callers" |
   | **Scope Creep** | How to prevent over-implementation? | "Strict acceptance criteria adherence" |
   | **Code Quality** | What patterns must be followed? | ".js imports, no any, error handling" |
   | **Reuse / Duplication** | Could subagent reimplement instead of reuse? | "Use getSearchProvider(); don't add new search logic" |
   | **Dependencies** | Are dependencies clear? | "Can't do B1 until A3 is done" |
   | **Platform Issues** | Any platform-specific risks? | "ical-buddy might not be installed" |
   | **State Tracking** | How to track progress? | "Update prd.json after each task" |
   | **Documentation** | What docs need updates? | "README install flow, ONBOARDING paths, backlog items with doc tasks" |

6. **Document Mitigations**
   
   For each risk, create concrete mitigation:
   
   ```markdown
   ### Risk: [Name]
   **Problem**: [What could go wrong]
   **Mitigation**: [Specific action to prevent it]
   **Verification**: [How to check mitigation was applied]
   ```

   **Documentation Impact Mitigation:**

   If the PRD changes user-facing behavior, paths, or setup:
   1. Run documentation checklist (see dev.mdc § Documentation planning checklist).
   2. If docs are affected: Add a doc-update task to prd.json (last task, depends on all implementation tasks).
   3. Provide the doc subagent with: feature changes summary, documentation checklist, and search results (which files reference affected concepts).
   4. Doc subagent runs checklist, updates files, commits.

   **Pattern:** Orchestrator spawns doc subagent after all implementation tasks complete. Subagent has full context of what changed and runs systematic audit.

7. **Share Pre-Mortem with User**
   
   Present risks + mitigations table. Ask:
   - "Do you see any other risks?"
   - "Are these mitigations sufficient?"
   - Wait for approval before proceeding

### Phase 2: Task Execution Loop

For each pending task (in dependency order):

8. **Prepare Context** (Orchestrator)
   
   - **Read prior completed tasks**: Check what's been built (files, patterns, tests)
   - **Identify files to reference**: List specific files subagent should read first
   - **Check mitigations**: Review pre-mortem - which mitigations apply to this task?

9. **Craft Subagent Prompt** (Orchestrator)
   
   Use this template (scale reflection based on task complexity):
   
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
   
   **Execution State Path**: dev/executions/{plan-slug}/
   
   **Context - Read These Files First**:
   1. [file] — [why it's relevant]
   2. [file] — [why it's relevant]
   ...
   
   **Important Patterns**:
   - [Pattern 1]: Reference [specific file that shows this pattern]
   - [Pattern 2]: Reference [specific file that shows this pattern]
   ...
   
   **Reuse & Design**:
   - Use existing services, helpers, and abstractions per AGENTS.md (e.g. getSearchProvider(), shared CLI helpers). Do not reimplement what already exists.
   - Apply DRY (don't repeat yourself) and KISS (simplest solution that meets acceptance criteria). Prefer existing modules over new ones when they fit.
   
   **Pre-Mortem Mitigations Applied**:
   - [Mitigation 1 from pre-mortem]
   - [Mitigation 2 from pre-mortem]
   
   **Implementation Notes**: [specific guidance]
   
   After implementation:
   1. Run npm run typecheck (must pass)
   2. Run npm test (must pass)
   3. Commit with message: "[type]([scope]): [description]"
   4. Update dev/executions/{plan-slug}/prd.json — set this task's status to "complete" and record commitSha
   5. Append to dev/executions/{plan-slug}/progress.md
   
   **Post-Task Reflection** (include in your completion report):
   
   [FOR SMALL TASKS (<20 lines, 1-2 files):]
   - What helped: Which rule/memory item guided you?
   - Token estimate: e.g., "~5K tokens"
   Format: 1-2 sentences
   
   [FOR MEDIUM/LARGE TASKS (multiple files, new systems):]
   1. Memory impact: Did learnings from progress.md/MEMORY.md/collaboration.md affect your approach? What specifically?
   2. Rule effectiveness: Which rules helped? Which created confusion?
   3. Suggestions: Improvements to task prompt or workflow?
   4. Token estimate: e.g., "~25K tokens"
   Format: 3-5 sentences
   
   Proceed with implementation.
   ```
   
   **Key principles**:
   - ✅ Show examples, don't just describe ("Follow testDeps pattern from qmd.ts")
   - ✅ List files to read first (prevents assumptions)
   - ✅ Reference pre-mortem mitigations explicitly
   - ✅ Include **Execution State Path** so subagent writes to the correct location
   - ❌ Don't say "use good patterns" (too vague)

10. **Reviewer: Pre-Work Sanity Check**

    Dispatch the reviewer to validate the task prompt before the developer starts:

    ```typescript
    subagent({
      agent: "reviewer",
      task: "Pre-work sanity check for Task [ID]: [title]\n\n[paste the crafted prompt]\n\nReview this task prompt for clarity, completeness of AC, sufficient context, and pre-mortem mitigation coverage.",
      agentScope: "project"
    })
    ```

    The reviewer follows its own pre-work checklist (see `.pi/agents/reviewer.md`). If the verdict is **NEEDS REFINEMENT**, refine the prompt before dispatching the developer.

11. **Dispatch Developer Subagent** (Orchestrator)
    
    ```typescript
    subagent({
      agent: "developer",
      task: "<crafted prompt from step 9>",
      agentScope: "project"
    })
    ```
    
    Wait for the subagent to complete and return its completion report. The developer returns a structured report with: Completed, Files Changed, Quality Checks, Commit, and Reflection sections (see `.pi/agents/developer.md` for format).

12. **Reviewer: Code Review**

    After the developer completes, dispatch the reviewer for a thorough code review:

    ```typescript
    subagent({
      agent: "reviewer",
      task: "Code review for Task [ID]: [title]\n\nAcceptance Criteria:\n[list from prd.json]\n\nPre-mortem mitigations for this task:\n[list]\n\nDeveloper completion report:\n[paste developer output]\n\nReview the implementation. Return APPROVED or ITERATE with structured feedback.",
      agentScope: "project"
    })
    ```

    The reviewer follows its full review process: file deletion check, technical review, AC review, quality check (DRY/KISS), reuse check, quality gates, and accept/iterate decision (see `.pi/agents/reviewer.md` for the complete checklist).

    **Orchestrator actions based on verdict:**

    - **APPROVED**: Proceed to step 13.
    - **ITERATE**: Dispatch the developer again with the reviewer's structured feedback. Include: what was wrong, what to do, files to check, and instruction to re-verify. After the developer returns, dispatch the reviewer again for re-review. Repeat until APPROVED.

13. **Update Tracking** (Orchestrator)
    
    Once the reviewer returns APPROVED:
    - Mark task complete in `dev/executions/{plan-slug}/prd.json` (`status: "complete"`)
    - Update `dev/executions/{plan-slug}/status.json` (`currentTaskId`, `completedTasks`, `updatedAt`)
    - Verify commitSha is recorded

14. **Progress Update (Every 3 Tasks)** (Orchestrator)
    
    Report to user:
    - "Task X/Y complete: [title]"
    - "Next: [next task title]"
    - "Tests: Z/Z passing"

### Phase 3: Holistic Review and Close (Orchestrator — Sr. Eng Manager, then Report)

**Orchestrator returns to sr. eng manager role.** All tasks are complete from a Reviewer perspective; now assess the whole.

15. **Orchestrator: Holistic Review**

   - **Does this solve the problem?** Re-read the PRD problem statement and success criteria. Does the implemented work satisfy the needs and problem statement of the PRD?
   - **Is there anything missing?** Gaps in functionality, edge cases, or integration points that the task-level AC didn't cover but the PRD implies?
   - **Documentation check**: Should AGENTS.md, README.md, or other docs be updated? If so, create a quick follow-up task or note for the builder.
   - **Learnings and insights**: What can we extract for the builder and for future PRDs?
   - **If changes are needed**: Go back through the loop — either to specific subagent(s) with new acceptance criteria or to new tasks. Use the same Reviewer (pre-work sanity check, then dispatch, then code review) and Accept or Iterate flow. Once the holistic review passes (or you document known gaps for the builder to triage), proceed to steps 16–20.

16. **Analyze Pre-Mortem Effectiveness**
    
    For each risk identified in pre-mortem:
    - Did it materialize? (Yes/No)
    - Was mitigation applied? (Yes/No)
    - Was mitigation effective? (Yes/No/Partial)
    
    Example table:
    
    | Risk | Materialized? | Mitigation Applied? | Effective? |
    |------|--------------|---------------------|-----------|
    | Fresh context | No | Yes (file lists) | Yes |
    | Test patterns | No | Yes (testDeps ref) | Yes |
    
17. **Identify Surprises**
    
    What happened that wasn't in the pre-mortem?
    - **Positive surprises**: What went better than expected?
    - **Negative surprises**: What issues arose that weren't anticipated?

18. **Extract Learnings**
    
    Synthesize:
    - **What worked well**: Patterns to repeat
    - **What didn't work**: Patterns to avoid
    - **Collaboration patterns**: How did builder respond? What did they prefer?
    - **System improvements**: What would make next PRD execution smoother?

19. **Update Builder Memory** (Orchestrator — MANDATORY TASK)
    
    **This is a required orchestrator task.** Do not deliver the final report (step 20) until this is done. Build memory is how future agents and the builder avoid repeating mistakes.
    
    1. **Create entry**: `memory/entries/YYYY-MM-DD_[prd-name]-learnings.md`
       
       Include:
       - **Metrics**: Tasks completed, success rate, iterations, tests added, token usage
       - **Pre-mortem analysis**: Risks vs outcomes (table), which mitigations were effective
       - **What worked well**: Patterns to repeat (be specific: "Show-don't-tell with line ranges")
       - **What didn't work**: Patterns to avoid or issues encountered
       - **Subagent insights**: Synthesize reflections across all tasks (what helped them most, common suggestions)
       - **Collaboration patterns**: How did builder respond? What did they prefer?
       - **Recommendations for next PRD**: Specific improvements (prompts, workflow, rules)
       - **Refactor backlog items**: Count and paths (if any)
       - **Documentation gaps**: Files that should be updated (AGENTS.md, README, etc.)
    
    2. **Add index line** to `memory/MEMORY.md` (one line per entry; add at top of Index section). See MEMORY.md conventions for format.
    
    **Verification before step 20**: Entry file exists; MEMORY.md contains a new line pointing to it.

20. **Deliver Final Report to Builder** (Orchestrator)

   Present to the builder (ONE comprehensive report, not repetitive sections):
    
    **Prerequisite**: Step 19 (Update Builder Memory) must be complete. Do not deliver the report until the entry exists and MEMORY.md is updated.
    
    **Format**:
    ```markdown
    # 🎉 PRD Complete: [prd-name]
    
    **Status**: ✅ [X]/[Y] tasks complete
    **Quality**: [Z]% first-attempt success | [N] iterations required
    **Tests**: [Total] passing (+[New] added)
    **Pre-mortem**: [A]/[B] risks materialized
    **Commits**: [N] commits
    **Token usage**: ~[X]K total (~[Y]K orchestrator + ~[Z]K subagents)
    **Build memory**: ✅ Entry `memory/entries/YYYY-MM-DD_[prd-name]-learnings.md` created; MEMORY.md updated
    
    ## Deliverables
    - [Feature 1] — Brief description
    - [Feature 2] — Brief description
    
    ## Key Learnings (Top 3-5)
    1. [Learning] — [Evidence]
    2. [Learning] — [Evidence]
    
    ## Pre-Mortem Review
    [Brief table: Risk | Materialized | Effective]
    
    ## Refactor Backlog Items (if any)
    - `dev/backlog/improvements/[file].md` — [One-line summary]
    
    ## Recommendations
    - **Continue**: [3-5 patterns that worked]
    - **Stop**: [2-3 patterns to change]
    - **Start**: [3-5 new practices to adopt]
    
    ## Documentation Updates Needed
    - [ ] AGENTS.md § X — [what to add]
    - [ ] README.md — [what to update]
    
    ## Next Steps
    1. Review and merge
    2. Update AGENTS.md (if documentation gaps noted)
    3. Address refactor backlog (if any)
    ```
    
    (Build memory is already updated in step 19; do not list "create memory entry" as a next step.)
    
    **Keep it concise** — 1-2 pages max, no repetition. The memory entry has full details.

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
**Refactor items added to backlog**: [N] (see list below if N > 0)

## Deliverables
- [Feature 1]
- [Feature 2]
...

## Pre-Mortem Analysis
[Table of risks vs outcomes]

## Refactor Backlog Items (if any)
- `dev/backlog/improvements/refactor-[name].md` — [one-line summary]
- ...

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

**Mitigation**: In my subagent prompt, I'll explicitly list relevant files to read first:
- "Before starting, read: src/core/search.ts, src/core/search-providers/qmd.ts, test/core/search.test.ts"
- Include mini-context summary: "SearchProvider interface is complete with QMD and fallback implementations"

**Verification**: Check that prompt includes file reading list before dispatching subagent.
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

**Execution State Path**: dev/executions/intelligence-and-calendar/

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
4. Update dev/executions/intelligence-and-calendar/prd.json and progress.md

Proceed with implementation.
```

### Refactor Backlog Item Example

When the orchestrator finds repetitive logic that isn't yet abstracted, create a short file in `dev/backlog/improvements/`:

```markdown
# Refactor: [Short description]

**Status**: Backlog  
**Effort**: Tiny | Small | Medium  
**Source**: PRD [name], Task [id] — orchestrator review

## What

[Describe the duplicated pattern and where it appears, e.g. "Score calculation logic appears in memory-retrieval.ts and context-injection.ts with minor variations."]

## Why

DRY / maintainability; single place to change behavior.

## Suggested direction

[E.g. "Extract to src/core/scoreSection.ts and use in both callers."]
```

### Structured Feedback to Subagent Example

When iterating, the orchestrator dispatches the developer again with concrete instructions:

```markdown
Your previous implementation for Task B1 had one issue that must be fixed before acceptance.

**What was wrong**: You added a new local search helper in memory-retrieval.ts. Equivalent functionality already exists: the codebase has getSearchProvider() in src/core/search.ts, which returns a SearchProvider with semanticSearch() and search(). The PRD and AGENTS.md specify using the existing search abstraction.

**What to do**:
1. Remove the new search helper and any duplicate search logic from memory-retrieval.ts.
2. Import getSearchProvider from '../search.js' (or the correct relative path).
3. Use getSearchProvider(workspaceRoot) and then provider.semanticSearch() for the primary path, with fallback to the existing parseMemorySections + scoreSection logic when the provider returns no results.
4. Keep the same public API (searchMemory signature unchanged).

**Files to check**: src/core/memory-retrieval.ts (remove new helper, add getSearchProvider usage).

**Execution State Path**: dev/executions/intelligence-and-calendar/

After fixing, run npm run typecheck and npm test again. Update prd.json and progress.md. Then return your result.
```

## Success Criteria

- All tasks completed (X/X)
- All tests passing
- All acceptance criteria met (Reviewer)
- Holistic review passed: PRD problem and needs satisfied (Orchestrator)
- Pre-mortem risks did not materialize (or were mitigated successfully)
- Builder memory updated with learnings
- Final report delivered to builder (Orchestrator)

## References

- **Learnings**: `memory/entries/2026-02-09_builder-orchestration-learnings.md`
- **PRD Template**: `dev/prds/intelligence-and-calendar/prd.md`
- **Execution State**: `dev/executions/README.md`
- **Task Schema**: `dev/autonomous/schema.ts` (may move in Phase 2)
