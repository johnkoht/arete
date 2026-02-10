---
name: execute-prd
description: Autonomous orchestrator that executes PRD tasks sequentially using fresh Task subagents. INTERNAL TOOL for Areté development only.
---

# Execute PRD Skill

Orchestrate autonomous execution of PRD tasks by spawning fresh Task subagents for each task, validating with tests, and committing progress.

⚠️ **INTERNAL TOOLING** - This is for developing Areté itself, not for end users.

## When to Use

- "Execute the PRD"
- "Start autonomous execution"
- "Run the task list"
- "Continue executing PRD" (resume from interruption)

## Prerequisites

- `prd.json` exists at `dev/autonomous/prd.json`
- Git repository is clean (or user acknowledges dirty state)
- Tests and typecheck are working (`npm run typecheck`, `npm test`)

**Preferred execution**: Use the **prd-task** custom subagent (`.cursor/agents/prd-task.md`) so each task runs in a fresh context window. Cursor exposes custom subagents as tools when the `.cursor/agents/` directory contains subagent files. If no subagent tool is available, follow the fallback in Step 3: execute each task yourself, one at a time.

## Autonomous Execution Rules

**CRITICAL**: This is an autonomous workflow. Once started:

1. **DO NOT ask for permission** to write to `prd.json`, `progress.txt`, or make commits
2. **DO NOT pause between tasks** waiting for approval
3. **DO NOT ask "should I proceed?"** — just proceed
4. **DO proceed through all tasks** until completion or max iterations
5. **DO update status files** (`prd.json`, `progress.txt`) as you go without prompting

The user has explicitly started autonomous execution. They expect you to work through the entire task list without interruption. Only stop if:
- All tasks are complete
- Max iterations reached
- A task fails after max retries (log it and continue to next task)
- Git/system errors that require user intervention

Update files, spawn subagents, run tests, and commit — all without asking. That's what "autonomous" means.

## How It Works

```
1. Read prd.json
2. Find next task where status !== "complete"
3. If none → Success! Archive and exit
4. Mark task status: "in_progress"
5. Spawn Task subagent with task instructions
6. Subagent does work, runs tests, commits if passing
7. Check if task succeeded (new commit exists)
8. Update prd.json with result
9. Repeat until all done or max iterations
```

## Configuration

Default settings (user can override):

```typescript
{
  maxIterations: 20,        // Stop after N tasks
  maxRetries: 2,            // Retry failed tasks up to N times
  prdPath: 'dev/autonomous/prd.json',
  progressPath: 'dev/autonomous/progress.txt'
}
```

## Workflow

### Phase 1: Initialization

1. **Check prerequisites**:
   ```bash
   # Verify prd.json exists
   ls -la dev/autonomous/prd.json
   
   # Check git status
   git status
   
   # Verify tests work
   npm run typecheck && npm test
   ```

2. **Read prd.json**:
   ```typescript
   import fs from 'fs';
   const prd = JSON.parse(fs.readFileSync('dev/autonomous/prd.json', 'utf8'));
   ```

3. **Set up progress tracking**:
   - Initialize iteration counter: 0
   - Record start time in prd.metadata.startedAt
   - Log: "🚀 Starting autonomous execution: {prd.name}"

4. **Create feature branch** (if needed):
   ```bash
   git checkout -b {prd.branchName}
   ```

### Phase 2: Main Loop

For each iteration (up to maxIterations):

#### Step 1: Find Next Task

```typescript
const nextTask = prd.userStories.find(task => 
  task.status !== 'complete' && 
  task.status !== 'failed' &&
  task.attemptCount <= maxRetries
);

if (!nextTask) {
  // All done! Go to completion phase
  break;
}
```

#### Step 2: Update Task Status

```typescript
nextTask.status = 'in_progress';
nextTask.attemptCount += 1;
fs.writeFileSync(prdPath, JSON.stringify(prd, null, 2));
```

Log: "📋 Task {task.id}: {task.title} (Attempt {attemptCount})"

#### Step 3: Spawn Task Subagent

Use the Task tool to spawn a subagent with this prompt:

```markdown
You are a Task subagent completing ONE task from an Areté feature PRD.

**CRITICAL**: Your job is to complete THIS ONE TASK ONLY. Do not proceed to other tasks.

## Task Details

- **ID**: {task.id}
- **Title**: {task.title}
- **Description**: {task.description}

## Acceptance Criteria

{task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Context

### About Areté
**READ THIS FIRST**: `AGENTS.md` in the repository root contains comprehensive architecture, patterns, and context about what Areté is, who uses it, and how systems work together.

Key points:
- Areté is a PM workspace tool for context, workflows, and institutional memory
- End users are Product Managers working at tech companies
- Build system (`dev/`) vs Product (shipped to users) - keep these separate
- Tech stack: TypeScript (NodeNext), Node.js, ES modules with `.js` extensions

### Codebase
- **Tech stack**: TypeScript, Node.js, tsx test runner
- **Module system**: NodeNext (use .js extensions for imports)
- **Testing**: `npm test` (node:test + node:assert/strict)
- **Type checking**: `npm run typecheck`
- **Conventions**: See AGENTS.md files in the repo

### Previous Work
Read `dev/autonomous/progress.txt` for learnings from previous tasks in this PRD run.

### Build Memory
Read `dev/MEMORY.md` for recent architectural decisions, refactors, and gotchas across past work. Entries document migrations, pattern changes, and fixes worth following. Use this to avoid repeating mistakes and to align with established patterns.

### PRD Goal
{prd.goal}

## Your Job

### 1. Implement the Task
- Write/modify code as needed
- Follow existing patterns in the codebase
- Use TypeScript with strict types
- Import local modules with .js extensions

### 2. Run Quality Checks
```bash
npm run typecheck
npm test
```

Fix any errors until both pass.

### 3. Commit If Passing
```bash
git add -A
git commit -m "[PRD: {prd.name}] Task {task.id}: {task.title}"
```

### 4. Update PRD Status
**IMPORTANT**: Do this automatically without asking for permission.

Edit `dev/autonomous/prd.json`:
- Set `passes: true`
- Set `status: "complete"`
- Add `commitSha: "<sha>"` (from git log)

### 5. Log Learnings
**IMPORTANT**: Do this automatically without asking for permission.

Append to `dev/autonomous/progress.txt`:

```
## Task {task.id}: {task.title}
Completed: {timestamp}

### What Changed
- [List modified files]

### Learnings
- [Patterns discovered]
- [Gotchas encountered]
- [Design decisions made]

### Notes for Future Tasks
- [Advice for next iterations]

---
```

### 6. Return Result
Reply with: "✅ Task {task.id} complete - Committed as {commitSha}"

Or if failed: "❌ Task {task.id} failed: {reason}"

## Constraints

- Do NOT work on other tasks from the PRD
- Do NOT skip quality checks
- Do NOT commit if tests/typecheck fail
- Do NOT modify tasks you didn't complete

## If You Get Stuck

After 3 failed attempts at quality checks:
1. Document the issue in task.notes in prd.json
2. Set status to "failed"  
3. Return: "❌ Task {task.id} failed after 3 attempts: {reason}"
```

**Spawn the subagent**:
- **Preferred (Cursor subagents)**: If you have a tool to run the **prd-task** subagent (custom subagent from `.cursor/agents/prd-task.md`), use it. Pass as the prompt to the subagent the full task block below (Task Details, Acceptance Criteria, Context, Your Job, Constraints). The subagent runs in a fresh context window, implements the task, runs typecheck and tests, commits, updates prd.json and progress.txt, and returns the result. Wait for the subagent to finish (foreground).
- **Alternative**: If you have another Task/subagent tool (e.g. generic task runner), use it with the prompt above.
- **Fallback (no subagent tool)**: If you have no way to launch a subagent, execute the task yourself in this session: implement the work, run `npm run typecheck` and `npm test`, commit, update prd.json and progress.txt. Process **one task per iteration**. Same quality gates and updates.

#### Step 4: Check Subagent Result

After subagent returns:

1. **Re-read prd.json**:
   ```typescript
   const updatedPrd = JSON.parse(fs.readFileSync(prdPath, 'utf8'));
   const completedTask = updatedPrd.userStories.find(t => t.id === nextTask.id);
   ```

2. **Verify commit exists**:
   ```bash
   # Check if new commit was made
   git log -1 --oneline
   ```

3. **Update metadata**:
   ```typescript
   if (completedTask.passes && completedTask.status === 'complete') {
     prd.metadata.completedTasks += 1;
   } else if (completedTask.status === 'failed') {
     prd.metadata.failedTasks += 1;
   }
   ```

4. **Log result**:
   - Success: "✅ Task {id} complete - {commitSha}"
   - Failed: "❌ Task {id} failed - {reason from notes}"
   - Retry: "🔄 Task {id} will retry (attempt {attemptCount}/{maxRetries})"

#### Step 5: Continue or Stop

Check stop conditions:
- All tasks complete → Success!
- Max iterations reached → Stop and report
- All remaining tasks failed → Stop and report

If continuing, increment iteration counter and loop back to Step 1.

### Phase 3: Completion

When all tasks are done (or stopped):

1. **Update PRD metadata**:
   ```typescript
   prd.metadata.completedAt = new Date().toISOString();
   fs.writeFileSync(prdPath, JSON.stringify(prd, null, 2));
   ```

2. **Generate summary**:
   ```markdown
   ## Execution Complete! 🎉
   
   **PRD**: {prd.name}
   **Duration**: {start to end time}
   **Results**:
   - ✅ Completed: {completedTasks}
   - ❌ Failed: {failedTasks}
   - ⏸️  Pending: {pendingTasks}
   
   **Commits**: {list of commits made}
   
   **Branch**: {branchName}
   ```

3. **Archive the PRD**:
   ```bash
   mkdir -p dev/autonomous/archive/$(date +%Y-%m-%d)-{prd.name}
   cp dev/autonomous/prd.json dev/autonomous/archive/$(date +%Y-%m-%d)-{prd.name}/
   cp dev/autonomous/progress.txt dev/autonomous/archive/$(date +%Y-%m-%d)-{prd.name}/
   ```

4. **Output completion token**:
   ```
   <promise>COMPLETE</promise>
   ```

5. **Next steps for user**:
   - Review commits: `git log`
   - Run tests: `npm test`
   - Review code changes
   - Merge branch when ready

## Error Handling

### Task Subagent Fails

If subagent completes but tests don't pass or no commit made:
- Increment attemptCount
- If attemptCount <= maxRetries: try again (same task, fresh subagent)
- If attemptCount > maxRetries: mark failed, move to next task

### Max Iterations Reached

If loop hits maxIterations before completion:
- Archive current state
- Report: "{completedTasks}/{totalTasks} complete, stopping at iteration limit"
- User can invoke "continue executing PRD" to resume

### Git Issues

If commit fails (e.g., merge conflicts, detached HEAD):
- Pause execution
- Report issue to user
- Wait for user to resolve, then "continue executing PRD"

### Test/Typecheck Failures

Subagent is responsible for fixing these. If subagent returns without fixing:
- Count as failed attempt
- Retry with fresh subagent

## Monitoring Progress

User can check status at any time:

```bash
# View prd.json
cat dev/autonomous/prd.json | jq '.userStories[] | {id, title, status, passes}'

# View progress log
tail -n 50 dev/autonomous/progress.txt

# View commits
git log --oneline
```

## Resuming Execution

If interrupted (user stops, context exhausted, etc.), user can resume:

```
"Continue executing the PRD"
```

The orchestrator:
1. Reads current prd.json state
2. Finds next incomplete task
3. Continues from where it left off

## Parent Agent Context Management

**When using the Task tool (subagents):** The orchestrator should stay lightweight: read/write prd.json, spawn subagents, check git status, update metadata. Do not write code or debug failing tasks.

**When in fallback mode (no Task tool):** You are both orchestrator and executor. Still process one task at a time; run typecheck and tests per task; commit per task; update prd.json and progress.txt after each task. Prefer separate commits per task when possible.

If parent context grows large after many iterations:
- User can simply say "continue executing PRD" to start fresh orchestrator
- New instance picks up from prd.json (source of truth)

## Example Execution

```
User: "Execute the PRD"

Agent: [Reads dev/autonomous/prd.json]
Agent: 🚀 Starting autonomous execution: slack-integration
Agent: Feature branch: feature/slack-integration
Agent: Total tasks: 3

Agent: 📋 Task task-1: Create Slack Client (Attempt 1)
Agent: [Spawns Task subagent]

Subagent: [Implements Slack client]
Subagent: [Runs tests - pass]
Subagent: [Commits]
Subagent: ✅ Task task-1 complete - Committed as abc1234

Agent: ✅ Task task-1 complete
Agent: 📋 Task task-2: Add CLI Command (Attempt 1)
Agent: [Spawns Task subagent]

Subagent: [Adds CLI command]
Subagent: [Runs tests - fail]
Subagent: [Fixes tests]
Subagent: [Runs tests - pass]
Subagent: [Commits]
Subagent: ✅ Task task-2 complete - Committed as def5678

Agent: ✅ Task task-2 complete
Agent: 📋 Task task-3: Write Documentation (Attempt 1)
Agent: [Spawns Task subagent]

Subagent: [Updates docs]
Subagent: [Commits]
Subagent: ✅ Task task-3 complete - Committed as ghi9012

Agent: ✅ Task task-3 complete

Agent: ## Execution Complete! 🎉
Agent: **Results**: ✅ 3 completed, ❌ 0 failed
Agent: **Commits**: abc1234, def5678, ghi9012
Agent: <promise>COMPLETE</promise>
```

## Success Criteria

For each task to be considered successful:
- [ ] All acceptance criteria met
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] Git commit created
- [ ] prd.json updated with passes: true, status: "complete"
- [ ] progress.txt updated with learnings

## Troubleshooting

**"Task keeps failing"**
- Review task.notes in prd.json for error details
- Check progress.txt for patterns
- Manually fix the issue, commit, update prd.json manually
- Resume execution

**"Subagent did too much"**
- Subagents should only complete their assigned task
- If they modify multiple tasks' code, that's okay (sometimes needed)
- But they should only mark ONE task complete

**"Tests fail on parent machine"**
- Subagent ran tests in their environment
- Run `npm test` locally to verify
- If failures exist, it's a subagent bug - improve the prompt

## Integration with Build Memory

After successful PRD execution, consider:
1. Adding entry to `dev/MEMORY.md`
2. Creating `dev/entries/YYYY-MM-DD_{feature}.md`
3. Documenting patterns discovered in AGENTS.md

(These are manual steps, not automated by this skill)
