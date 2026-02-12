---
name: execute-prd
description: Autonomous PRD execution with Orchestrator (Sr. Eng Manager) and Reviewer (Sr. Engineer). Orchestrator owns PRD understanding, value/alignment, breakdown, context for subagents, and holistic post-completion review and report. Reviewer owns pre-work sanity check and post-work code review (technical, AC, quality, reuse). Includes pre-mortem, structured feedback on iterate, and refactor backlog.
category: build
work_type: development
primitives: []
requires_briefing: false
---

# Execute PRD Skill

Autonomously execute a PRD by spawning subagents for each task, with two distinct roles: **Orchestrator** (senior engineering manager) and **Reviewer** (senior engineer).

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
- Task breakdown exists in `dev/autonomous/prd.json`
- Working branch created: `feature/{feature-name}`

## Workflow

### Phase 0: Understand the PRD (Orchestrator — Sr. Eng Manager)

1. **Read and Internalize the PRD**
   - Read `dev/prds/{feature-name}/prd.md`
   - Read `dev/autonomous/prd.json` (task breakdown)
   - Understand how this PRD fits into the broader Areté system (see AGENTS.md).
   - Understand the **benefits and value** this will provide to end users (problem statement, success criteria).
   - Understand dependencies between tasks (A1→A2→A3→B1...).

2. **Clarity and Alignment**
   - If anything is unclear (scope, problem statement, success criteria, or how it fits Areté), **ask the builder** before proceeding. Do not assume.
   - Confirm alignment: this PRD is the right thing to execute at this time.

3. **Identify Completed Work**
   - Check prd.json for tasks with `status: "complete"`
   - Read progress.txt to understand what's been done
   - Identify next pending task in dependency order

### Phase 1: Pre-Mortem (MANDATORY) — Orchestrator

**Purpose**: Identify risks before starting, create actionable mitigations.

4. **Identify Risks**
   
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

5. **Document Mitigations**
   
   For each risk, create concrete mitigation:
   
   ```markdown
   ### Risk: [Name]
   **Problem**: [What could go wrong]
   **Mitigation**: [Specific action to prevent it]
   **Verification**: [How to check mitigation was applied]
   ```

   **Documentation Impact Mitigation:**

   If the PRD changes user-facing behavior, paths, or setup:
   1. Run documentation checklist (see AGENTS.md § Documentation Planning Checklist).
   2. If docs are affected: Add a doc-update task to prd.json (last task, depends on all implementation tasks).
   3. Provide the doc subagent with: feature changes summary, documentation checklist, and search results (which files reference affected concepts).
   4. Doc subagent runs checklist, updates files, commits.

   **Pattern:** Orchestrator spawns doc subagent after all implementation tasks complete. Subagent has full context of what changed and runs systematic audit.

6. **Share Pre-Mortem with User**
   
   Present risks + mitigations table. Ask:
   - "Do you see any other risks?"
   - "Are these mitigations sufficient?"
   - Wait for approval before proceeding

### Phase 2: Task Execution Loop

For each pending task (in dependency order):

7. **Prepare Context** (Orchestrator)
   
   - **Read prior completed tasks**: Check what's been built (files, patterns, tests)
   - **Identify files to reference**: List specific files subagent should read first
   - **Check mitigations**: Review pre-mortem - which mitigations apply to this task?

8. **Craft Subagent Prompt** (Orchestrator)
   
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
   4. Update dev/autonomous/prd.json
   5. Update dev/autonomous/progress.txt
   
   **Post-Task Reflection** (include in your completion report):
   
   [FOR SMALL TASKS (<20 lines, 1-2 files):]
   - What helped: Which rule/memory item guided you?
   - Token estimate: e.g., "~5K tokens"
   Format: 1-2 sentences
   
   [FOR MEDIUM/LARGE TASKS (multiple files, new systems):]
   1. Memory impact: Did learnings from progress.txt/MEMORY.md/collaboration.md affect your approach? What specifically?
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
   - ❌ Don't say "use good patterns" (too vague)

9. **Reviewer: Pre-Work Sanity Check** (Sr. Engineer)

   Before spawning the subagent, the Reviewer confirms:
   - **Details**: Task description and acceptance criteria are clear and unambiguous.
   - **AC**: Acceptance criteria are complete and testable; nothing critical is missing.
   - **Clarity on what to build**: The prompt and context (files to read, patterns) give the subagent enough to implement without guessing. Dependencies and pre-mortem mitigations for this task are reflected.
   - If anything is vague or missing, refine the prompt or ask the Orchestrator to add context — then proceed to spawn only when the sanity check passes.

10. **Spawn Subagent** (Orchestrator)
   
   ```
   Task tool with subagent_type: generalPurpose
   description: [3-5 word summary]
   prompt: [crafted prompt from step 7]
   ```
   
   Wait for subagent to complete and return results.

11. **Reviewer: Code Review** (Sr. Engineer)

   After the subagent completes, perform a thorough code review as a sr. engineer: validate the work, acceptance criteria, and tests. Ensure the agent wrote quality code, tested their work, and used DRY/KISS and the best solution given context and constraints.

   **11.0 File Deletion Review**

   Before conducting the code review, check for deleted files:

   ```bash
   git diff HEAD --name-status | grep '^D'
   ```

   **If files were deleted:**

   1. **Was it specified in the plan?** (e.g., "remove old fathom.py, superseded by fathom.ts")
      - If yes → Proceed to 11a.
      - If no → Continue to step 2.

   2. **Ask subagent to justify:** What file was deleted? Why? What replaced it (if anything)? Was it intentional or accidental?

   3. **Validate justification:**
      - **Good:** "Deleted scripts/fathom.py; superseded by src/integrations/fathom/ (TypeScript). Old Python client no longer needed."
      - **Bad:** Silence, or "cleanup", or no justification.

   4. **If justification is unclear or missing:** Reject the work. Ask subagent to either restore the file or provide clear rationale. Do not accept until justified or restored.

   **Special attention:** Build-only files (`.cursor/rules/*.mdc`, `dev/*`, `test/*`, `scripts/*`) should RARELY be deleted unless explicitly planned or obviously superseded.

   **11a. Technical Review**
   
   - [ ] Uses `.js` extensions in imports (NodeNext module resolution)
   - [ ] No `any` types (strict TypeScript)
   - [ ] Proper error handling (try/catch with graceful fallback)
   - [ ] Tests for happy path and edge cases
   - [ ] Backward compatibility preserved (function signatures unchanged)
   - [ ] Follows project patterns (see dev.mdc)
   
   **11b. AC Review**
   
   - Read all changed files. Verify implementation **matches acceptance criteria** for this task (no more, no less).
   - Flag scope drift (implemented more than asked) or missing criteria.
   
   **11c. Quality Check (DRY, KISS, Best Solution)**
   
   - [ ] **DRY**: No duplicated logic that already exists elsewhere; no copy-paste that should be a shared util or existing service.
   - [ ] **KISS**: Implementation is the simplest that meets acceptance criteria; no over-engineering or unnecessary abstraction.
   - [ ] **Best solution**: Code is appropriate for context and constraints (e.g. used existing provider instead of reimplementing; didn't hardcode what should be config).
   - Flag lazy or fragile choices: hardcoding, bypassing abstractions the codebase expects, or doing the minimum in a brittle way.
   
   **11d. Reuse & Duplication Check**
   
   - **New services/modules**: For any new file or "service-like" code (e.g. new helper module, new provider), ask: does equivalent functionality already exist? Check AGENTS.md and `src/` (e.g. `src/core/`, `src/integrations/`). If the solution already exists elsewhere, flag: "Reimplemented existing capability — use [X] instead."
   - **Repetitive but not abstracted**: If the implementation is correct but you notice similar logic exists elsewhere without a shared abstraction, do **not** block acceptance. Instead: add a **refactor backlog item** (step 11e) so it can be addressed later. Continue with accept/iterate based on other criteria.
   
   **11e. Refactor Backlog (When Applicable)**
   
   When you find repetitive logic that isn't yet abstracted (same pattern in multiple places, no shared util):
   1. Create a short backlog item in `dev/backlog/improvements/` using the naming pattern `refactor-[short-description].md` (e.g. `refactor-search-scoring-shared-util.md`).
   2. In the file include: **What** (duplicated pattern and where), **Why** (DRY/maintainability), **Suggested direction** (e.g. extract to `src/core/utils.ts`), **Effort** (Tiny/Small/Medium).
   3. Note the item in progress.txt or your review summary so the final report can list "Refactor items added to backlog: N."
   
   **If any of 11a–11d fail**: Proceed to step 13 (Accept or Iterate) with **Iterate** — give the subagent structured feedback (see step 13). Do not accept until the subagent has addressed the issues or you have explicitly decided to accept with a known backlog item only (11e).

12. **Verify Tests** (Reviewer)
    
    Run full test suite (not just new tests):
    
    ```bash
    npm run typecheck  # Must pass
    npm test           # Must pass, all tests
    ```
    
    If tests fail:
    - **Integration issue**: Full suite catches ripple effects (e.g. async changes)
    - **Resume subagent**: Provide specific feedback, ask to fix
    - **Repeat review**: After fix, verify again

13. **Accept or Iterate** (Reviewer)
    
    **Accept if**:
    - ✅ All acceptance criteria met (11b)
    - ✅ Technical review passed (11a)
    - ✅ Quality check passed — DRY, KISS, best solution (11c)
    - ✅ Reuse check passed — no reimplemented existing capability (11d); refactor-only items (11e) are backlogged, not blockers
    - ✅ All tests passing (including existing tests)
    - ✅ Pre-mortem mitigations applied
    
    **Iterate if** (any of the following):
    - ❌ AC not met (scope drift, missing criteria, or over-implementation)
    - ❌ Technical review failed (pattern violations: any types, missing .js, error handling, tests, backward compat)
    - ❌ Quality check failed: lazy/fragile implementation, violated DRY/KISS, or clearly worse solution than existing option
    - ❌ Reuse check failed: reimplemented existing service/capability instead of using it
    - ❌ Tests failing
    
    **When iterating: give the subagent structured feedback.** Resume the subagent with a prompt that includes:
    1. **What was wrong**: Specific finding (e.g. "Reimplemented search logic; getSearchProvider() already exists in src/core/search.ts").
    2. **What to do**: Concrete instruction (e.g. "Remove the new search helper; import getSearchProvider from './search.js' and use provider.semanticSearch().").
    3. **Files to check**: List files or line ranges to change.
    4. **Re-verify**: "After fixing, run npm run typecheck and npm test again; then update prd.json and progress.txt."
    
    Repeat from step 11 (Reviewer: Code Review) after the subagent returns.

14. **Update Tracking** (Orchestrator)
    
    Once accepted:
    - Mark task complete in prd.json (`status: "complete"`)
    - Verify commitSha is recorded
    - Check: `completedTasks` count matches complete status count

15. **Progress Update (Every 3 Tasks)** (Orchestrator)
    
    Report to user:
    - "Task X/Y complete: [title]"
    - "Next: [next task title]"
    - "Tests: Z/Z passing"

### Phase 3: Holistic Review and Close (Orchestrator — Sr. Eng Manager, then Report)

**Orchestrator returns to sr. eng manager role.** All tasks are complete from a Reviewer perspective; now assess the whole.

16. **Orchestrator: Holistic Review**

   - **Does this solve the problem?** Re-read the PRD problem statement and success criteria. Does the implemented work satisfy the needs and problem statement of the PRD?
   - **Is there anything missing?** Gaps in functionality, edge cases, or integration points that the task-level AC didn't cover but the PRD implies?
   - **Documentation check**: Should AGENTS.md, README.md, or other docs be updated? If so, create a quick follow-up task or note for the builder.
   - **Learnings and insights**: What can we extract for the builder and for future PRDs?
   - **If changes are needed**: Go back through the loop — either to specific subagent(s) with new acceptance criteria or to new tasks. Use the same Reviewer (pre-work sanity check, then spawn, then code review) and Accept or Iterate flow. Once the holistic review passes (or you document known gaps for the builder to triage), proceed to steps 17–21.

17. **Analyze Pre-Mortem Effectiveness**
    
    For each risk identified in pre-mortem:
    - Did it materialize? (Yes/No)
    - Was mitigation applied? (Yes/No)
    - Was mitigation effective? (Yes/No/Partial)
    
    Example table:
    
    | Risk | Materialized? | Mitigation Applied? | Effective? |
    |------|--------------|---------------------|-----------|
    | Fresh context | No | Yes (file lists) | Yes |
    | Test patterns | No | Yes (testDeps ref) | Yes |
    
18. **Identify Surprises**
    
    What happened that wasn't in the pre-mortem?
    - **Positive surprises**: What went better than expected?
    - **Negative surprises**: What issues arose that weren't anticipated?

19. **Extract Learnings**
    
    Synthesize:
    - **What worked well**: Patterns to repeat
    - **What didn't work**: Patterns to avoid
    - **Collaboration patterns**: How did builder respond? What did they prefer?
    - **System improvements**: What would make next PRD execution smoother?

20. **Update Builder Memory** (Orchestrator — MANDATORY TASK)
    
    **This is a required orchestrator task.** Do not deliver the final report (step 21) until this is done. Build memory is how future agents and the builder avoid repeating mistakes.
    
    1. **Create entry**: `dev/entries/YYYY-MM-DD_[prd-name]-learnings.md`
       
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
    
    2. **Add index line** to `dev/MEMORY.md` (one line per entry; add at top of Index section). See MEMORY.md conventions for format.
    
    **Verification before step 21**: Entry file exists; MEMORY.md contains a new line pointing to it.

21. **Deliver Final Report to Builder** (Orchestrator)

   Present to the builder (ONE comprehensive report, not repetitive sections):
    
    **Prerequisite**: Step 20 (Update Builder Memory) must be complete. Do not deliver the report until the entry exists and MEMORY.md is updated.
    
    **Format**:
    ```markdown
    # 🎉 PRD Complete: [prd-name]
    
    **Status**: ✅ [X]/[Y] tasks complete
    **Quality**: [Z]% first-attempt success | [N] iterations required
    **Tests**: [Total] passing (+[New] added)
    **Pre-mortem**: [A]/[B] risks materialized
    **Commits**: [N] commits
    **Token usage**: ~[X]K total (~[Y]K orchestrator + ~[Z]K subagents)
    **Build memory**: ✅ Entry `dev/entries/YYYY-MM-DD_[prd-name]-learnings.md` created; MEMORY.md updated
    
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
    
    (Build memory is already updated in step 20; do not list "create memory entry" as a next step.)
    
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

When iterating, the orchestrator resumes the subagent with concrete instructions:

```markdown
Your previous implementation for Task B1 had one issue that must be fixed before acceptance.

**What was wrong**: You added a new local search helper in memory-retrieval.ts. Equivalent functionality already exists: the codebase has getSearchProvider() in src/core/search.ts, which returns a SearchProvider with semanticSearch() and search(). The PRD and AGENTS.md specify using the existing search abstraction.

**What to do**:
1. Remove the new search helper and any duplicate search logic from memory-retrieval.ts.
2. Import getSearchProvider from '../search.js' (or the correct relative path).
3. Use getSearchProvider(workspaceRoot) and then provider.semanticSearch() for the primary path, with fallback to the existing parseMemorySections + scoreSection logic when the provider returns no results.
4. Keep the same public API (searchMemory signature unchanged).

**Files to check**: src/core/memory-retrieval.ts (remove new helper, add getSearchProvider usage).

After fixing, run npm run typecheck and npm test again. Update prd.json and progress.txt. Then return your result.
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

- **Learnings**: `dev/entries/2026-02-09_builder-orchestration-learnings.md`
- **PRD Template**: `dev/prds/intelligence-and-calendar/prd.md`
- **Task Schema**: `dev/autonomous/prd.json`
